"""Extractor OCR de imágenes/capturas de pantalla (Fase 3, experimental):
lee el texto de la imagen con pytesseract y aplica la misma heurística de
freetext_extractor.py sobre el texto reconocido. confianza_extraccion=
"baja" siempre — una lectura OCR mala puede "coincidir por casualidad" con
un contacto real, y el motor de dedup nunca auto-fusiona esto sin pasar
por revisión (ver dedup/scoring.py).

Requiere el binario Tesseract-OCR instalado aparte en el sistema operativo
— "pip install pytesseract" NO alcanza, es solo el wrapper de Python. En
Windows: descargar el instalador desde
https://github.com/UB-Mannheim/tesseract/wiki e indicar la ruta con
`pytesseract.pytesseract.tesseract_cmd` si el binario no queda en el PATH.
Sin el binario instalado, este extractor no rompe el pipeline — devuelve
[] y queda logueado (ver ingest.py, que envuelve cada extractor en
try/except desde que se sumaron los extractores experimentales de Fase 3),
simplemente no aporta esos contactos hasta que se instale."""

from __future__ import annotations

from pathlib import Path

import pytesseract
from PIL import Image

from motor.extractors.base import RawContactRecord, registrar
from motor.extractors.freetext_extractor import extraer_contactos_de_texto


@registrar("png", "jpg", "jpeg")
def extraer_imagen(path: Path) -> list[RawContactRecord]:
    try:
        texto = pytesseract.image_to_string(Image.open(path), lang="spa+eng")
    except Exception:
        # Tesseract no instalado, formato de imagen no soportado, etc. —
        # no inventar datos ni romper el resto de la extracción.
        return []

    return [
        RawContactRecord(str(path), i, campos, confianza_extraccion="baja")
        for i, campos in enumerate(extraer_contactos_de_texto(texto), start=1)
    ]
