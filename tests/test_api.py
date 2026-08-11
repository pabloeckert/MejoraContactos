"""API JSON (Fase 1 — UI nueva), montada sobre el mismo Flask app que el
panel HTML. Mismas fixtures sintéticas que test_reviewer_app.py, nunca
datos reales de pablo.csv/Sindy.csv."""

from motor.config import Config, DedupConfig, EmailConfig, LlmConfig, RevisorConfig, RutasConfig, TelefonoConfig
from motor.reviewer_app import crear_app
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
    )


def test_api_stats_en_cero_sin_datos(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.get("/api/stats")

    assert respuesta.status_code == 200
    assert respuesta.get_json() == {
        "raw_records": 0,
        "normalized_records": 0,
        "contactos_finales": 0,
        "pendientes": 0,
    }


def test_api_cors_solo_refleja_origenes_localhost(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    local = cliente.get("/api/stats", headers={"Origin": "http://localhost:5173"})
    assert local.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"

    externo = cliente.get("/api/stats", headers={"Origin": "https://sitio-cualquiera.com"})
    assert "Access-Control-Allow-Origin" not in externo.headers


def test_api_contactos_lista_y_pagina(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\nAna,Gomez,3764368724\n",
        encoding="utf-8",
    )
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()
    cliente.post("/api/accion/run")

    respuesta = cliente.get("/api/contactos?tamano=1&pagina=1")
    cuerpo = respuesta.get_json()

    assert respuesta.status_code == 200
    assert cuerpo["total"] == 2
    assert len(cuerpo["contactos"]) == 1
    assert cuerpo["contactos"][0]["nombre"]  # viene serializado, no un dataclass/set


def test_api_contacto_inexistente_da_404(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.get("/api/contactos/no-existe")

    assert respuesta.status_code == 404


def test_api_editar_contacto_persiste_y_devuelve_el_contacto_actualizado(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()
    cliente.post("/api/accion/run")

    cluster_id = conn.execute("SELECT cluster_id FROM clusters LIMIT 1").fetchone()["cluster_id"]

    respuesta = cliente.post(f"/api/contactos/{cluster_id}", json={"tag": "familiar"})

    assert respuesta.status_code == 200
    assert respuesta.get_json()["tag"] == "familiar"


def test_api_revisar_y_decidir_actualiza_pendientes(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    sin_pendientes = cliente.get("/api/revisar").get_json()
    assert sin_pendientes == {"total": 0, "grupos": []}

    respuesta = cliente.post("/api/decidir", json={"patron": "no-existe", "aceptar": True})
    assert respuesta.status_code == 200
    assert respuesta.get_json() == {"ok": True, "actualizados": 0}


def test_api_accion_desconocida_no_rompe(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.post("/api/accion/no-existe")

    assert respuesta.status_code == 200
    assert "Acción desconocida" in respuesta.get_json()["mensaje"]
