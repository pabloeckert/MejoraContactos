from motor.anomalias import detectar_telefonos_sospechosos
from motor.config import Config, DedupConfig, EmailConfig, LlmConfig, RevisorConfig, RutasConfig, TelefonoConfig
from motor.dedup.merge_engine import deduplicar_todo
from motor.ingest import extraer_todo
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


def test_telefono_compartido_por_pocos_contactos_no_es_anomalia(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "familia.csv").write_text(
        "Nombre,Apellido,Telefono\n"
        "Juan,Perez,3743504517\n"
        "Ana,Perez,3743504518\n",
        encoding="utf-8",
    )
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)

    assert detectar_telefonos_sospechosos(conn, umbral=5) == []


def test_telefono_compartido_por_muchos_contactos_distintos_es_anomalia(tmp_path):
    # Nombres genuinamente distintos entre sí (no "Persona0/Persona1") --
    # si se parecen demasiado, la salvaguarda de scoring.py NO los separa
    # y terminan fusionados en un solo contacto, que es lo correcto ahí
    # pero no lo que este test necesita reproducir (8 contactos finales
    # DISTINTOS que comparten el mismo teléfono).
    config = _config_prueba(tmp_path)
    nombres = [
        ("Lucia", "Fernandez"), ("Gustavo", "Lopez"), ("Marcos", "Diaz"),
        ("Valeria", "Acosta"), ("Ricardo", "Suarez"), ("Sofia", "Benitez"),
        ("Ezequiel", "Romero"), ("Daniela", "Paz"),
    ]
    filas = "\n".join(f"{n},{a},3743500000" for n, a in nombres)
    (config.rutas.carpeta_raiz / "sospechoso.csv").write_text(f"Nombre,Apellido,Telefono\n{filas}\n", encoding="utf-8")
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)

    anomalias = detectar_telefonos_sospechosos(conn, umbral=5)

    # La salvaguarda de nombres distintos no siempre separa el 100% de los
    # pares (dos de estos nombres pueden parecerse lo suficiente al azar)
    # -- lo que importa acá es que quedan bastantes contactos FINALES
    # distintos compartiendo el mismo número, no el número exacto.
    assert len(anomalias) == 1
    assert anomalias[0]["cantidad"] >= 6
    assert len(anomalias[0]["nombres"]) == anomalias[0]["cantidad"]
