from motor.config import Config, DedupConfig, EmailConfig, LlmConfig, RevisorConfig, RutasConfig, TelefonoConfig
from motor.dedup.blocking import generar_candidatos
from motor.normalize_pipeline import normalizar_todo
from motor.staging_db import conectar
import json
from datetime import datetime, timezone


def _config_prueba(tmp_path):
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


def test_mismo_telefono_genera_candidato(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    _insertar_raw(conn, {"nombre": "Juan", "telefono_1": "3743504517"})
    _insertar_raw(conn, {"nombre": "J", "telefono_1": "3743504517"})
    normalizar_todo(config, conn)

    candidatos = generar_candidatos(conn)
    assert candidatos == {(1, 2)}


def test_sin_senales_compartidas_no_hay_candidatos(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    _insertar_raw(conn, {"nombre": "Juan", "apellido": "Perez", "telefono_1": "3743504517"})
    _insertar_raw(conn, {"nombre": "Ricardo", "apellido": "Gomez", "telefono_1": "3764368724"})
    normalizar_todo(config, conn)

    assert generar_candidatos(conn) == set()


def test_bloque_mas_grande_que_el_tope_no_se_expande(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    for i in range(5):
        _insertar_raw(conn, {"nombre": "Juan", "telefono_1": "3743504517"})
    normalizar_todo(config, conn)

    candidatos = generar_candidatos(conn, tope_bloque=3)
    assert candidatos == set()
