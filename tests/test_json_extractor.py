import json

from motor.extractors.json_extractor import extraer_json


def test_lista_plana_de_objetos(tmp_path):
    datos = [
        {"Nombre": "Juan", "Telefono": "3743504517", "Correo": "juan@gmail.com"},
        {"Nombre": "Maria", "Telefono": "3764368724"},
    ]
    path = tmp_path / "contactos.json"
    path.write_text(json.dumps(datos), encoding="utf-8")

    registros = extraer_json(path)

    assert len(registros) == 2
    assert registros[0].campos["nombre"] == "Juan"
    assert registros[0].campos["email_1"] == "juan@gmail.com"
    assert registros[1].campos["nombre"] == "Maria"


def test_objeto_con_clave_contactos(tmp_path):
    datos = {"contactos": [{"Nombre": "Ana", "Telefono": "111"}]}
    path = tmp_path / "export.json"
    path.write_text(json.dumps(datos), encoding="utf-8")

    registros = extraer_json(path)

    assert len(registros) == 1
    assert registros[0].campos["nombre"] == "Ana"


def test_estructura_no_reconocida_no_inventa_nada(tmp_path):
    path = tmp_path / "raro.json"
    path.write_text(json.dumps({"algo": "sin lista"}), encoding="utf-8")

    assert extraer_json(path) == []


def test_json_invalido_no_rompe(tmp_path):
    path = tmp_path / "roto.json"
    path.write_text("{no es json valido", encoding="utf-8")

    assert extraer_json(path) == []
