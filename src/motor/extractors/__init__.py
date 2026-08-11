"""Importar este paquete registra todos los extractores disponibles (cada
submódulo se auto-registra vía el decorador @registrar de base.py al ser
importado)."""

from motor.extractors import (  # noqa: F401
    csv_extractor,
    docx_extractor,
    excel_extractor,
    freetext_extractor,
    html_extractor,
    image_ocr_extractor,
    json_extractor,
    pdf_extractor,
    vcard_extractor,
)
from motor.extractors.base import extractor_para  # noqa: F401
