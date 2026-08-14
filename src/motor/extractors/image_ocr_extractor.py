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
[] para cada imagen, pero avisa UNA vez por corrida (no una vez por
archivo, que sería puro ruido si hay cientos de capturas) de que Tesseract
falta y por eso no se está extrayendo nada de ninguna imagen — antes de
este aviso, la falta del binario y "esta imagen en particular no tenía
ningún contacto" se veían exactamente igual desde afuera (ambas devuelven
[] en silencio), así que no había forma de notar el problema real sin leer
el código."""

from __future__ import annotations

from pathlib import Path

import pytesseract
from PIL import Image

from motor.extractors.base import RawContactRecord, registrar
from motor.extractors.freetext_extractor import extraer_contactos_de_texto

_avisado_tesseract_faltante = False


@registrar("png", "jpg", "jpeg")
def extraer_imagen(path: Path) -> list[RawContactRecord]:
    global _avisado_tesseract_faltante
    try:
        texto = pytesseract.image_to_string(Image.open(path), lang="spa+eng")
    except pytesseract.TesseractNotFoundError:
        if not _avisado_tesseract_faltante:
            print(
                "aviso: Tesseract-OCR no está instalado en este sistema — las "
                "imágenes (.png/.jpg/.jpeg) se van a saltear sin extraer "
                "contactos hasta que se instale. Ver "
                "https://github.com/UB-Mannheim/tesseract/wiki"
            )
            _avisado_tesseract_faltante = True
        return []
    except Exception:
        # Imagen corrupta, formato no soportado, etc. -- esto sí es ruido
        # esperado por archivo (no un problema de entorno), se mantiene en
        # silencio a nivel de este extractor tal como antes.
        return []

    return [
        RawContactRecord(str(path), i, campos, confianza_extraccion="baja")
        for i, campos in enumerate(extraer_contactos_de_texto(texto), start=1)
    ]
