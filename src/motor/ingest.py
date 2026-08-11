"""Orquestador de extracción: camina carpeta_raiz, despacha cada archivo al
extractor de su extensión, y salta los archivos que no cambiaron desde la
última corrida (por hash) — así una corrida recurrente de `motor extraer`
solo procesa lo nuevo. Esto es lo que hace que la herramienta sirva para
mantenimiento continuo y no sea un script de una sola corrida.

Cada extractor corre dentro de un try/except: los extractores de Fase 3
(OCR, PDF) dependen de librerías/binarios externos (Tesseract) que pueden
no estar instalados, o de archivos corruptos/no soportados — un archivo
problemático no debe tirar abajo la extracción del resto de la carpeta."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import motor.extractors  # noqa: F401 — importa y registra todos los extractores
from motor.config import Config
from motor.extractors.base import extractor_para


def extraer_todo(config: Config, conn: sqlite3.Connection) -> int:
    """Devuelve la cantidad de raw_records nuevos insertados."""
    total_insertados = 0
    for path in sorted(config.rutas.carpeta_raiz.rglob("*")):
        if not path.is_file():
            continue
        extension = path.suffix.lstrip(".").lower()
        if extension not in config.extensiones_permitidas:
            continue
        extractor = extractor_para(extension)
        if extractor is None:
            continue
        if _ya_procesado(conn, path):
            continue

        try:
            registros = extractor(path)
        except Exception as exc:  # noqa: BLE001 — un archivo problemático no debe frenar el resto
            print(f"aviso: no se pudo extraer {path} ({exc}); se sigue con el resto")
            continue

        for r in registros:
            conn.execute(
                "INSERT INTO raw_records "
                "(source_file, source_row, raw_json, confianza_extraccion, creado_en) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    r.source_file,
                    r.source_row,
                    json.dumps(r.campos, ensure_ascii=False),
                    r.confianza_extraccion,
                    _ahora(),
                ),
            )
        _marcar_procesado(conn, path)
        conn.commit()
        total_insertados += len(registros)
    return total_insertados


def _ya_procesado(conn: sqlite3.Connection, path: Path) -> bool:
    fila = conn.execute(
        "SELECT hash_sha256 FROM fuentes_procesadas WHERE ruta = ?", (str(path),)
    ).fetchone()
    if fila is None:
        return False
    return fila["hash_sha256"] == _hash_archivo(path)


def _marcar_procesado(conn: sqlite3.Connection, path: Path) -> None:
    stat = path.stat()
    conn.execute(
        "INSERT INTO fuentes_procesadas (ruta, hash_sha256, mtime, tamano_bytes, procesado_en) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(ruta) DO UPDATE SET "
        "hash_sha256=excluded.hash_sha256, mtime=excluded.mtime, "
        "tamano_bytes=excluded.tamano_bytes, procesado_en=excluded.procesado_en",
        (str(path), _hash_archivo(path), stat.st_mtime, stat.st_size, _ahora()),
    )


def _hash_archivo(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()
