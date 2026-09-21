import json
import sqlite3
import pytest
from pathlib import Path

from motor.config import Config, cargar_config
from motor.export import _materializar_clusters
from motor.extractors.universal_scanner import extraer_archivo_universal, escanear_directorio
from motor.normalize_pipeline import clasificar_calidad_registro, _normalizar_registro
from motor.staging_db import conectar
from motor.text_cleaning import desglosar_compuesto_nombre, clasificar_identidad
from motor.google_contacts_source import _RUTA_CREDENCIALES, _ruta_token


def test_credentials_file_exists():
    assert _RUTA_CREDENCIALES.exists(), "credentials.json debe existir en motor-contactos/"
    with _RUTA_CREDENCIALES.open("r", encoding="utf-8") as f:
        data = json.load(f)
    assert "installed" in data or "web" in data


def test_token_paths():
    pablo_path = _ruta_token("pablo")
    sindy_path = _ruta_token("sindy")
    assert pablo_path.name == "token_pablo.json"
    assert sindy_path.name == "token_sindy.json"


def test_sindy_regente_priority(tmp_path):
    db_file = tmp_path / "test_regente.sqlite"
    conn = conectar(db_file)

    # Insertar raw_record de Pablo
    conn.execute(
        "INSERT INTO raw_records (id, source_file, source_row, raw_json, confianza_extraccion, creado_en) "
        "VALUES (1, 'google:pablo:people/c1', 1, '{}', 'alta', '2026-09-20T10:00:00')"
    )
    # Insertar raw_record de Sindy
    conn.execute(
        "INSERT INTO raw_records (id, source_file, source_row, raw_json, confianza_extraccion, creado_en) "
        "VALUES (2, 'google:sindy:people/c2', 1, '{}', 'alta', '2026-09-20T10:05:00')"
    )

    # Insertar normalized_record de Pablo (nombre 'Pablo Juan', cargo 'Vendedor')
    conn.execute(
        "INSERT INTO normalized_records "
        "(id, raw_record_id, nombre, apellido, organizacion, cargo, telefonos_e164, telefonos_fijo_e164, emails, tag, notas, flags, creado_en) "
        "VALUES (1, 1, 'Juan Pablo', 'Gomez', 'Acme SA', 'Vendedor', '[\"+5491122223333\"]', '[]', '[\"juan@pablo.com\"]', '', '', '[]', '2026-09-20T10:00:00')"
    )
    # Insertar normalized_record de Sindy (nombre 'Juan P.', cargo 'Director Comercial' - SINDY REGENTE)
    conn.execute(
        "INSERT INTO normalized_records "
        "(id, raw_record_id, nombre, apellido, organizacion, cargo, telefonos_e164, telefonos_fijo_e164, emails, tag, notas, flags, creado_en) "
        "VALUES (2, 2, 'Juan Pedro', 'Gómez', 'Acme Corporation', 'Director Comercial', '[\"+5491144445555\"]', '[]', '[\"juan@sindy.com\"]', '', 'Nota de Sindy', '[]', '2026-09-20T10:05:00')"
    )

    # Crear persona y cluster que une a ambos registros
    conn.execute("INSERT INTO personas (persona_id, creado_en) VALUES ('p-regente-1', '2026-09-20T10:00:00')")
    conn.execute(
        "INSERT INTO clusters (raw_record_id, cluster_id, persona_id, decidido_por, confianza, actualizado_en) "
        "VALUES (1, 'cluster-1', 'p-regente-1', 'regla', 1.0, '2026-09-20T10:00:00')"
    )
    conn.execute(
        "INSERT INTO clusters (raw_record_id, cluster_id, persona_id, decidido_por, confianza, actualizado_en) "
        "VALUES (2, 'cluster-1', 'p-regente-1', 'regla', 1.0, '2026-09-20T10:05:00')"
    )
    conn.commit()

    clusters = _materializar_clusters(conn)
    assert len(clusters) == 1
    c = clusters[0]

    # Gobernanza: Sindy regente gana en los campos escalares
    assert c["nombre"] == "Juan Pedro"  # Ganó Sindy sobre 'Juan Pablo'
    assert c["apellido"] == "Gómez"      # Ganó Sindy sobre 'Gomez'
    assert c["cargo"] == "Director Comercial"  # Ganó Sindy sobre 'Vendedor'
    assert c["organizacion"] == "Acme Corporation"
    assert "sindy_regente" in c["flags"]

    # Ambos teléfonos y emails se preservan sin pérdida
    assert "+5491122223333" in c["whatsapp"]
    assert "+5491144445555" in c["whatsapp"]
    assert "juan@pablo.com" in c["emails"]
    assert "juan@sindy.com" in c["emails"]


