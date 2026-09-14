"""supabase_sync.py debe ser best-effort y no bloqueante: sin
SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados (caso normal en estos
tests -- nunca se setean), no debe intentar ninguna llamada de red ni
lanzar ninguna excepción."""

import pytest

from motor import supabase_sync
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


@pytest.fixture(autouse=True)
def _sin_supabase_configurado(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)


def test_sin_configurar_no_llama_a_la_red(tmp_path, monkeypatch):
    def _fallar_si_se_llama(*args, **kwargs):
        raise AssertionError("no debería intentar ninguna request sin SUPABASE_URL/SERVICE_ROLE_KEY")

    monkeypatch.setattr(supabase_sync.requests, "post", _fallar_si_se_llama)

    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    resultado = supabase_sync.sincronizar_contactos(conn, {"cualquier-persona-id"})

    assert resultado == {"sincronizado": False, "motivo": "supabase no configurado"}


def test_sin_persona_ids_no_hace_nada(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    resultado = supabase_sync.sincronizar_contactos(conn, set())

    assert resultado == {"sincronizado": False, "motivo": "sin persona_ids"}


def test_pipeline_completo_no_rompe_sin_supabase_configurado(tmp_path):
    """El pipeline de dedup llama a _sincronizar_best_effort() en varios
    puntos ahora -- confirma que correr todo de punta a punta sin Supabase
    configurado (el caso de hoy) no lanza ninguna excepción."""
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\nAna,Gomez,3764368724\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)

    resultado = deduplicar_todo(config, conn)  # no debe lanzar

    assert resultado["regla"] >= 0
