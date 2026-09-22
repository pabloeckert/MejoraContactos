"""Escáner Universal de Documentos para MejoraContactos:
Recorre carpetas recursivamente (directorios locales o unidades de Google Drive),
lee tablas (.csv, .xlsx, .xls, .tsv, .ods) y texto (.docx, .pdf, .txt, .md),
y captura atributos dinámicos descubiertos para almacenamiento elástico.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from motor.config import Config
from motor.dedup.merge_engine import deduplicar_todo
from motor.export import exportar_lista_maestra, exportar_whatsapp_csv
from motor.extractors.base import RawContactRecord
from motor.extractors.column_mapping import mapear_columnas
from motor.extractors.freetext_extractor import extraer_contactos_de_texto
from motor.normalize_pipeline import normalizar_todo

logger = logging.getLogger(__name__)

EXTENSIONES_TABLA = {".csv", ".tsv", ".xlsx", ".xls", ".ods"}
EXTENSIONES_TEXTO = {".docx", ".pdf", ".txt", ".md", ".log"}
EXTENSIONES_CONTACTOS = {".vcf"}
EXTENSIONES_SOPORTADAS = EXTENSIONES_TABLA | EXTENSIONES_TEXTO | EXTENSIONES_CONTACTOS


def _hash_archivo(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


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
        (str(path), _hash_archivo(path), stat.st_mtime, stat.st_size, datetime.now(timezone.utc).isoformat()),
    )


def escanear_directorio(
    ruta: str | Path,
    config: Config,
    conn: sqlite3.Connection,
    callback_progreso: Any = None,
) -> dict[str, Any]:
    """Recorre `ruta` recursivamente, extrae contactos estructurados y texto libre,
    captura atributos elásticos y ejecuta el pipeline de normalización y deduplicación.
    Devuelve un informe con métricas de la corrida."""
    carpeta = Path(ruta).resolve()
    if not carpeta.exists():
        raise FileNotFoundError(f"La ruta especificada no existe: {carpeta}")
    if not carpeta.is_dir():
        raise NotADirectoryError(f"La ruta debe ser un directorio: {carpeta}")

    archivos_analizados = 0
    formatos_detectados: dict[str, int] = {}
    total_raw_nuevos = 0
    atributos_descubiertos: set[str] = set()

    archivos_candidatos: list[Path] = []
    for root, _dirs, files in os.walk(carpeta):
        for f in sorted(files):
            if f.startswith("~$") or f.startswith("."):
                continue
            p = Path(root) / f
            if p.suffix.lower() in EXTENSIONES_SOPORTADAS:
                archivos_candidatos.append(p)
    archivos_candidatos.sort()
    total_archivos = len(archivos_candidatos)

    if callback_progreso:
        try:
            callback_progreso("inicio", {
                "ruta": str(carpeta),
                "archivos_totales": total_archivos,
                "mensaje": f"Explorando subcarpetas en: {carpeta}",
            })
            if archivos_candidatos:
                try:
                    lista_relativa = [str(p.relative_to(carpeta)).replace("\\", "/") for p in archivos_candidatos]
                except ValueError:
                    lista_relativa = [p.name for p in archivos_candidatos]
                callback_progreso("archivos_encontrados", {
                    "ruta": str(carpeta),
                    "archivos_totales": total_archivos,
                    "mensaje": f"Archivos encontrados ({total_archivos}): {', '.join(lista_relativa)}",
                })
            else:
                callback_progreso("archivos_encontrados", {
                    "ruta": str(carpeta),
                    "archivos_totales": 0,
                    "mensaje": f"No se encontraron archivos soportados en las subcarpetas de: {carpeta}",
                })
        except Exception:
            pass

    for idx, path in enumerate(archivos_candidatos):
        ext = path.suffix.lower()
        formatos_detectados[ext] = formatos_detectados.get(ext, 0) + 1
        archivos_analizados += 1

        if _ya_procesado(conn, path):
            if callback_progreso:
                try:
                    callback_progreso("archivo_omitido", {
                        "archivo": path.name,
                        "indice": idx + 1,
                        "totales": total_archivos,
                        "mensaje": f"Omitido '{path.name}' (sin cambios desde el último escaneo)",
                    })
                except Exception:
                    pass
            continue

        if callback_progreso:
            try:
                callback_progreso("archivo_inicio", {
                    "archivo": path.name,
                    "indice": idx + 1,
                    "totales": total_archivos,
                    "mensaje": f"Extrayendo datos de '{path.name}' ({idx + 1}/{total_archivos})...",
                })
            except Exception:
                pass

        try:
            registros = extraer_archivo_universal(path)
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
                if "atributos_dinamicos" in r.campos:
                    try:
                        dinamicos = json.loads(r.campos["atributos_dinamicos"])
                        atributos_descubiertos.update(dinamicos.keys())
                    except Exception:
                        pass

            _marcar_procesado(conn, path)
            conn.commit()
            total_raw_nuevos += len(registros)

            if callback_progreso:
                try:
                    callback_progreso("archivo_fin", {
                        "archivo": path.name,
                        "indice": idx + 1,
                        "totales": total_archivos,
                        "raw_nuevos": len(registros),
                        "total_raw": total_raw_nuevos,
                        "mensaje": f"✓ '{path.name}': {len(registros)} registros crudos extraídos",
                    })
                except Exception:
                    pass
        except Exception as exc:
            logger.warning("Error escaneando %s: %s", path, exc)
            if callback_progreso:
                try:
                    callback_progreso("archivo_error", {
                        "archivo": path.name,
                        "indice": idx + 1,
                        "totales": total_archivos,
                        "error": str(exc),
                        "mensaje": f"⚠️ Error en '{path.name}': {exc}",
                    })
                except Exception:
                    pass

    # Procesar etapas subsecuentes con los nuevos datos
    if callback_progreso:
        try:
            callback_progreso("normalizando", {
                "mensaje": "Normalizando contactos, aplicando filtros de calidad y separando entidades...",
            })
        except Exception:
            pass

    norm_nuevos = normalizar_todo(config, conn)

    if callback_progreso:
        try:
            callback_progreso("deduplicando", {
                "mensaje": "Ejecutando deduplicación y clusters (prioridad regente Sindy)...",
            })
        except Exception:
            pass

    res_dedup = deduplicar_todo(config, conn)

    if callback_progreso:
        try:
            callback_progreso("exportando", {
                "mensaje": "Exportando lista maestra y formato WhatsApp...",
            })
        except Exception:
            pass

    ruta_export = exportar_lista_maestra(config, conn)
    ruta_wa = exportar_whatsapp_csv(config, conn)

    # Conteo de personas unificadas
    total_personas = conn.execute("SELECT COUNT(*) FROM personas").fetchone()[0]

    resultado = {
        "ruta_escaneada": str(carpeta),
        "archivos_analizados": archivos_analizados,
        "formatos_detectados": formatos_detectados,
        "raw_records_nuevos": total_raw_nuevos,
        "normalized_records_nuevos": norm_nuevos,
        "deduplicacion": res_dedup,
        "total_personas_unificadas": total_personas,
        "atributos_dinamicos_descubiertos": sorted(atributos_descubiertos),
        "archivos_salida": {
            "lista_maestra": str(ruta_export),
            "whatsapp_csv": str(ruta_wa),
        },
    }

    if callback_progreso:
        try:
            callback_progreso("completado", {
                "resultado": resultado,
                "mensaje": f"✅ Escaneo finalizado con éxito ({total_personas} personas unificadas)",
            })
        except Exception:
            pass

    return resultado


def extraer_archivo_universal(path: Path) -> list[RawContactRecord]:
    """Punto de entrada unitario para extraer contactos y atributos elásticos de cualquier archivo."""
    ext = path.suffix.lower()
    if ext in (".csv", ".tsv"):
        return _extraer_delimitado(path, separador="\t" if ext == ".tsv" else ",")
    elif ext in (".xlsx", ".xls", ".ods"):
        return _extraer_planilla_elastica(path)
    elif ext == ".docx":
        return _extraer_docx_completo(path)
    elif ext == ".pdf":
        return _extraer_pdf_completo(path)
    elif ext == ".vcf":
        from motor.extractors.vcard_extractor import extraer_vcf
        return extraer_vcf(path)
    elif ext in (".txt", ".md", ".log"):
        return _extraer_texto_con_metadata(path)
    return []


class UniversalScanner:
    """Escáner Universal de Carpetas y Documentos con recorrido recursivo."""

    @staticmethod
    def escanear_directorio(
        ruta: str | Path,
        config: Config,
        conn: sqlite3.Connection,
        callback_progreso: Any = None,
    ) -> dict[str, Any]:
        return escanear_directorio(ruta, config, conn, callback_progreso=callback_progreso)


def _extraer_delimitado(path: Path, separador: str = ",") -> list[RawContactRecord]:
    registros: list[RawContactRecord] = []
    # Detección de encoding
    contenido = None
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            with path.open("r", encoding=enc) as f:
                contenido = f.read()
            break
        except UnicodeDecodeError:
            continue

    if not contenido:
        return []

    lineas = contenido.splitlines()
    if not lineas:
        return []

    # Detectar delimitador si es CSV
    if separador == ",":
        primera_linea = lineas[0]
        if primera_linea.count(";") > primera_linea.count(","):
            separador = ";"
        elif primera_linea.count("\t") > primera_linea.count(","):
            separador = "\t"

    lector = csv.DictReader(lineas, delimiter=separador)
    if not lector.fieldnames:
        return []

    encabezados = [str(f or "").strip() for f in lector.fieldnames if f]
    mapa = mapear_columnas(encabezados)

    for i, fila in enumerate(lector, start=2):
        campos: dict[str, str] = {}
        dinamicos: dict[str, str] = {}

        for encabezado, valor_raw in fila.items():
            if not encabezado or valor_raw is None:
                continue
            valor = str(valor_raw).strip()
            if not valor:
                continue

            clave_canonica = mapa.get(encabezado)
            if clave_canonica:
                campos[clave_canonica] = valor
            else:
                # Atributo dinámico no mapeado
                col_normalizada = encabezado.strip().lower()
                dinamicos[col_normalizada] = valor

        tiene_senal_contacto = any(k in campos for k in ("nombre", "nombre_completo", "apellido", "telefono_1", "email_1", "organizacion"))
        if tiene_senal_contacto:
            if dinamicos:
                campos["atributos_dinamicos"] = json.dumps(dinamicos, ensure_ascii=False)
            registros.append(RawContactRecord(str(path), i, campos, confianza_extraccion="alta"))

    return registros


def _extraer_planilla_elastica(path: Path) -> list[RawContactRecord]:
    registros: list[RawContactRecord] = []
    import pandas as pd

    try:
        excel = pd.ExcelFile(path)
    except Exception as exc:
        logger.warning("No se pudo abrir Excel %s: %s", path, exc)
        return []

    for nombre_hoja in excel.sheet_names:
        try:
            df = excel.parse(nombre_hoja, dtype=str)
        except Exception:
            continue

        if df.empty or len(df.columns) < 2:
            continue

        encabezados = [str(c).strip() for c in df.columns]
        mapa = mapear_columnas(encabezados)
        columnas_contacto = [c for c in df.columns if mapa.get(str(c).strip()) in ("nombre", "nombre_completo", "apellido", "telefono_1", "email_1", "organizacion")]
        if not columnas_contacto:
            # Hoja puramente contable/financiera o sin datos de contacto
            continue

        for idx, fila in df.iterrows():
            campos: dict[str, str] = {}
            dinamicos: dict[str, str] = {}

            for col in df.columns:
                val = fila[col]
                if pd.isna(val) or val is None:
                    continue
                v_str = str(val).strip()
                if not v_str or v_str.lower() in ("nan", "none", "null"):
                    continue

                clave = mapa.get(str(col).strip())
                if clave:
                    campos[clave] = v_str
                else:
                    dinamicos[str(col).strip().lower()] = v_str

            tiene_senal_contacto = any(k in campos for k in ("nombre", "nombre_completo", "apellido", "telefono_1", "email_1", "organizacion"))
            if tiene_senal_contacto:
                if dinamicos:
                    campos["atributos_dinamicos"] = json.dumps(dinamicos, ensure_ascii=False)
                row_num = int(idx) + 2
                fuente = f"{path}#{nombre_hoja}"
                registros.append(RawContactRecord(fuente, row_num, campos, confianza_extraccion="alta"))

    return registros


def _extraer_docx_completo(path: Path) -> list[RawContactRecord]:
    registros: list[RawContactRecord] = []
    from docx import Document

    doc = Document(str(path))

    # 1. Extraer tablas estructuradas
    for idx_tabla, tabla in enumerate(doc.tables, start=1):
        if len(tabla.rows) < 2:
            continue
        encabezados = [c.text.strip() for c in tabla.rows[0].cells]
        mapa = mapear_columnas(encabezados)

        for i, fila in enumerate(list(tabla.rows)[1:], start=2):
            campos: dict[str, str] = {}
            dinamicos: dict[str, str] = {}
            for col_idx, enc in enumerate(encabezados):
                if col_idx >= len(fila.cells):
                    continue
                txt = fila.cells[col_idx].text.strip()
                if not txt:
                    continue
                clave = mapa.get(enc)
                if clave:
                    campos[clave] = txt
                else:
                    dinamicos[enc.lower()] = txt

            if campos or dinamicos:
                if dinamicos:
                    campos["atributos_dinamicos"] = json.dumps(dinamicos, ensure_ascii=False)
                registros.append(
                    RawContactRecord(f"{path}#tabla{idx_tabla}", i, campos, confianza_extraccion="alta")
                )

    # 2. Extraer párrafos de texto libre
    texto_parrafos = "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
    if texto_parrafos:
        de_texto = extraer_contactos_de_texto(texto_parrafos)
        for i, c in enumerate(de_texto, start=1):
            c["atributos_dinamicos"] = json.dumps({"origen_documento": path.name, "tipo": "parrafo_docx"}, ensure_ascii=False)
            registros.append(RawContactRecord(f"{path}#texto", i, c, confianza_extraccion="baja"))

    return registros


def _extraer_pdf_completo(path: Path) -> list[RawContactRecord]:
    registros: list[RawContactRecord] = []
    import pdfplumber

    with pdfplumber.open(path) as pdf:
        for num_pagina, pagina in enumerate(pdf.pages, start=1):
            # 1. Intentar tablas
            tablas = pagina.extract_tables()
            extrajo_tabla = False
            for idx_tabla, tabla in enumerate(tablas, start=1):
                if len(tabla) < 2:
                    continue
                encabezados = [str(c or "").strip() for c in tabla[0]]
                mapa = mapear_columnas(encabezados)
                if len(mapa) >= 2:
                    extrajo_tabla = True
                    for i, fila in enumerate(tabla[1:], start=2):
                        campos: dict[str, str] = {}
                        dinamicos: dict[str, str] = {}
                        for col_idx, enc in enumerate(encabezados):
                            if col_idx >= len(fila):
                                continue
                            txt = str(fila[col_idx] or "").strip()
                            if not txt:
                                continue
                            clave = mapa.get(enc)
                            if clave:
                                campos[clave] = txt
                            else:
                                dinamicos[enc.lower()] = txt
                        if campos or dinamicos:
                            if dinamicos:
                                campos["atributos_dinamicos"] = json.dumps(dinamicos, ensure_ascii=False)
                            registros.append(
                                RawContactRecord(f"{path}#pag{num_pagina}_t{idx_tabla}", i, campos, confianza_extraccion="baja")
                            )

            # 2. Si no hubo tablas o como complemento de texto
            if not extrajo_tabla:
                texto = pagina.extract_text() or ""
                if texto.strip():
                    de_texto = extraer_contactos_de_texto(texto)
                    for i, c in enumerate(de_texto, start=1):
                        c["atributos_dinamicos"] = json.dumps(
                            {"origen_documento": path.name, "pagina": num_pagina}, ensure_ascii=False
                        )
                        registros.append(
                            RawContactRecord(f"{path}#pag{num_pagina}", i, c, confianza_extraccion="baja")
                        )

    return registros


def _extraer_texto_con_metadata(path: Path) -> list[RawContactRecord]:
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            with path.open("r", encoding=enc) as f:
                contenido = f.read()
            break
        except UnicodeDecodeError:
            continue
    else:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            contenido = f.read()

    contactos = extraer_contactos_de_texto(contenido)
    return [
        RawContactRecord(
            str(path),
            i,
            {
                **campos,
                "atributos_dinamicos": json.dumps({"archivo_fuente": path.name}, ensure_ascii=False),
            },
            confianza_extraccion="baja",
        )
        for i, campos in enumerate(contactos, start=1)
    ]
