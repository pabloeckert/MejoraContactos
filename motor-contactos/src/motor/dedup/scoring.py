"""Score de confianza 0-1 de que dos normalized_records son la misma
persona, combinando señales exactas (teléfono, email) y aproximadas
(similitud de nombre, organización). Los pesos vienen de config.dedup."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass

from rapidfuzz import fuzz

from motor.config import DedupConfig

# Debajo de esta similitud, dos nombres completos (ambos presentes) se
# consideran "claramente distintos" — ver calcular_score. Encontrado
# corriendo contra pablo.csv/Sindy.csv reales: sin esta salvaguarda, un
# teléfono fijo compartido por una familia/oficina fusionaba
# automáticamente a personas con nombre y apellido completamente distintos
# (ej. "María Graciela Rolon" con "Daniel Alfredo Altamira González").
_UMBRAL_NOMBRE_CLARAMENTE_DISTINTO = 0.5


@dataclass(frozen=True)
class RegistroParaScoring:
    id: int
    nombre: str | None
    apellido: str | None
    organizacion: str | None
    telefonos: frozenset[str]
    emails: frozenset[str]


def cargar_registro(conn: sqlite3.Connection, normalized_id: int) -> RegistroParaScoring:
    fila = conn.execute(
        "SELECT id, nombre, apellido, organizacion, telefonos_e164, telefonos_fijo_e164, emails "
        "FROM normalized_records WHERE id = ?",
        (normalized_id,),
    ).fetchone()
    # Para matching, móvil y fijo son la misma señal ("¿comparten un
    # teléfono?") — la distinción solo importa al exportar (Whatsapp vs
    # Teléfono Fijo son columnas separadas en export.py).
    telefonos = set(json.loads(fila["telefonos_e164"])) | set(json.loads(fila["telefonos_fijo_e164"]))
    return RegistroParaScoring(
        id=fila["id"],
        nombre=fila["nombre"],
        apellido=fila["apellido"],
        organizacion=fila["organizacion"],
        telefonos=frozenset(telefonos),
        emails=frozenset(json.loads(fila["emails"])),
    )


def _primeros_nombres_compatibles(nom_a: str | None, nom_b: str | None) -> bool:
    """Verifica si los nombres de pila son compatibles (no contradictorios)."""
    if not nom_a or not nom_b:
        return True
    a = nom_a.strip().lower()
    b = nom_b.strip().lower()
    if not a or not b or a == b:
        return True
    # Iniciales (ej. 'J' para 'Juan', 'M' para 'Maria')
    if (len(a) == 1 and b.startswith(a)) or (len(b) == 1 and a.startswith(b)):
        return True
    # Prefijos o nombres compuestos
    if a.startswith(b) or b.startswith(a):
        return True
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if tokens_a & tokens_b:
        return True
    # Diminutivos o typos cercanos
    return fuzz.ratio(a, b) >= 65.0


def calcular_score(
    a: RegistroParaScoring, b: RegistroParaScoring, config: DedupConfig
) -> tuple[float, str]:
    """Devuelve (score, patron). El patrón identifica qué señales
    coincidieron (ver _bucket) y es la clave que usa dedup/learning.py para
    ajustar el score de casos futuros con el mismo patrón."""
    telefono_exacto = bool(a.telefonos & b.telefonos)
    email_exacto = bool(a.emails & b.emails)
    nombre_sim = _similitud_nombre(a, b)
    organizacion_sim = _similitud_organizacion(a, b)

    score = (
        config.pesos.telefono_exacto * telefono_exacto
        + config.pesos.email_exacto * email_exacto
        + config.pesos.nombre_similitud * nombre_sim
        + config.pesos.organizacion * organizacion_sim
    )

    # Salvaguardas estrictas anti falsos positivos y anti over-clustering
    nombres_compatibles = _primeros_nombres_compatibles(a.nombre, b.nombre)
    nombres_claramente_distintos = (
        (_ambos_con_nombre(a, b) and nombre_sim < _UMBRAL_NOMBRE_CLARAMENTE_DISTINTO)
        or not nombres_compatibles
    )

    # Si NO tienen teléfono NI email en común:
    if not telefono_exacto and not email_exacto:
        # Si los nombres de pila chocan abiertamente (ej. 'Maitén Ayala' vs 'Mauricio Ayala')
        if not nombres_compatibles:
            score = 0.0
        else:
            # Solo permitir auto-fusión (1.0) si AMBOS tienen nombre y apellido completos y coinciden
            ambos_completos = bool(a.nombre and a.apellido and b.nombre and b.apellido)
            if ambos_completos and nombre_sim >= 0.85:
                score = 1.0
            elif not ambos_completos and nombre_sim >= 0.80:
                # Nombre incompleto (solo apellido o solo nombre) sin teléfono/email NO puede auto-fusionar
                score = min(score, 0.45)
    else:
        # Tienen teléfono o email en común
        if not nombres_claramente_distintos:
            score = 1.0

    patron = (
        f"tel={'si' if telefono_exacto else 'no'}"
        f"|mail={'si' if email_exacto else 'no'}"
        f"|nombre={_bucket(nombre_sim)}"
        f"{'|nombres_distintos' if nombres_claramente_distintos else ''}"
    )
    return min(score, 1.0), patron


def _ambos_con_nombre(a: RegistroParaScoring, b: RegistroParaScoring) -> bool:
    return _tiene_nombre(a) and _tiene_nombre(b)


def _tiene_nombre(reg: RegistroParaScoring) -> bool:
    return bool((reg.nombre or "").strip() or (reg.apellido or "").strip())


def _similitud_nombre(a: RegistroParaScoring, b: RegistroParaScoring) -> float:
    nombre_a = f"{a.nombre or ''} {a.apellido or ''}".strip().lower()
    nombre_b = f"{b.nombre or ''} {b.apellido or ''}".strip().lower()
    if not nombre_a or not nombre_b:
        return 0.0
    return fuzz.WRatio(nombre_a, nombre_b) / 100.0


def _similitud_organizacion(a: RegistroParaScoring, b: RegistroParaScoring) -> float:
    if not a.organizacion or not b.organizacion:
        return 0.0
    return fuzz.WRatio(a.organizacion.lower(), b.organizacion.lower()) / 100.0


def _bucket(valor: float) -> str:
    if valor >= 0.85:
        return "alta"
    if valor >= 0.6:
        return "media"
    return "baja"