def test_desglosar_compuesto_nombre():
    nombre, cargo, org = desglosar_compuesto_nombre("Pedro Gómez - PM")
    assert nombre == "Pedro Gómez"
    assert cargo == "Pm"

    nombre, cargo, org = desglosar_compuesto_nombre("Carlos Rodriguez (TechStart SRL)")
    assert nombre == "Carlos Rodriguez"
    assert org == "TechStart SRL"

    nombre, cargo, org = desglosar_compuesto_nombre("Juan Perez")
    assert nombre == "Juan Perez"
    assert cargo == ""
    assert org == ""


def test_clasificar_identidad_avanzada():
    nom, ape, org, car = clasificar_identidad("Ing. Juan Pérez - Gerente", "", "Acme SA", "")
    assert nom == "Juan"
    assert ape == "Pérez"
    assert car == "Gerente"
    assert org == "Acme SA"


def test_clasificador_calidad():
    # 1. Inútil: sin teléfono ni email
    cat, mot = clasificar_calidad_registro("Juan", "Perez", "Acme", "CEO", [], [], [], [])
    assert cat == "inutil"

    # Inútil: fila vacía
    cat, mot = clasificar_calidad_registro("", "", "Empty Row Co", "", ["+5491122223333"], [], [], [])
    assert cat == "inutil"

    # 2. Dudoso: teléfono con flag de revisión
    cat, mot = clasificar_calidad_registro("Pedro", "Gómez", "Tech", "Dev", ["+5491100001111"], [], [], ["telefono:revisar"])
    assert cat == "dudoso"

    # 3. Útil: datos completos verificados
    cat, mot = clasificar_calidad_registro("Ana", "Martínez", "GlobalTech", "Ingeniera", ["+5491177778888"], [], ["ana@gt.com"], [])
    assert cat == "util"


def test_universal_scanner_csv_con_atributos_dinamicos(tmp_path):
    csv_file = tmp_path / "contactos_extra.csv"
    csv_file.write_text(
        "Nombre,Apellido,Teléfono,Email,CUIT,Sector,LinkedIn\n"
        "Martin,Fierro,+54 11 5555-9999,martin@pampa.com.ar,20-12345678-9,Agro,linkedin.com/in/mfierro\n",
        encoding="utf-8"
    )

    records = extraer_archivo_universal(csv_file)
    assert len(records) == 1
    r = records[0]

    assert r.campos["nombre"] == "Martin"
    assert r.campos["apellido"] == "Fierro"
    assert r.campos["telefono_1"] == "+54 11 5555-9999"
    assert r.campos["email_1"] == "martin@pampa.com.ar"

    # Atributos dinámicos elásticos capturados
    assert "atributos_dinamicos" in r.campos
    din = json.loads(r.campos["atributos_dinamicos"])
    assert din["cuit"] == "20-12345678-9"
    assert din["sector"] == "Agro"
    assert din["linkedin"] == "linkedin.com/in/mfierro"


def test_universal_scanner_texto(tmp_path):
    txt_file = tmp_path / "nota_reunion.txt"
    txt_file.write_text(
        "Reunión Comercial:\n\n"
        "Contacto de seguimiento:\n"
        "Roberto Díaz\n"
        "Email: roberto.diaz@company.com\n"
        "Celular: +54 9 11 6543 2100\n",
        encoding="utf-8"
    )

    records = extraer_archivo_universal(txt_file)
    assert len(records) >= 1
    r = records[0]
    assert r.campos["email_1"] == "roberto.diaz@company.com"
    assert "6543" in r.campos["telefono_1"]


