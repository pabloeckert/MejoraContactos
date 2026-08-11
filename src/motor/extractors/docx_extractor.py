"""Extractor de Word (.docx): busca tablas de contacto — mismo patrón que
html_extractor.py y excel_extractor.py. Riesgo bajo, estructura tan
reconocible como una planilla; no se intenta leer nada de los párrafos de
prosa del documento (eso es freetext_extractor.py, Fase 3)."""

from __future__ import annotations

from pathlib import Path

from docx import Document

from motor.extractors.base import RawContactRecord, registrar
from motor.extractors.column_mapping import mapear_columnas


@registrar("docx")
def extraer_docx(path: Path) -> list[RawContactRecord]:
    documento = Document(str(path))

    registros: list[RawContactRecord] = []
    for indice_tabla, tabla in enumerate(documento.tables, start=1):
        filas = tabla.rows
        if len(filas) < 2:
            continue

        encabezados = [celda.text.strip() for celda in filas[0].cells]
        mapa = mapear_columnas(encabezados)
        if len(mapa) < 2:
            continue

        for i, fila in enumerate(list(filas)[1:], start=2):
            celdas = [celda.text.strip() for celda in fila.cells]
            campos = _extraer_campos(encabezados, celdas, mapa)
            if campos:
                registros.append(RawContactRecord(f"{path}#tabla{indice_tabla}", i, campos))

    return registros


def _extraer_campos(encabezados: list[str], celdas: list[str], mapa: dict[str, str]) -> dict[str, str]:
    campos: dict[str, str] = {}
    for col_idx, encabezado in enumerate(encabezados):
        clave = mapa.get(encabezado)
        if not clave or col_idx >= len(celdas):
            continue
        valor = celdas[col_idx].strip()
        if valor:
            campos[clave] = valor
    return campos
