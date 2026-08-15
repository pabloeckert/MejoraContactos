"""No se asume que Tesseract-OCR (el binario, no la librería pytesseract)
esté instalado en la máquina que corre los tests — el comportamiento que
se verifica acá es justamente que su ausencia no rompa nada, sea cual sea
el motivo del fallo (falta el binario, imagen inválida, etc.)."""

import pytesseract
from PIL import Image

import motor.extractors.image_ocr_extractor as image_ocr_extractor
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


def test_avisa_una_sola_vez_por_corrida_si_falta_tesseract(tmp_path, monkeypatch, capsys):
    # Antes de este fix, "falta el binario de Tesseract" y "esta imagen no
    # tenía ningún contacto" se veían exactamente igual desde afuera (las
    # dos devuelven [] en silencio) -- este test confirma que ahora se avisa
    # una vez por corrida, sin repetir el aviso por cada imagen.
    monkeypatch.setattr(image_ocr_extractor, "_avisado_tesseract_faltante", False)

    def _explota(*args, **kwargs):
        raise pytesseract.TesseractNotFoundError()

    monkeypatch.setattr(pytesseract, "image_to_string", _explota)

    imagen1 = tmp_path / "captura1.png"
    imagen2 = tmp_path / "captura2.png"
    Image.new("RGB", (100, 40), color="white").save(imagen1)
    Image.new("RGB", (100, 40), color="white").save(imagen2)

    assert extraer_imagen(imagen1) == []
    assert extraer_imagen(imagen2) == []

    salida = capsys.readouterr().out
    assert salida.count("Tesseract-OCR no está instalado") == 1