def test_merge_engine_resolucion_local_determinista(tmp_path):
    from unittest.mock import patch
    from motor.dedup.merge_engine import deduplicar_todo
    from motor.config import DedupConfig, LlmConfig, TelefonoConfig, EmailConfig, RevisorConfig, RutasConfig

    db_file = tmp_path / "test_dedup_determ.sqlite"
    conn = conectar(db_file)

    # 1. Dos registros con similitud de nombre >= 0.85 (sin teléfono ni email)
    conn.execute(
        "INSERT INTO raw_records (id, source_file, source_row, raw_json, confianza_extraccion, creado_en) "
        "VALUES (1, 'f1', 1, '{}', 'alta', '2026-09-20T10:00:00'), (2, 'f2', 1, '{}', 'alta', '2026-09-20T10:00:00')"
    )
    conn.execute(
        "INSERT INTO normalized_records "
        "(id, raw_record_id, nombre, apellido, organizacion, cargo, telefonos_e164, telefonos_fijo_e164, emails, tag, notas, flags, creado_en) "
        "VALUES "
        "(1, 1, 'Juan Carlos', 'Perez', '', '', '[]', '[]', '[]', '', '', '[]', '2026-09-20T10:00:00'), "
        "(2, 2, 'Juan C', 'Perez', '', '', '[]', '[]', '[]', '', '', '[]', '2026-09-20T10:00:00')"
    )
    conn.execute(
        "INSERT INTO personas (persona_id, creado_en) VALUES ('p-1', '2026-09-20T10:00:00'), ('p-2', '2026-09-20T10:00:00')"
    )
    conn.execute(
        "INSERT INTO clusters (raw_record_id, cluster_id, persona_id, decidido_por, confianza, actualizado_en) "
        "VALUES (1, 'c-1', 'p-1', 'regla', 1.0, '2026-09-20T10:00:00'), (2, 'c-2', 'p-2', 'regla', 1.0, '2026-09-20T10:00:00')"
    )
    conn.commit()

    cfg = Config(
        rutas=RutasConfig(carpeta_raiz=tmp_path, carpeta_salida=tmp_path, base_sqlite=db_file),
        extensiones_permitidas=frozenset({"csv"}),
        telefono=TelefonoConfig(),
        email=EmailConfig(),
        dedup=DedupConfig(),
        llm=LlmConfig(activar_para_dudosos=True),
        revisor=RevisorConfig(),
    )

    with patch("motor.dedup.llm_judge.LlmJudge.decidir") as mock_decidir:
        contadores = deduplicar_todo(cfg, conn, continuar=False)
        # Debe fusionarse por regla estricta sin invocar al LLM
        assert contadores["regla"] >= 1
        mock_decidir.assert_not_called()


def test_merge_engine_reserva_llm_60_a_79_y_falla_limpia(tmp_path):
    from unittest.mock import patch
    from motor.dedup.merge_engine import deduplicar_todo
    from motor.config import DedupConfig, LlmConfig, TelefonoConfig, EmailConfig, RevisorConfig, RutasConfig

    db_file = tmp_path / "test_dedup_banda_media.sqlite"
    conn = conectar(db_file)

    # Dos registros que comparten teléfono pero tienen nombres claramente distintos (< 0.5)
    # y organización compartida, dando score ~0.61 (estrictamente ambiguo en [0.60, 0.79] para LLM)
    conn.execute(
        "INSERT INTO raw_records (id, source_file, source_row, raw_json, confianza_extraccion, creado_en) "
        "VALUES (1, 'f1', 1, '{}', 'alta', '2026-09-20T10:00:00'), (2, 'f2', 1, '{}', 'alta', '2026-09-20T10:00:00')"
    )
    conn.execute(
        "INSERT INTO normalized_records "
        "(id, raw_record_id, nombre, apellido, organizacion, cargo, telefonos_e164, telefonos_fijo_e164, emails, tag, notas, flags, creado_en) "
        "VALUES "
        "(1, 1, 'Maria Graciela', 'Rolon', 'Oficina Acme', '', '[\"+5493764167669\"]', '[]', '[]', '', '', '[]', '2026-09-20T10:00:00'), "
        "(2, 2, 'Daniel Alfredo', 'Altamira Gonzalez', 'Oficina Acme', '', '[\"+5493764167669\"]', '[]', '[]', '', '', '[]', '2026-09-20T10:00:00')"
    )
    conn.execute("INSERT INTO telefono_index (normalized_record_id, e164) VALUES (1, '+5493764167669'), (2, '+5493764167669')")
    conn.execute(
        "INSERT INTO personas (persona_id, creado_en) VALUES ('p-1', '2026-09-20T10:00:00'), ('p-2', '2026-09-20T10:00:00')"
    )
    conn.execute(
        "INSERT INTO clusters (raw_record_id, cluster_id, persona_id, decidido_por, confianza, actualizado_en) "
        "VALUES (1, 'c-1', 'p-1', 'regla', 1.0, '2026-09-20T10:00:00'), (2, 'c-2', 'p-2', 'regla', 1.0, '2026-09-20T10:00:00')"
    )
    conn.commit()

    cfg = Config(
        rutas=RutasConfig(carpeta_raiz=tmp_path, carpeta_salida=tmp_path, base_sqlite=db_file),
        extensiones_permitidas=frozenset({"csv"}),
        telefono=TelefonoConfig(),
        email=EmailConfig(),
        dedup=DedupConfig(),
        llm=LlmConfig(activar_para_dudosos=True),
        revisor=RevisorConfig(),
    )

    # Simulamos que Gemini retorna None (ej: tras 3 reintentos con 429 o 503)
    with patch("motor.dedup.llm_judge.LlmJudge.decidir", return_value=None) as mock_decidir:
        contadores = deduplicar_todo(cfg, conn, continuar=False)
        mock_decidir.assert_called_once()
        # Se captura limpiamente y queda en revision_pendiente sin detener el proceso
        assert contadores["revision_pendiente"] == 1

