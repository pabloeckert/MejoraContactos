"""Genera candidatos a comparar (pares de normalized_record.id) sin hacer
O(n²) sobre todos los contactos: agrupa por señal exacta (mismo teléfono,
mismo email) o por una clave fonética aproximada de nombre+apellido, y solo
compara pares dentro de cada bloque."""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from itertools import combinations

_TOPE_BLOQUE_DEFAULT = 500


def generar_candidatos(conn: sqlite3.Connection, tope_bloque: int = _TOPE_BLOQUE_DEFAULT) -> set[tuple[int, int]]:
    candidatos: set[tuple[int, int]] = set()
    candidatos |= _pares_por_columna(conn, "telefono_index", "e164", tope_bloque)
    candidatos |= _pares_por_columna(conn, "email_index", "email", tope_bloque)
    candidatos |= _pares_por_nombre(conn, tope_bloque)
    return candidatos


def _pares_por_columna(
    conn: sqlite3.Connection, tabla: str, columna: str, tope_bloque: int
) -> set[tuple[int, int]]:
    filas = conn.execute(f"SELECT normalized_record_id, {columna} AS clave FROM {tabla}").fetchall()
    bloques: dict[str, list[int]] = defaultdict(list)
    for fila in filas:
        bloques[fila["clave"]].append(fila["normalized_record_id"])
    return _expandir_bloques(bloques, tope_bloque)


def _pares_por_nombre(conn: sqlite3.Connection, tope_bloque: int) -> set[tuple[int, int]]:
    filas = conn.execute(
        "SELECT id, nombre, apellido FROM normalized_records "
        "WHERE (nombre IS NOT NULL AND nombre != '') OR (apellido IS NOT NULL AND apellido != '')"
    ).fetchall()
    bloques: dict[str, list[int]] = defaultdict(list)
    for fila in filas:
        clave = _clave_fonetica(fila["nombre"], fila["apellido"])
        if clave:
            bloques[clave].append(fila["id"])
    return _expandir_bloques(bloques, tope_bloque)


def _clave_fonetica(nombre: str | None, apellido: str | None) -> str | None:
    apellido_norm = (apellido or "").strip().lower()
    inicial_nombre = (nombre or "").strip().lower()[:1]
    if not apellido_norm:
        return None
    return f"{apellido_norm}|{inicial_nombre}"


def _expandir_bloques(bloques: dict[str, list[int]], tope_bloque: int) -> set[tuple[int, int]]:
    pares: set[tuple[int, int]] = set()
    for ids in bloques.values():
        # Bloque gigante (ej. muchos contactos con el mismo apellido común)
        # -> no expandir a O(n²); ese bloque se pierde para blocking por
        # nombre, pero teléfono/email exactos igual lo capturan si aplica.
        if len(ids) < 2 or len(ids) > tope_bloque:
            continue
        pares.update(combinations(sorted(set(ids)), 2))
    return pares
