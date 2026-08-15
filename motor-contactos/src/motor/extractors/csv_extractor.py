"""Extractor de CSV/TSV: detecta encoding y delimitador, mapea encabezados
a claves canónicas vía column_mapping, y produce un RawContactRecord por
fila no vacía."""

from __future__ import annotations

import csv
from pathlib import Path

import chardet

from motor.extractors.base import RawContactRecord, registrar
from motor.extractors.column_mapping import mapear_columnas


@registrar("csv", "tsv")
def extraer_csv(path: Path) -> list[RawContactRecord]:
    encoding = _detectar_encoding(path)
    delimitador = "\t" if path.suffix.lower() == ".tsv" else _detectar_delimitador(path, encoding)

    registros: list[RawContactRecord] = []
    with path.open("r", encoding=encoding, newline="", errors="replace") as f:
        lector = csv.DictReader(f, delimiter=delimitador)
        if not lector.fieldnames:
            return []
        mapa = mapear_columnas([h for h in lector.fieldnames if h is not None])
        for i, fila in enumerate(lector, start=2):  # la fila 1 es el encabezado
            campos = _extraer_campos(fila, mapa)
            if campos:
                registros.append(RawContactRecord(str(path), i, campos))
    return registros


def _detectar_encoding(path: Path) -> str:
    with path.open("rb") as f:
        muestra = f.read(65536)
    deteccion = chardet.detect(muestra)
    return deteccion.get("encoding") or "utf-8"


def _detectar_delimitador(path: Path, encoding: str) -> str:
    with path.open("r", encoding=encoding, newline="", errors="replace") as f:
        muestra = f.read(4096)
    try:
        return csv.Sniffer().sniff(muestra, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def _extraer_campos(fila: dict[str, str], mapa: dict[str, str]) -> dict[str, str]:
    campos: dict[str, str] = {}
    for encabezado, valor in fila.items():
        if encabezado is None or valor is None:
            continue
        clave = mapa.get(encabezado)
        if clave and valor.strip():
            campos[clave] = valor.strip()
    return campos
