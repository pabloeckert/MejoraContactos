"""Ajuste de umbrales por patrón de señales (ver dedup/scoring.py). Cada
decisión humana o de LLM se acumula en aprendizaje_umbrales por patrón;
cuando un patrón junta evidencia suficiente, su ajuste se aplica al score
de scoring.py para ese patrón específico, dentro de un rango acotado —
nunca se sale de las bandas globales de config.dedup, para que el
aprendizaje afine el criterio en vez de reemplazar la salvaguarda.

No es un modelo de ML: con el volumen de señal disponible (miles de
decisiones, no millones), un conteo simple de tasa de aceptación por
patrón es más auditable y suficiente — importante tratándose de datos
personales reales."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

_EVIDENCIA_MINIMA = 15
_AJUSTE_MAXIMO = 0.1


def registrar_decision(conn: sqlite3.Connection, patron: str, aceptada: bool) -> None:
    conn.execute(
        "INSERT INTO aprendizaje_umbrales (patron, total_decisiones, total_aceptadas, ajuste, actualizado_en) "
        "VALUES (?, 1, ?, 0.0, ?) "
        "ON CONFLICT(patron) DO UPDATE SET "
        "total_decisiones = total_decisiones + 1, "
        "total_aceptadas = total_aceptadas + ?, "
        "actualizado_en = ?",
        (patron, int(aceptada), _ahora(), int(aceptada), _ahora()),
    )
    _recalcular_ajuste(conn, patron)
    conn.commit()


def _recalcular_ajuste(conn: sqlite3.Connection, patron: str) -> None:
    fila = conn.execute(
        "SELECT total_decisiones, total_aceptadas FROM aprendizaje_umbrales WHERE patron = ?",
        (patron,),
    ).fetchone()
    if fila is None or fila["total_decisiones"] < _EVIDENCIA_MINIMA:
        return
    tasa_aceptacion = fila["total_aceptadas"] / fila["total_decisiones"]
    # tasa 1.0 (siempre se confirma la fusión) -> ajuste positivo máximo;
    # tasa 0.0 (siempre se rechaza) -> ajuste negativo máximo.
    ajuste = (tasa_aceptacion - 0.5) * 2 * _AJUSTE_MAXIMO
    conn.execute("UPDATE aprendizaje_umbrales SET ajuste = ? WHERE patron = ?", (ajuste, patron))


def obtener_ajuste(conn: sqlite3.Connection, patron: str) -> float:
    fila = conn.execute(
        "SELECT ajuste FROM aprendizaje_umbrales WHERE patron = ?", (patron,)
    ).fetchone()
    return fila["ajuste"] if fila else 0.0


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()
