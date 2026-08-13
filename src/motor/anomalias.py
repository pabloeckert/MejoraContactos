"""Detección de anomalías sobre la lista maestra ya deduplicada — Ficha
9.2 de la encuesta original: "Alerta si aparece algo raro (ej: un
teléfono con muchísimos nombres distintos)".

No es aprendizaje automático: es una regla simple y auditable (contar
cuántos contactos FINALES -- ya pasados por dedup -- comparten un mismo
número) sobre datos personales reales, donde la explicabilidad importa más
que la sofisticación. Un teléfono compartido por 2-3 personas es normal
(una familia, una oficina chica); por muchas más es la señal típica de un
número de conmutador/call center guardado como si fuera de una persona, o
de un error de carga que pegó el mismo número en contactos sin relación."""

from __future__ import annotations

import sqlite3
from collections import defaultdict

_UMBRAL_DEFAULT = 5


def detectar_telefonos_sospechosos(conn: sqlite3.Connection, umbral: int = _UMBRAL_DEFAULT) -> list[dict]:
    """Devuelve una lista de {telefono, cantidad, nombres} para cada
    teléfono (WhatsApp o fijo) que aparece en más de `umbral` contactos
    FINALES distintos (ya deduplicados -- no cuenta duplicados que el
    propio motor ya fusionó)."""
    import json

    filas = conn.execute(
        "SELECT c.cluster_id, n.nombre, n.apellido, n.telefonos_e164, n.telefonos_fijo_e164 "
        "FROM clusters c "
        "JOIN raw_records r ON r.id = c.raw_record_id "
        "JOIN normalized_records n ON n.raw_record_id = r.id"
    ).fetchall()

    telefono_a_clusters: dict[str, dict[str, str]] = defaultdict(dict)
    for fila in filas:
        nombre = f"{fila['nombre'] or ''} {fila['apellido'] or ''}".strip() or "(sin nombre)"
        for telefono in json.loads(fila["telefonos_e164"]) + json.loads(fila["telefonos_fijo_e164"]):
            telefono_a_clusters[telefono][fila["cluster_id"]] = nombre

    anomalias = [
        {"telefono": telefono, "cantidad": len(clusters), "nombres": sorted(set(clusters.values()))}
        for telefono, clusters in telefono_a_clusters.items()
        if len(clusters) > umbral
    ]
    anomalias.sort(key=lambda a: -a["cantidad"])
    return anomalias
