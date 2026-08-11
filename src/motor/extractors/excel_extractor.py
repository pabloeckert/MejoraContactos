"""Extractor de Excel/ODS (xls, xlsx, xlsm, ods). A diferencia de un export
de Google Contacts, una planilla armada a mano no siempre tiene el
encabezado en la primera fila (títulos, filas en blanco arriba) — se
prueban las primeras filas hasta encontrar una que mapee al menos 2
columnas reconocidas."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from motor.extractors.base import RawContactRecord, registrar
from motor.extractors.column_mapping import mapear_columnas

_FILAS_A_PROBAR = 5


@registrar("xls", "xlsx", "xlsm", "ods")
def extraer_excel(path: Path) -> list[RawContactRecord]:
    registros: list[RawContactRecord] = []
    hojas = pd.read_excel(path, sheet_name=None, header=None, dtype=str)

    for nombre_hoja, df in hojas.items():
        fila_encabezado, mapa = _detectar_encabezado(df)
        if mapa is None:
            continue
        encabezados = df.iloc[fila_encabezado].tolist()
        for i in range(fila_encabezado + 1, len(df)):
            campos = _extraer_campos(df.iloc[i], encabezados, mapa)
            if campos:
                registros.append(RawContactRecord(f"{path}#{nombre_hoja}", i + 1, campos))

    return registros


def _detectar_encabezado(df: pd.DataFrame) -> tuple[int, dict[str, str] | None]:
    for fila_idx in range(min(_FILAS_A_PROBAR, len(df))):
        candidatos = [str(v) for v in df.iloc[fila_idx].tolist() if v is not None and str(v).strip()]
        if len(candidatos) < 2:
            continue
        mapa = mapear_columnas(candidatos)
        if len(mapa) >= 2:
            return fila_idx, mapa
    return 0, None


def _extraer_campos(fila: pd.Series, encabezados: list, mapa: dict[str, str]) -> dict[str, str]:
    campos: dict[str, str] = {}
    for col_idx, encabezado in enumerate(encabezados):
        clave = mapa.get(str(encabezado))
        if not clave or col_idx >= len(fila):
            continue
        valor = fila.iloc[col_idx]
        if valor is None:
            continue
        texto = str(valor).strip()
        if texto and texto.lower() != "nan":
            campos[clave] = texto
    return campos
