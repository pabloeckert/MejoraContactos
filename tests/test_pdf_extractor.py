"""No hay una librería de escritura de PDF en requirements.txt (pdfplumber
es solo lector), así que estos tests simulan las páginas con objetos falsos
en vez de generar un PDF real — igual ejercitan la lógica real de
extraer_pdf() (fallback tabla -> texto por página)."""

from motor.extractors import pdf_extractor


class _PaginaFalsa:
    def __init__(self, tablas=None, texto=""):
        self._tablas = tablas or []
        self._texto = texto

    def extract_tables(self):
        return self._tablas

    def extract_text(self):
        return self._texto


class _PdfFalso:
    def __init__(self, paginas):
        self.pages = paginas

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_pagina_con_tabla_reconocida_no_cae_a_texto(monkeypatch, tmp_path):
    tabla = [["Nombre", "Telefono"], ["Juan", "3743504517"]]
    pagina = _PaginaFalsa(tablas=[tabla], texto="esto no debería usarse")
    monkeypatch.setattr(pdf_extractor.pdfplumber, "open", lambda p: _PdfFalso([pagina]))

    registros = pdf_extractor.extraer_pdf(tmp_path / "falso.pdf")

    assert len(registros) == 1
    assert registros[0].campos["nombre"] == "Juan"
    assert registros[0].campos["telefono_1"] == "3743504517"
    assert registros[0].confianza_extraccion == "baja"


def test_pagina_sin_tabla_cae_a_texto_libre(monkeypatch, tmp_path):
    pagina = _PaginaFalsa(tablas=[], texto="Juan Perez\n3743504517\njuan@gmail.com")
    monkeypatch.setattr(pdf_extractor.pdfplumber, "open", lambda p: _PdfFalso([pagina]))

    registros = pdf_extractor.extraer_pdf(tmp_path / "falso.pdf")

    assert len(registros) == 1
    assert registros[0].campos["nombre_completo"] == "Juan Perez"
    assert registros[0].confianza_extraccion == "baja"


def test_pagina_sin_tabla_ni_texto_no_genera_registros(monkeypatch, tmp_path):
    pagina = _PaginaFalsa(tablas=[], texto="")
    monkeypatch.setattr(pdf_extractor.pdfplumber, "open", lambda p: _PdfFalso([pagina]))

    assert pdf_extractor.extraer_pdf(tmp_path / "falso.pdf") == []
