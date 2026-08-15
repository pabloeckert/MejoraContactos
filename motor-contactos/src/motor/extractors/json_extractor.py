"""Extractor de JSON genérico: espera una lista de objetos (o un objeto con
la lista bajo una clave común como "contacts"/"contactos") y mapea las
claves conocidas vía column_mapping. No intenta adivinar estructuras
arbitrariamente anidadas — si el JSON no calza con el patrón esperado,
produce cero registros en vez de inventar una interpretación."""

from __future__ import annotations

import json
from pathlib import Path

from motor.extractors.base import RawContactRecord, registrar
from motor.extractors.column_mapping import mapear_columnas

_CLAVES_LISTA = ("contacts", "contactos", "items", "data")


@registrar("json")
def extraer_json(path: Path) -> list[RawContactRecord]:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        try:
            crudo = json.load(f)
        except json.JSONDecodeError:
            return []

    lista = _localizar_lista(crudo)
    if lista is None:
        return []

    registros: list[RawContactRecord] = []
    for i, item in enumerate(lista, start=1):
        if not isinstance(item, dict):
            continue
        mapa = mapear_columnas([str(k) for k in item.keys()])
        campos = {
            mapa[k]: str(v).strip()
            for k, v in item.items()
            if k in mapa and v not in (None, "") and str(v).strip()
        }
        if campos:
            registros.append(RawContactRecord(str(path), i, campos))
    return registros


def _localizar_lista(crudo) -> list | None:
    if isinstance(crudo, list):
        return crudo
    if isinstance(crudo, dict):
        for clave in _CLAVES_LISTA:
            if isinstance(crudo.get(clave), list):
                return crudo[clave]
    return None
