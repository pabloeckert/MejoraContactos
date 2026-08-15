"""API JSON (Fase 1 — UI nueva), montada sobre el mismo Flask app que el
panel HTML. Mismas fixtures sintéticas que test_reviewer_app.py, nunca
datos reales de pablo.csv/Sindy.csv."""

from dataclasses import replace

from motor.config import Config, DedupConfig, EmailConfig, GoogleConfig, LlmConfig, RevisorConfig, RutasConfig, TelefonoConfig
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


def test_api_anomalias_sin_datos_devuelve_lista_vacia(tmp_path):
    # La lógica de detección real (telefono_compartido_por_muchos_contactos)
    # ya está cubierta en tests/test_anomalias.py -- esto solo confirma que
    # el endpoint /api/anomalias (nuevo, antes anomalias.py era CLI-only)
    # queda bien enchufado.
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.get("/api/anomalias")

    assert respuesta.status_code == 200
    assert respuesta.get_json() == {"anomalias": []}


def test_api_cuentas_google_devuelve_las_configuradas(tmp_path):
    config = replace(_config_prueba(tmp_path), google=GoogleConfig(cuentas=("pablo", "sindy")))
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.get("/api/cuentas-google")

    assert respuesta.status_code == 200
    assert respuesta.get_json() == {"cuentas": ["pablo", "sindy"]}


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


def test_api_contactos_tamano_puede_superar_500(tmp_path):
    # La UI carga toda la lista de una y filtra client-side -- si el tope
    # server-side siguiera clavado en 500, con más de 500 contactos reales
    # (hoy son 8.541) la tabla nunca mostraría el resto.
    config = _config_prueba(tmp_path)
    filas = "\n".join(f"Persona{i},Apellido{i},{3743500000 + i}" for i in range(3))
    (config.rutas.carpeta_raiz / "a.csv").write_text(f"Nombre,Apellido,Telefono\n{filas}\n", encoding="utf-8")
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()
    cliente.post("/api/accion/run")

    respuesta = cliente.get("/api/contactos?tamano=5000&pagina=1")
    cuerpo = respuesta.get_json()

    assert cuerpo["tamano"] == 5000  # no se lo pisó a 500
    assert len(cuerpo["contactos"]) == 3


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
