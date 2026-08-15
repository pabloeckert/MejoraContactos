from motor.extractors.freetext_extractor import extraer_contactos_de_texto, extraer_texto_libre


def test_bloque_con_nombre_telefono_y_email():
    texto = "Juan Perez\nTel: 3743504517\njuan@gmail.com"
    resultados = extraer_contactos_de_texto(texto)

    assert len(resultados) == 1
    campos = resultados[0]
    assert campos["nombre_completo"] == "Juan Perez"
    assert campos["telefono_1"] == "3743504517"
    assert campos["email_1"] == "juan@gmail.com"


def test_bloques_separados_por_linea_en_blanco_dan_registros_distintos():
    texto = "Juan Perez\n3743504517\n\nMaria Gomez\n3764368724"
    resultados = extraer_contactos_de_texto(texto)
    assert len(resultados) == 2


def test_bloque_sin_telefono_ni_email_no_genera_nada():
    texto = "Esto es solo una nota sin ningún dato de contacto reconocible."
    assert extraer_contactos_de_texto(texto) == []


def test_bloque_sin_linea_de_nombre_reconocible_igual_extrae_telefono():
    texto = "consulta por el 3743504517 urgente"
    resultados = extraer_contactos_de_texto(texto)
    assert len(resultados) == 1
    assert "telefono_1" in resultados[0]
    assert "nombre_completo" not in resultados[0]


def test_extraer_texto_libre_marca_confianza_baja(tmp_path):
    path = tmp_path / "notas.txt"
    path.write_text("Juan Perez\n3743504517\njuan@gmail.com", encoding="utf-8")

    registros = extraer_texto_libre(path)

    assert len(registros) == 1
    assert registros[0].confianza_extraccion == "baja"
