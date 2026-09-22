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



from unittest.mock import MagicMock, patch

def test_a_fila_supabase_formato_correcto():
    from motor.supabase_sync import _a_fila_supabase
    c = {
        "persona_id": "11111111-2222-3333-4444-555555555555",
        "cluster_id": "c1",
        "nombre": "Juan",
        "apellido": "Perez",
        "cargo": "Gerente",
        "organizacion": "Acme",
        "whatsapp": ["+5491155551234"],
        "telefono_fijo": [],
        "emails": ["juan@acme.com"],
        "tag": "cliente",
        "domicilio": "Calle 123",
        "ciudad": "Posadas",
        "provincia": "Misiones",
        "pais": "Argentina",
        "cumpleanos": "1985-05-10",
        "foto_url": "",
        "nota_referencia": "VIP",
        "flags": ["telefono_validado"],
        "editado_manualmente": False,
        "updated_at": "2026-09-20T12:00:00Z",
    }
    fila = _a_fila_supabase(c)
    assert fila["persona_id"] == "11111111-2222-3333-4444-555555555555"
    assert fila["whatsapp"] == ["+5491155551234"]
    assert fila["emails"] == ["juan@acme.com"]
    assert fila["foto_url"] is None
    assert fila["updated_at"] == "2026-09-20T12:00:00Z"


def test_sincronizar_contactos_con_credenciales_envia_upsert(monkeypatch, tmp_path):
    monkeypatch.setenv("SUPABASE_URL", "https://xyz.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "super-secret-service-key")

    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.raise_for_status = MagicMock()

    contacto_fake = {
        "persona_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "cluster_id": "c1",
        "nombre": "Carlos",
        "apellido": "Gomez",
        "cargo": "",
        "organizacion": "",
        "whatsapp": ["+5491100001111"],
        "telefono_fijo": [],
        "emails": [],
        "tag": "",
        "domicilio": "",
        "ciudad": "",
        "provincia": "",
        "pais": "",
        "cumpleanos": None,
        "foto_url": None,
        "nota_referencia": "",
        "flags": [],
        "editado_manualmente": False,
        "updated_at": "2026-09-20T10:00:00Z",
    }

    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    with patch("motor.export.obtener_contactos_por_persona", return_value=[contacto_fake]):
        with patch("requests.post", return_value=mock_resp) as mock_post:
            res = supabase_sync.sincronizar_contactos(conn, {"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"})

    assert res["sincronizado"] is True
    assert res["enviados"] == 1
    assert mock_post.call_count == 1
    url_llamada = mock_post.call_args[0][0]
    assert url_llamada == "https://xyz.supabase.co/rest/v1/contactos_finales"
    headers = mock_post.call_args[1]["headers"]
    assert headers["apikey"] == "super-secret-service-key"
    assert headers["Authorization"] == "Bearer super-secret-service-key"
    assert headers["Prefer"] == "resolution=merge-duplicates,return=minimal"
