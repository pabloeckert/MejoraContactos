"""Extractor de HTML: busca tablas de contactos (`<table>`) y mapea la
primera fila de cada una como encabezado vía column_mapping — mismo
patrón que excel_extractor. Riesgo bajo porque una tabla HTML tiene
estructura tan reconocible como una planilla; no se intenta extraer nada
de prosa libre fuera de tablas (eso es freetext_extractor, Fase 3)."""

from __future__ import annotations

from pathlib import Path

from bs4 import BeautifulSoup

from motor.extractors.base import RawContactRecord, registrar
from motor.extractors.column_mapping import mapear_columnas


@registrar("html", "htm")
def extraer_html(path: Path) -> list[RawContactRecord]:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        soup = BeautifulSoup(f.read(), "lxml")

    registros: list[RawContactRecord] = []
    for indice_tabla, tabla in enumerate(soup.find_all("table"), start=1):
        filas = tabla.find_all("tr")
        if len(filas) < 2:
            continue

        encabezados = [_texto(celda) for celda in filas[0].find_all(["th", "td"])]
        mapa = mapear_columnas(encabezados)
        if len(mapa) < 2:
            continue

        for i, fila in enumerate(filas[1:], start=2):
            celdas = [_texto(celda) for celda in fila.find_all(["td", "th"])]
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


def _texto(celda) -> str:
    return celda.get_text(strip=True)
