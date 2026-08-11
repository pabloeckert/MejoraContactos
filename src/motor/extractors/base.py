"""Contrato común de extractores: cada uno lee un archivo crudo y produce
una lista de RawContactRecord. Ningún extractor normaliza nada — eso es
responsabilidad de normalize_pipeline.py, que ya conoce phone_normalizer y
email_normalizer. Los extractores solo traducen el formato de origen a un
diccionario de claves canónicas (nombre, apellido, organizacion, notas,
telefono_N, telefono_N_etiqueta, email_N).

confianza_extraccion distingue fuentes estructuradas (csv/excel/vcf/json,
"alta") de fuentes experimentales futuras (OCR, texto libre, "baja") — el
motor de dedup usa este campo para no auto-fusionar contactos de baja
confianza contra contactos ya verificados sin pasar por revisión.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

ConfianzaExtraccion = str  # "alta" | "baja"


@dataclass(frozen=True)
class RawContactRecord:
    source_file: str
    source_row: int
    campos: dict[str, str]
    confianza_extraccion: ConfianzaExtraccion = "alta"


ExtractorFn = Callable[[Path], list[RawContactRecord]]

_REGISTRO: dict[str, ExtractorFn] = {}


def registrar(*extensiones: str) -> Callable[[ExtractorFn], ExtractorFn]:
    """Decorador: registra la función para una o más extensiones de archivo
    (sin punto, case-insensitive). Se usa en cada módulo extractors/*.py;
    extractors/__init__.py importa todos esos módulos para poblar el
    registro con solo `import motor.extractors`."""

    def decorador(fn: ExtractorFn) -> ExtractorFn:
        for ext in extensiones:
            _REGISTRO[ext.lower().lstrip(".")] = fn
        return fn

    return decorador


def extractor_para(extension: str) -> ExtractorFn | None:
    return _REGISTRO.get(extension.lower().lstrip("."))
