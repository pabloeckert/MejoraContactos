"""Extractor de PDF con texto seleccionable (Fase 3, experimental). Prueba
primero extraer tablas por página (pdfplumber) — si el PDF tiene una tabla
de contactos reconocible, se mapea igual que excel/html/docx. Si esa
página no tiene tablas, cae al texto plano y aplica la misma heurística de
freetext_extractor.py.

confianza_extraccion="baja" siempre, incluso para las tablas: un PDF es
una fuente mucho menos controlada que un CSV/Excel de origen conocido
(puede venir de un escaneo previo de mala calidad, de una plantilla ajena,
etc.) — el motor de dedup nunca lo auto-fusiona contra un contacto ya
verificado sin pasar por revisión (ver dedup/scoring.py).

PDF escaneado sin texto seleccionable (imagen pura) no lo cubre este
extractor — pdfplumber.extract_text() devuelve vacío y no hay tablas que
extraer; para eso hace falta OCR (ver image_ocr_extractor.py), que hoy no
está encadenado automáticamente acá."""

from __future__ import annotations

from pathlib import Path

import pdfplumber

from motor.extractors.base import RawContactRecord, registrar
from motor.extractors.column_mapping import mapear_columnas
from motor.extractors.freetext_extractor import extraer_contactos_de_texto


@registrar("pdf")
def extraer_pdf(path: Path) -> list[RawContactRecord]:
    registros: list[RawContactRecord] = []
    with pdfplumber.open(path) as pdf:
        for num_pagina, pagina in enumerate(pdf.pages, start=1):
            de_tablas = _extraer_tablas(path, pagina, num_pagina)
            if de_tablas:
                registros.extend(de_tablas)
            else:
                registros.extend(_extraer_texto(path, pagina, num_pagina))
    return registros


def _extraer_tablas(path: Path, pagina, num_pagina: int) -> list[RawContactRecord]:
    registros: list[RawContactRecord] = []
    for tabla in pagina.extract_tables():
        if len(tabla) < 2:
            continue
        encabezados = [str(c or "").strip() for c in tabla[0]]
        mapa = mapear_columnas(encabezados)
        if len(mapa) < 2:
            continue
        for i, fila in enumerate(tabla[1:], start=2):
            campos = _campos_de_fila(encabezados, fila, mapa)
            if campos:
                registros.append(
                    RawContactRecord(f"{path}#pag{num_pagina}", i, campos, confianza_extraccion="baja")
                )
    return registros


def _extraer_texto(path: Path, pagina, num_pagina: int) -> list[RawContactRecord]:
    texto = pagina.extract_text() or ""
    return [
        RawContactRecord(f"{path}#pag{num_pagina}", i, campos, confianza_extraccion="baja")
        for i, campos in enumerate(extraer_contactos_de_texto(texto), start=1)
    ]


def _campos_de_fila(encabezados: list[str], fila: list, mapa: dict[str, str]) -> dict[str, str]:
    campos: dict[str, str] = {}
    for col_idx, encabezado in enumerate(encabezados):
        clave = mapa.get(encabezado)
        if not clave or col_idx >= len(fila):
            continue
        valor = str(fila[col_idx] or "").strip()
        if valor:
            campos[clave] = valor
    return campos
