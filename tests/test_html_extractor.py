from motor.extractors.html_extractor import extraer_html

_TABLA_SIMPLE = """<html><body>
<table>
<tr><th>Nombre</th><th>Apellido</th><th>Telefono</th><th>Correo</th></tr>
<tr><td>Juan</td><td>Perez</td><td>3743504517</td><td>juan@gmail.com</td></tr>
<tr><td>Maria</td><td>Gomez</td><td>3764368724</td><td></td></tr>
</table>
</body></html>"""


def test_extrae_filas_de_una_tabla_con_encabezado(tmp_path):
    path = tmp_path / "contactos.html"
    path.write_text(_TABLA_SIMPLE, encoding="utf-8")

    registros = extraer_html(path)

    assert len(registros) == 2
    assert registros[0].campos["nombre"] == "Juan"
    assert registros[0].campos["apellido"] == "Perez"
    assert registros[0].campos["telefono_1"] == "3743504517"
    assert registros[0].campos["email_1"] == "juan@gmail.com"
    assert "email_1" not in registros[1].campos  # celda vacía no se guarda


def test_html_sin_tablas_no_produce_registros(tmp_path):
    path = tmp_path / "sin_tabla.html"
    path.write_text("<html><body><p>Nada de contactos acá</p></body></html>", encoding="utf-8")

    assert extraer_html(path) == []


def test_tabla_de_una_sola_fila_se_descarta(tmp_path):
    path = tmp_path / "una_fila.html"
    path.write_text(
        "<table><tr><th>Nombre</th><th>Telefono</th></tr></table>", encoding="utf-8"
    )

    assert extraer_html(path) == []
