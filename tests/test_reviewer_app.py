from dataclasses import replace
from unittest.mock import patch

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


def test_dashboard_muestra_stats_en_cero_sin_datos(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.get("/")

    assert respuesta.status_code == 200
    assert b"0" in respuesta.data
    assert "Panel de motor-contactos".encode() in respuesta.data


def test_accion_run_procesa_un_csv_de_punta_a_punta(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Telefono\nJuan,3743504517\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.post("/accion/run", follow_redirects=True)

    assert respuesta.status_code == 200
    assert b"Corrida completa" in respuesta.data
    assert (config.rutas.carpeta_salida / "lista-maestra.xlsx").exists()


def test_accion_desconocida_no_rompe(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.post("/accion/no-existe", follow_redirects=True)

    assert respuesta.status_code == 200
    assert "Acción desconocida".encode() in respuesta.data


def test_accion_importar_google_de_cuenta_configurada(tmp_path):
    # No se llama nunca a la API real de Google ni se abre un navegador --
    # se mockea importar_google_contactos, el resto del botón (dispatch,
    # mensaje) se prueba de verdad.
    config = _config_prueba(tmp_path)
    config = replace(config, google=GoogleConfig(cuentas=("pablo",)))
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    with patch("motor.google_contacts_source.importar_google_contactos", return_value=7) as mock_importar:
        respuesta = cliente.post("/accion/importar-google-pablo", follow_redirects=True)

    assert respuesta.status_code == 200
    assert "raw_records nuevos: 7".encode() in respuesta.data
    mock_importar.assert_called_once_with(config, conn, "pablo")


def test_accion_importar_google_de_cuenta_no_configurada_no_rompe(tmp_path):
    config = _config_prueba(tmp_path)  # google.cuentas queda vacío por default
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.post("/accion/importar-google-inexistente", follow_redirects=True)

    assert respuesta.status_code == 200
    assert "no está en config.yaml".encode() in respuesta.data


def test_dashboard_sin_boton_de_importar_si_no_hay_cuentas_configuradas(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    respuesta = crear_app(config, conn).test_client().get("/")

    assert "Importar de Google (".encode() not in respuesta.data


def test_dashboard_muestra_boton_de_importar_por_cada_cuenta_configurada(tmp_path):
    config = replace(_config_prueba(tmp_path), google=GoogleConfig(cuentas=("sindy",)))
    conn = conectar(config.rutas.base_sqlite)

    respuesta = crear_app(config, conn).test_client().get("/")

    assert "Importar de Google (Sindy)".encode() in respuesta.data


def test_accion_importar_carpeta_recorre_subcarpetas_y_cualquier_formato(tmp_path):
    config = _config_prueba(tmp_path)  # extensiones_permitidas = {"csv"} solamente
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    carpeta_elegida = tmp_path / "ElegidaEnElDialogo"
    (carpeta_elegida / "sub").mkdir(parents=True)
    (carpeta_elegida / "a.csv").write_text("Nombre,Telefono\nJuan,3743504517\n", encoding="utf-8")
    (carpeta_elegida / "sub" / "b.json").write_text(
        '[{"nombre": "Ana", "telefono_1": "3743504518"}]', encoding="utf-8"
    )

    with patch("motor.file_dialogs.elegir_carpeta", return_value=carpeta_elegida):
        respuesta = cliente.post("/accion/importar-carpeta", follow_redirects=True)

    assert respuesta.status_code == 200
    assert "raw_records nuevos: 2".encode() in respuesta.data  # csv + json (subcarpeta), aunque json no esté en extensiones_permitidas
    assert conn.execute("SELECT COUNT(*) FROM raw_records").fetchone()[0] == 2


def test_accion_importar_carpeta_cancelada_no_rompe(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    with patch("motor.file_dialogs.elegir_carpeta", return_value=None):
        respuesta = cliente.post("/accion/importar-carpeta", follow_redirects=True)

    assert respuesta.status_code == 200
    assert "Cancelado".encode() in respuesta.data


def test_accion_importar_archivo_de_formato_fuera_de_extensiones_permitidas(tmp_path):
    config = _config_prueba(tmp_path)  # extensiones_permitidas = {"csv"} solamente
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    archivo = tmp_path / "suelto.json"
    archivo.write_text('[{"nombre": "Ana", "telefono_1": "3743504518"}]', encoding="utf-8")

    with patch("motor.file_dialogs.elegir_archivo", return_value=archivo):
        respuesta = cliente.post("/accion/importar-archivo", follow_redirects=True)

    assert respuesta.status_code == 200
    assert "raw_records nuevos: 1".encode() in respuesta.data
    assert conn.execute("SELECT COUNT(*) FROM raw_records").fetchone()[0] == 1


def test_accion_importar_archivo_sin_extractor_muestra_error_claro(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    archivo = tmp_path / "no-soportado.xyz"
    archivo.write_text("lo que sea", encoding="utf-8")

    with patch("motor.file_dialogs.elegir_archivo", return_value=archivo):
        respuesta = cliente.post("/accion/importar-archivo", follow_redirects=True)

    assert respuesta.status_code == 200
    assert "no tiene ning".encode() in respuesta.data


def test_pagina_revisar_sin_pendientes(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.get("/revisar")

    assert respuesta.status_code == 200
    assert "No hay casos pendientes".encode() in respuesta.data


def test_buscar_encuentra_contacto_por_nombre_y_permite_editar(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()
    cliente.post("/accion/run")

    respuesta = cliente.get("/buscar?q=Juan")
    assert respuesta.status_code == 200
    assert b"Perez" in respuesta.data

    cluster_id = conn.execute("SELECT cluster_id FROM clusters LIMIT 1").fetchone()["cluster_id"]
    formulario = cliente.get(f"/editar/{cluster_id}")
    assert formulario.status_code == 200
    assert b"Juan" in formulario.data

    guardado = cliente.post(
        f"/editar/{cluster_id}",
        data={"nombre": "Juan", "apellido": "Perez", "tag": "familiar"},
        follow_redirects=True,
    )
    assert guardado.status_code == 200

    fila = conn.execute(
        "SELECT tag FROM ediciones_manuales WHERE cluster_id = ?", (cluster_id,)
    ).fetchone()
    assert fila["tag"] == "familiar"


def test_editar_contacto_permite_corregir_whatsapp_desde_el_panel(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()
    cliente.post("/accion/run")

    cluster_id = conn.execute("SELECT cluster_id FROM clusters LIMIT 1").fetchone()["cluster_id"]

    formulario = cliente.get(f"/editar/{cluster_id}")
    assert b"WhatsApp (uno por l" in formulario.data  # ya no dice "no se editan ac\xc3\xa1"

    guardado = cliente.post(
        f"/editar/{cluster_id}",
        data={"nombre": "Juan", "apellido": "Perez", "whatsapp": "3764368724"},
        follow_redirects=True,
    )
    assert guardado.status_code == 200

    fila = conn.execute(
        "SELECT whatsapp_json FROM ediciones_manuales WHERE cluster_id = ?", (cluster_id,)
    ).fetchone()
    assert fila["whatsapp_json"] == '["+5493764368724"]'


def test_pagina_revisar_muestra_datos_de_contacto_no_solo_ids(tmp_path):
    # Ficha 6.1 de la encuesta original: al revisar un caso dudoso hace
    # falta ver nombre/teléfono/organización/fuente, no un id numérico
    # pelado -- caso real: mismo teléfono, nombres que la salvaguarda de
    # scoring.py lee como claramente distintos (misma combinación usada en
    # test_pipeline_integration.py para forzar revision_pendiente).
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "compartido.csv").write_text(
        "Nombre,Apellido,Telefono\nLucia,Fernandez,3743504517\nGustavo,Lopez,3743504517\n",
        encoding="utf-8",
    )
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()
    cliente.post("/accion/run")

    respuesta = cliente.get("/revisar")

    assert respuesta.status_code == 200
    assert b"Lucia Fernandez" in respuesta.data
    assert b"Gustavo Lopez" in respuesta.data
    assert b"compartido.csv" in respuesta.data


def test_editar_contacto_inexistente_redirige_a_buscar(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app(config, conn).test_client()

    respuesta = cliente.get("/editar/no-existe", follow_redirects=True)

    assert respuesta.status_code == 200
    assert "Buscar contacto".encode() in respuesta.data
