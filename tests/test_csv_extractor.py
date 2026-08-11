from motor.extractors.csv_extractor import extraer_csv

_ENCABEZADO_GOOGLE = (
    "First Name,Last Name,Organization Name,Notes,"
    "E-mail 1 - Label,E-mail 1 - Value,"
    "Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value\n"
)


def test_reconoce_esquema_google_contacts(tmp_path):
    contenido = _ENCABEZADO_GOOGLE + (
        "Juan,Perez,Acme,Cliente viejo,"
        "Home,juan@gmail.com,"
        "Mobile,3743504517,Home,3743111222\n"
    )
    path = tmp_path / "export.csv"
    path.write_text(contenido, encoding="utf-8")

    registros = extraer_csv(path)

    assert len(registros) == 1
    campos = registros[0].campos
    assert campos["nombre"] == "Juan"
    assert campos["apellido"] == "Perez"
    assert campos["organizacion"] == "Acme"
    assert campos["notas"] == "Cliente viejo"
    assert campos["email_1"] == "juan@gmail.com"
    assert campos["telefono_1"] == "3743504517"
    assert campos["telefono_1_etiqueta"] == "Mobile"
    assert campos["telefono_2"] == "3743111222"
    assert campos["telefono_2_etiqueta"] == "Home"


def test_fila_vacia_no_genera_registro(tmp_path):
    contenido = _ENCABEZADO_GOOGLE + ",,,,,,,,,\n"
    path = tmp_path / "export.csv"
    path.write_text(contenido, encoding="utf-8")

    assert extraer_csv(path) == []


def test_alias_genericos_espanol(tmp_path):
    contenido = "Nombre,Apellido,Telefono,Correo\nMaria,Gomez,3764368724,maria@hotmail.com\n"
    path = tmp_path / "planilla.csv"
    path.write_text(contenido, encoding="utf-8")

    registros = extraer_csv(path)

    assert len(registros) == 1
    campos = registros[0].campos
    assert campos["nombre"] == "Maria"
    assert campos["apellido"] == "Gomez"
    assert campos["telefono_1"] == "3764368724"
    assert campos["email_1"] == "maria@hotmail.com"


def test_multiples_filas_numeran_source_row_desde_encabezado(tmp_path):
    contenido = "Nombre,Telefono\nAna,111\nLuis,222\n"
    path = tmp_path / "dos_filas.csv"
    path.write_text(contenido, encoding="utf-8")

    registros = extraer_csv(path)

    assert [r.source_row for r in registros] == [2, 3]


def test_delimitador_punto_y_coma_se_detecta(tmp_path):
    contenido = "Nombre;Telefono\nAna;3743504517\n"
    path = tmp_path / "excel_ar.csv"
    path.write_text(contenido, encoding="utf-8")

    registros = extraer_csv(path)

    assert len(registros) == 1
    assert registros[0].campos["telefono_1"] == "3743504517"
