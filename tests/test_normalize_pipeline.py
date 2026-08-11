import json
from datetime import datetime, timezone

from motor.config import Config, DedupConfig, EmailConfig, LlmConfig, RevisorConfig, RutasConfig, TelefonoConfig
from motor.normalize_pipeline import normalizar_todo
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


def _insertar_raw(conn, campos):
    conn.execute(
        "INSERT INTO raw_records (source_file, source_row, raw_json, confianza_extraccion, creado_en) "
        "VALUES ('t.csv', 1, ?, 'alta', ?)",
        (json.dumps(campos), datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()


def test_fila_plantilla_de_google_contacts_no_deja_basura(tmp_path):
    # Fila real encontrada en pablo.csv: Google agrega un ejemplo donde
    # cada campo vale literalmente el nombre del campo.
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    _insertar_raw(conn, {"nombre": "Nombre", "apellido": "Apellido", "organizacion": "Empresa", "cargo": "Cargo"})

    normalizar_todo(config, conn)

    fila = conn.execute("SELECT nombre, apellido, organizacion, cargo FROM normalized_records").fetchone()
    assert fila["nombre"] is None
    assert fila["apellido"] is None
    assert fila["organizacion"] is None
    assert fila["cargo"] is None


def test_contacto_de_diagnostico_contacts_plus_se_descarta(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    _insertar_raw(
        conn,
        {
            "nombre": "Contacts",
            "apellido": "Sync",
            "notas": "This contact was created by Contacts+ in order to detect any syncing loops or other anomalies.",
        },
    )

    normalizar_todo(config, conn)

    total = conn.execute("SELECT COUNT(*) c FROM normalized_records").fetchone()["c"]
    assert total == 0


def test_contacto_real_no_se_confunde_con_la_plantilla(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    _insertar_raw(conn, {"nombre": "Juan", "apellido": "Perez", "telefono_1": "3743504517"})

    normalizar_todo(config, conn)

    fila = conn.execute("SELECT nombre, apellido FROM normalized_records").fetchone()
    assert fila["nombre"] == "Juan"
    assert fila["apellido"] == "Perez"


def test_tag_se_autocompleta_al_normalizar(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    _insertar_raw(
        conn,
        {"nombre": "Maria", "apellido": "Gomez", "organizacion": "Acme SRL", "cargo": "Gerente"},
    )

    normalizar_todo(config, conn)

    fila = conn.execute("SELECT tag FROM normalized_records").fetchone()
    assert fila["tag"] == "laboral"
