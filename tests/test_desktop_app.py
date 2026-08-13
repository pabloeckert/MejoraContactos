"""App de escritorio (UI React empaquetada + API). No testea la ventana
nativa de pywebview (no tiene sentido en CI, requiere GUI real) -- solo
que el Flask app sirva la UI y la API correctamente."""

from motor.config import Config, DedupConfig, EmailConfig, LlmConfig, RevisorConfig, RutasConfig, TelefonoConfig
from motor.desktop_app import crear_app_escritorio
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


def test_api_funciona_en_el_app_de_escritorio(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app_escritorio(config, conn).test_client()

    respuesta = cliente.get("/api/stats")

    assert respuesta.status_code == 200
    assert respuesta.get_json()["raw_records"] == 0


def test_ruta_raiz_sirve_algo_de_la_ui_compilada_o_avisa_si_falta(tmp_path):
    # No depende de que `npm run build` se haya corrido en este entorno de
    # test -- valida que la ruta responda coherentemente en cualquier caso
    # (200 con el index real si ui/dist/ existe, o un error claro si no).
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    cliente = crear_app_escritorio(config, conn).test_client()

    respuesta = cliente.get("/")

    assert respuesta.status_code in (200, 404)
