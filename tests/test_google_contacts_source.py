"""Fuente de datos Google Contacts. Nunca se llama a la API real ni se pide
login -- todo se mockea (google-api-python-client y las credenciales)."""

from unittest.mock import MagicMock, patch

from motor.config import Config, DedupConfig, EmailConfig, GoogleConfig, LlmConfig, RevisorConfig, RutasConfig, TelefonoConfig
from motor.google_contacts_source import _persona_a_campos, importar_google_contactos
from motor.staging_db import conectar


def _config_prueba(tmp_path):
    (tmp_path / "Crudos").mkdir()
    return Config(
        rutas=RutasConfig(
            carpeta_raiz=tmp_path / "Crudos",
            carpeta_salida=tmp_path / "Salida",
            base_sqlite=tmp_path / "Salida" / "staging.sqlite",
        ),
        extensiones_permitidas=frozenset({"csv"}),
        telefono=TelefonoConfig(),
        email=EmailConfig(),
        dedup=DedupConfig(),
        llm=LlmConfig(activar_para_dudosos=False),
        revisor=RevisorConfig(),
        google=GoogleConfig(cuentas=("pablo",)),
    )


def test_persona_a_campos_mapea_todos_los_campos():
    persona = {
        "names": [{"givenName": "Juan", "familyName": "Perez"}],
        "organizations": [{"name": "Acme SRL", "title": "Gerente"}],
        "phoneNumbers": [
            {"value": "+549 3743 504517", "type": "mobile"},
            {"value": "3743 420000", "type": "home"},
        ],
        "emailAddresses": [{"value": "juan@gmail.com"}],
        "addresses": [{"streetAddress": "San Martin 123", "city": "Posadas", "region": "Misiones", "country": "Argentina"}],
        "biographies": [{"value": "amigo del club"}],
        "birthdays": [{"date": {"day": 5, "month": 3, "year": 1990}}],
        "photos": [{"url": "https://foto.google.com/juan.jpg", "default": False}],
    }

    campos = _persona_a_campos(persona)

    assert campos["nombre"] == "Juan"
    assert campos["apellido"] == "Perez"
    assert campos["organizacion"] == "Acme SRL"
    assert campos["cargo"] == "Gerente"
    assert campos["telefono_1"] == "+549 3743 504517"
    assert campos["telefono_1_etiqueta"] == "mobile"
    assert campos["telefono_2_etiqueta"] == "home"
    assert campos["email_1"] == "juan@gmail.com"
    assert campos["domicilio"] == "San Martin 123"
    assert campos["ciudad"] == "Posadas"
    assert campos["provincia"] == "Misiones"
    assert campos["pais"] == "Argentina"
    assert campos["notas"] == "amigo del club"
    assert campos["cumpleanos"] == "05/03/1990"
    assert campos["foto_url"] == "https://foto.google.com/juan.jpg"


def test_persona_a_campos_cumpleanos_sin_anio_se_guarda_sin_anio():
    # Google permite compartir el cumpleaños sin decir el año.
    persona = {"birthdays": [{"date": {"day": 25, "month": 12}}]}
    campos = _persona_a_campos(persona)
    assert campos["cumpleanos"] == "25/12"


def test_persona_a_campos_foto_default_no_se_guarda():
    # "default": true es la silueta genérica que pone Google cuando el
    # contacto no tiene foto real -- no es información real del contacto.
    persona = {"photos": [{"url": "https://foto.google.com/silueta.png", "default": True}]}
    campos = _persona_a_campos(persona)
    assert "foto_url" not in campos


def test_persona_a_campos_persona_vacia_da_diccionario_vacio():
    assert _persona_a_campos({}) == {}
    assert _persona_a_campos({"names": [], "phoneNumbers": []}) == {}


def _servicio_falso(paginas: list[dict]) -> MagicMock:
    """Simula servicio.people().connections().list(...).execute() devolviendo
    `paginas` en orden (una por llamada), como si fuera la respuesta paginada
    real de la People API."""
    servicio = MagicMock()
    ejecuciones = iter(paginas)
    servicio.people.return_value.connections.return_value.list.return_value.execute.side_effect = lambda: next(ejecuciones)
    return servicio


def test_importar_google_contactos_inserta_raw_records(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    pagina = {
        "connections": [
            {
                "resourceName": "people/c1",
                "etag": "etag-1",
                "names": [{"givenName": "Ana", "familyName": "Gomez"}],
                "phoneNumbers": [{"value": "3764368724", "type": "mobile"}],
            }
        ]
    }

    with patch("motor.google_contacts_source.obtener_credenciales", return_value=MagicMock()), patch(
        "googleapiclient.discovery.build", return_value=_servicio_falso([pagina])
    ):
        insertados = importar_google_contactos(config, conn, "pablo")

    assert insertados == 1
    fila = conn.execute("SELECT raw_json, source_file FROM raw_records").fetchone()
    assert fila["source_file"] == "google:pablo:people/c1"
    assert "Ana" in fila["raw_json"]


def test_importar_google_contactos_no_duplica_si_no_cambio_el_etag(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    pagina = {
        "connections": [
            {
                "resourceName": "people/c1",
                "etag": "etag-1",
                "names": [{"givenName": "Ana", "familyName": "Gomez"}],
            }
        ]
    }

    with patch("motor.google_contacts_source.obtener_credenciales", return_value=MagicMock()), patch(
        "googleapiclient.discovery.build", side_effect=[_servicio_falso([pagina]), _servicio_falso([pagina])]
    ):
        primera = importar_google_contactos(config, conn, "pablo")
        segunda = importar_google_contactos(config, conn, "pablo")

    assert primera == 1
    assert segunda == 0  # mismo etag -> no se reimporta
    total = conn.execute("SELECT COUNT(*) AS c FROM raw_records").fetchone()["c"]
    assert total == 1


def test_importar_google_contactos_reimporta_si_cambio_el_etag(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    pagina_1 = {"connections": [{"resourceName": "people/c1", "etag": "etag-1", "names": [{"givenName": "Ana"}]}]}
    pagina_2 = {"connections": [{"resourceName": "people/c1", "etag": "etag-2", "names": [{"givenName": "Ana Maria"}]}]}

    with patch("motor.google_contacts_source.obtener_credenciales", return_value=MagicMock()), patch(
        "googleapiclient.discovery.build", side_effect=[_servicio_falso([pagina_1]), _servicio_falso([pagina_2])]
    ):
        primera = importar_google_contactos(config, conn, "pablo")
        segunda = importar_google_contactos(config, conn, "pablo")

    assert primera == 1
    assert segunda == 1
    total = conn.execute("SELECT COUNT(*) AS c FROM raw_records").fetchone()["c"]
    assert total == 2  # raw_records es inmutable -- el cambio se agrega, no pisa


def test_importar_google_contactos_pagina_correctamente(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    pagina_1 = {
        "connections": [{"resourceName": "people/c1", "etag": "e1", "names": [{"givenName": "Uno"}]}],
        "nextPageToken": "sigue",
    }
    pagina_2 = {"connections": [{"resourceName": "people/c2", "etag": "e2", "names": [{"givenName": "Dos"}]}]}

    with patch("motor.google_contacts_source.obtener_credenciales", return_value=MagicMock()), patch(
        "googleapiclient.discovery.build", return_value=_servicio_falso([pagina_1, pagina_2])
    ):
        insertados = importar_google_contactos(config, conn, "pablo")

    assert insertados == 2
