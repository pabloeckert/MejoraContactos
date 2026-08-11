"""No se asume que Tesseract-OCR (el binario, no la librería pytesseract)
esté instalado en la máquina que corre los tests — el comportamiento que
se verifica acá es justamente que su ausencia no rompa nada, sea cual sea
el motivo del fallo (falta el binario, imagen inválida, etc.)."""

from PIL import Image

from motor.extractors.image_ocr_extractor import extraer_imagen


def test_no_rompe_si_tesseract_no_esta_disponible(tmp_path):
    path = tmp_path / "captura.png"
    imagen = Image.new("RGB", (100, 40), color="white")
    imagen.save(path)

    registros = extraer_imagen(path)

    assert registros == []


def test_archivo_invalido_no_rompe(tmp_path):
    path = tmp_path / "no_es_una_imagen.png"
    path.write_bytes(b"esto no es un PNG valido")

    assert extraer_imagen(path) == []
