"""Ingesta masiva de los 10 directorios de OneDrive en staging.sqlite
Seguido de normalización completa, deduplicación asistida y exportación final.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Añadir motor al path
sys.path.insert(0, r"C:\github\MejoraContactos\motor-contactos\src")

from motor.config import cargar_config
from motor.dedup.merge_engine import deduplicar_todo
from motor.export import exportar_lista_maestra, exportar_whatsapp_csv
from motor.extractors.universal_scanner import (
    EXTENSIONES_SOPORTADAS,
    _hash_archivo,
    _marcar_procesado,
    _ya_procesado,
    extraer_archivo_universal,
)
from motor.normalize_pipeline import normalizar_todo

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("ingesta_masiva")

RUTAS_ONEDRIVE = [
    r"C:\Users\tabeg\OneDrive\MEJORA CONTINUA\12. Base de Datos",
    r"C:\Users\tabeg\OneDrive\REF",
    r"C:\Users\tabeg\OneDrive\MEJORA CONTINUA\4. Eventos",
    r"C:\Users\tabeg\OneDrive\MEJORA CONTINUA\1. 2026",
    r"C:\Users\tabeg\OneDrive\MEJORA CONTINUA\1. 2025",
    r"C:\Users\tabeg\OneDrive\MEJORA CONTINUA\2. 2024",
    r"C:\Users\tabeg\OneDrive\MEJORA CONTINUA\3. IN COMPANY",
    r"C:\Users\tabeg\OneDrive\MEJORA CONTINUA\SindyBackupPocoX3",
    r"C:\Users\tabeg\OneDrive\MEJORA CONTINUA\VENDEMASSOLUCIONES",
    r"C:\Users\tabeg\OneDrive\REGISTRO MODELO",
]


def ejecutar_ingesta_total():
    config = cargar_config(r"C:\github\MejoraContactos\motor-contactos\config.yaml")
    db_path = config.rutas.base_sqlite
    logger.info(f"Conectando a base staging: {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")

    # Contadores
    total_archivos_encontrados = 0
    total_archivos_procesados = 0
    total_archivos_omitidos = 0
    total_raw_nuevos = 0
    t0 = time.time()

    logger.info("=== PASO 1: RECORRIDO E INGESTA DE DIRECTORIOS ONEDRIVE ===")
    for ruta_str in RUTAS_ONEDRIVE:
        carpeta = Path(ruta_str)
        if not carpeta.exists():
            logger.warning(f"Ruta no existe, omitiendo: {carpeta}")
            continue

        archivos_carpeta = []
        for root, _dirs, files in os.walk(carpeta):
            for f in files:
                if f.startswith("~$") or f.startswith("."):
                    continue
                p = Path(root) / f
                if p.suffix.lower() in EXTENSIONES_SOPORTADAS:
                    archivos_carpeta.append(p)

        archivos_carpeta.sort()
        logger.info(f"Directorio: {carpeta.name} -> {len(archivos_carpeta)} archivos candidatos")
        total_archivos_encontrados += len(archivos_carpeta)

        for p in archivos_carpeta:
            if _ya_procesado(conn, p):
                total_archivos_omitidos += 1
                continue

            try:
                registros = extraer_archivo_universal(p)
                if registros:
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
                                datetime.now(timezone.utc).isoformat(),
                            ),
                        )
                    total_raw_nuevos += len(registros)
                    logger.info(f"  + {p.name}: {len(registros)} registros crudos")

                _marcar_procesado(conn, p)
                conn.commit()
                total_archivos_procesados += 1
            except Exception as exc:
                logger.error(f"  X Error procesando {p.name}: {exc}")

    t1 = time.time()
    logger.info(f"Ingesta finalizada en {t1-t0:.1f}s.")
    logger.info(
        f"Archivos candidatos: {total_archivos_encontrados} | "
        f"Procesados nuevos: {total_archivos_procesados} | "
        f"Omitidos (sin cambios): {total_archivos_omitidos} | "
        f"Nuevos raw_records: {total_raw_nuevos}"
    )

    total_raw_actual = conn.execute("SELECT COUNT(*) FROM raw_records").fetchone()[0]
    logger.info(f"Total raw_records acumulados en base: {total_raw_actual}")

    logger.info("\n=== PASO 2: NORMALIZACIÓN CON REGLAS BLINDADAS DE CALIDAD ===")
    t_norm0 = time.time()
    # Si hay registros viejos normalizados con apellidos contaminados (ej. 'Ar' o 'Com'),
    # limpiamos normalized_records para regenerar con las nuevas reglas
    conn.execute("DELETE FROM normalized_records")
    conn.execute("DELETE FROM telefono_index")
    conn.execute("DELETE FROM email_index")
    conn.execute("DELETE FROM personas")
    conn.execute("DELETE FROM clusters")
    conn.execute("DELETE FROM decisiones_log")
    conn.commit()
    logger.info("Tablas normalizadas reseteadas para garantizar máxima pureza total.")

    norm_total = normalizar_todo(config, conn)
    t_norm1 = time.time()
    logger.info(f"Normalización completada: {norm_total} registros normalizados en {t_norm1-t_norm0:.1f}s")

    logger.info("\n=== PASO 3: DEDUPLICACIÓN ASISTIDA CON SALVAGUARDAS ESTRICTAS ===")
    t_dedup0 = time.time()
    res_dedup = deduplicar_todo(config, conn, continuar=False)
    t_dedup1 = time.time()
    logger.info(f"Deduplicación completada en {t_dedup1-t_dedup0:.1f}s: {res_dedup}")

    total_personas = conn.execute("SELECT COUNT(*) FROM personas").fetchone()[0]
    logger.info(f"Total personas consolidadas únicas: {total_personas}")

    logger.info("\n=== PASO 4: GENERACIÓN DE ARCHIVOS MAESTROS DE SALIDA ===")
    ruta_export = exportar_lista_maestra(config, conn)
    ruta_wa = exportar_whatsapp_csv(config, conn)
    logger.info(f"Lista Maestra XLSX generada: {ruta_export}")
    logger.info(f"CSV para WhatsApp generado: {ruta_wa}")

    # Auditoría de calidad de clusters
    c = conn.cursor()
    max_cluster = c.execute(
        "SELECT persona_id, COUNT(*) as cnt FROM clusters GROUP BY persona_id ORDER BY cnt DESC LIMIT 5"
    ).fetchall()
    logger.info("\n=== TOP 5 CLUSTERS DE MAYOR TAMAÑO (VERIFICACIÓN DE PUREZA) ===")
    for row in max_cluster:
        pid, cnt = row[0], row[1]
        recs = c.execute(
            "SELECT n.nombre, n.apellido, n.organizacion, n.telefonos_e164, n.emails "
            "FROM clusters cl JOIN normalized_records n ON cl.raw_record_id = n.raw_record_id "
            "WHERE cl.persona_id = ? LIMIT 3",
            (pid,),
        ).fetchall()
        logger.info(f"Persona {pid} ({cnt} registros):")
        for r in recs:
            logger.info(f"   {r[0]} {r[1]} | Org: {r[2]} | Tel: {r[3]} | Email: {r[4]}")

    conn.close()
    logger.info("\n>>> PROCESO DE INGESTA, DEPURACIÓN Y EXPORTACIÓN COMPLETADO CON ÉXITO <<<")


if __name__ == "__main__":
    ejecutar_ingesta_total()
