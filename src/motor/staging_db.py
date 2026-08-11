"""Esquema y conexión de staging.sqlite — fuente de verdad incremental del
pipeline. Nada acá borra ni edita raw_records; toda corrección o fusión vive
en capas posteriores (normalized_records, clusters), así el dato crudo
original siempre queda disponible para auditar o reprocesar.

clusters está indexado por raw_record_id (no normalized_record_id): un
mismo raw_record nunca cambia de identidad, así que es la clave estable
para "a qué persona pertenece esta fila cruda", incluso si normalized_records
se recalcula en el futuro (ej. al mejorar un normalizador).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS fuentes_procesadas (
    ruta TEXT PRIMARY KEY,
    hash_sha256 TEXT NOT NULL,
    mtime REAL NOT NULL,
    tamano_bytes INTEGER NOT NULL,
    procesado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    raw_json TEXT NOT NULL,
    confianza_extraccion TEXT NOT NULL DEFAULT 'alta',
    creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_records_source ON raw_records(source_file);

CREATE TABLE IF NOT EXISTS normalized_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_record_id INTEGER NOT NULL REFERENCES raw_records(id),
    nombre TEXT,
    apellido TEXT,
    organizacion TEXT,
    cargo TEXT,
    telefonos_e164 TEXT NOT NULL DEFAULT '[]',
    telefonos_fijo_e164 TEXT NOT NULL DEFAULT '[]',
    emails TEXT NOT NULL DEFAULT '[]',
    domicilio TEXT,
    ciudad TEXT,
    provincia TEXT,
    pais TEXT,
    tag TEXT,
    notas TEXT,
    flags TEXT NOT NULL DEFAULT '[]',
    creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_normalized_raw ON normalized_records(raw_record_id);

CREATE TABLE IF NOT EXISTS telefono_index (
    normalized_record_id INTEGER NOT NULL REFERENCES normalized_records(id),
    e164 TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telefono_index_e164 ON telefono_index(e164);

CREATE TABLE IF NOT EXISTS email_index (
    normalized_record_id INTEGER NOT NULL REFERENCES normalized_records(id),
    email TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_index_email ON email_index(email);

CREATE TABLE IF NOT EXISTS clusters (
    raw_record_id INTEGER PRIMARY KEY REFERENCES raw_records(id),
    cluster_id TEXT NOT NULL,
    decidido_por TEXT NOT NULL,
    confianza REAL,
    corrida_id TEXT,
    actualizado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clusters_cluster_id ON clusters(cluster_id);
CREATE INDEX IF NOT EXISTS idx_clusters_corrida_id ON clusters(corrida_id);

CREATE TABLE IF NOT EXISTS decisiones_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id TEXT NOT NULL,
    raw_record_id_a INTEGER NOT NULL,
    raw_record_id_b INTEGER,
    accion TEXT NOT NULL,
    decidido_por TEXT NOT NULL,
    confianza REAL,
    detalle TEXT,
    corrida_id TEXT,
    creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisiones_log_accion ON decisiones_log(accion);
CREATE INDEX IF NOT EXISTS idx_decisiones_log_corrida_id ON decisiones_log(corrida_id);

CREATE TABLE IF NOT EXISTS aprendizaje_umbrales (
    patron TEXT PRIMARY KEY,
    total_decisiones INTEGER NOT NULL DEFAULT 0,
    total_aceptadas INTEGER NOT NULL DEFAULT 0,
    ajuste REAL NOT NULL DEFAULT 0.0,
    actualizado_en TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS busqueda_fts USING fts5(
    nombre, apellido, organizacion, telefonos, emails, notas
);

CREATE TABLE IF NOT EXISTS ediciones_manuales (
    cluster_id TEXT PRIMARY KEY,
    nombre TEXT,
    apellido TEXT,
    cargo TEXT,
    organizacion TEXT,
    tag TEXT,
    domicilio TEXT,
    ciudad TEXT,
    provincia TEXT,
    pais TEXT,
    notas TEXT,
    actualizado_en TEXT NOT NULL
);
"""

# Columnas sumadas después de la creación original de ediciones_manuales
# (edición manual de WhatsApp/Teléfono fijo/Email desde el revisor web).
# CREATE TABLE IF NOT EXISTS no alcanza para bases ya existentes (la real,
# Data/Salida/staging.sqlite, ya tenía la tabla vieja) — se agregan con
# ALTER TABLE, una sola vez, chequeando antes si ya están.
_COLUMNAS_NUEVAS_EDICIONES_MANUALES = {
    "whatsapp_json": "TEXT",
    "telefono_fijo_json": "TEXT",
    "emails_json": "TEXT",
}


def conectar(path: str | Path) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    crear_esquema(conn)
    return conn


def crear_esquema(conn: sqlite3.Connection) -> None:
    conn.executescript(_ESQUEMA)
    _migrar_columnas_nuevas(conn)
    conn.commit()


def _migrar_columnas_nuevas(conn: sqlite3.Connection) -> None:
    existentes = {fila["name"] for fila in conn.execute("PRAGMA table_info(ediciones_manuales)")}
    for columna, tipo in _COLUMNAS_NUEVAS_EDICIONES_MANUALES.items():
        if columna not in existentes:
            conn.execute(f"ALTER TABLE ediciones_manuales ADD COLUMN {columna} {tipo}")
