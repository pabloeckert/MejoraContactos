"""Tests para LlmJudge usando Gemini Flash exclusivamente.
Verifica que las llamadas se hagan a la API de Gemini y que ningún
servicio pago externo (Anthropic, OpenAI, OpenRouter) sea invocado.
"""

from unittest.mock import patch
import pytest
import requests

from motor.config import LlmConfig, LlmEscaladoConfig, LlmProveedorConfig
from motor.llm_judge import LlmJudge, inferir_identidad_cognitiva, clasificar_calidad_cognitiva


def _config(activar=True, proveedor="gemini"):
    return LlmConfig(
        activar_para_dudosos=activar,
        primario=LlmProveedorConfig(proveedor=proveedor, modelo="gemini-flash-latest" if proveedor == "gemini" else "qwen2.5:3b"),
        rotacion_gratis_openrouter=(),
        escalado=LlmEscaladoConfig(proveedor=proveedor, modelo="gemini-flash-latest", umbral_confianza_groq=0.7),
    )


class _RespuestaGeminiFalsa:
    def __init__(self, texto="{}", status=200):
        self.status_code = status
        self._texto = texto
        self.text = texto

    def json(self):
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": self._texto}
                        ]
                    }
                }
            ]
        }


class _RespuestaOllamaFalsa:
    def __init__(self, contenido="{}", status=200):
        self.status_code = status
        self._contenido = contenido
        self.text = contenido

    def json(self):
        return {
            "model": "qwen2.5:3b",
            "message": {
                "role": "assistant",
                "content": self._contenido,
            },
            "done": True,
        }


@pytest.fixture(autouse=True)
def _keys(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake-gemini-key")
    # Asegurar que ninguna key externa esté configurada
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    # Por default en tests, evitar pausas de 4s
    monkeypatch.setattr("time.sleep", lambda s: None)


def test_desactivado_no_llama_a_nadie():
    judge = LlmJudge(_config(activar=False))
    with patch("requests.post") as post:
        assert judge.decidir({}, {}) is None
        post.assert_not_called()


def test_sin_api_key_no_llama(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    with patch("dotenv.load_dotenv"):
        judge = LlmJudge(_config(activar=True))
        with patch("requests.post") as post:
            assert judge.decidir({}, {}) is None
            post.assert_not_called()


def test_gemini_decidir_exito():
    judge = LlmJudge(_config(activar=True))
    respuesta = '{"misma_persona": true, "confianza": 0.95, "razon": "Mismo nombre y teléfono coincidente"}'
    with patch("requests.post", return_value=_RespuestaGeminiFalsa(respuesta)) as post:
        veredicto = judge.decidir({"nombre": "Carlos"}, {"nombre": "Carlos"})

    assert veredicto is not None
    assert veredicto.misma_persona is True
    assert veredicto.confianza == 0.95
    assert veredicto.proveedor == "gemini"
    assert post.call_count == 1
    url_llamada = post.call_args[0][0]
    assert "generativelanguage.googleapis.com" in url_llamada
    assert "anthropic" not in url_llamada
    assert "openrouter" not in url_llamada
    assert post.call_args[1].get("timeout") == 30


def test_gemini_status_error_retorna_none():
    judge = LlmJudge(_config(activar=True))
    with patch("requests.post", return_value=_RespuestaGeminiFalsa("error", status=402)):
        veredicto = judge.decidir({}, {})
    assert veredicto is None


def test_throttle_preventivo_4_segundos():
    judge = LlmJudge(_config(activar=True))
    respuesta = '{"misma_persona": true, "confianza": 0.9, "razon": "ok"}'
    with patch("requests.post", return_value=_RespuestaGeminiFalsa(respuesta)):
        with patch("time.sleep") as mock_sleep:
            judge.decidir({}, {})
            mock_sleep.assert_called_with(4)


def test_error_429_captura_inmediata_sin_reintentos():
    judge = LlmJudge(_config(activar=True))
    with patch("requests.post", return_value=_RespuestaGeminiFalsa("rate limit", status=429)) as post:
        with patch("time.sleep"):
            veredicto = judge.decidir({}, {})

    assert veredicto is None
    # Captura inmediata: exactamente 1 llamada, sin bucle de reintentos
    assert post.call_count == 1


def test_error_503_captura_inmediata_sin_reintentos():
    judge = LlmJudge(_config(activar=True))
    with patch("requests.post", return_value=_RespuestaGeminiFalsa("service unavailable", status=503)) as post:
        with patch("time.sleep"):
            veredicto = judge.decidir({}, {})

    assert veredicto is None
    # Captura inmediata: exactamente 1 llamada, sin bucle de reintentos
    assert post.call_count == 1


def test_error_read_timeout_captura_inmediata_sin_reintentos():
    judge = LlmJudge(_config(activar=True))
    with patch("requests.post", side_effect=requests.exceptions.ReadTimeout("Timeout")) as post:
        with patch("time.sleep"):
            veredicto = judge.decidir({}, {})

    assert veredicto is None
    # Captura inmediata: exactamente 1 llamada, sin bucle de reintentos
    assert post.call_count == 1


def test_inferir_identidad_cognitiva_gemini():
    respuesta = '{"nombre": "Carlos", "apellido": "Rodriguez", "cargo": "CEO", "organizacion": "TechStart"}'
    with patch("motor.dedup.llm_judge._consultar_ollama", return_value=None):
        with patch("requests.post", return_value=_RespuestaGeminiFalsa(respuesta)):
            res = inferir_identidad_cognitiva("Carlos Rodriguez - CEO de TechStart")

    assert res["nombre"] == "Carlos"
    assert res["apellido"] == "Rodriguez"
    assert res["cargo"] == "CEO"
    assert res["organizacion"] == "TechStart"


def test_ollama_prioridad_decidir_exito():
    judge = LlmJudge(_config(activar=True, proveedor="ollama"))
    respuesta_json = '{"fusionar": true, "confianza": 0.98, "justificacion": "Misma persona validada por Ollama"}'
    with patch("requests.post", return_value=_RespuestaOllamaFalsa(respuesta_json)) as post:
        veredicto = judge.decidir({"nombre": "Carlos"}, {"nombre": "Carlos"})

    assert veredicto is not None
    assert veredicto.misma_persona is True
    assert veredicto.confianza == 0.98
    assert veredicto.proveedor == "ollama"
    assert "Ollama" in veredicto.razon
    # Verifica que se llamó al endpoint de Ollama
    url = post.call_args[0][0]
    assert "11434" in url


def test_ollama_fallback_gemini_cuando_ollama_offline():
    judge = LlmJudge(_config(activar=True, proveedor="ollama"))
    resp_gemini = '{"misma_persona": true, "confianza": 0.92, "razon": "Mismo teléfono según Gemini"}'

    def _mock_post(url, *args, **kwargs):
        if "11434" in url:
            raise requests.exceptions.ConnectionError("Ollama offline")
        return _RespuestaGeminiFalsa(resp_gemini)

    with patch("requests.post", side_effect=_mock_post):
        veredicto = judge.decidir({"nombre": "Carlos"}, {"nombre": "Carlos"})

    assert veredicto is not None
    assert veredicto.proveedor == "gemini"
    assert veredicto.misma_persona is True


def test_ollama_extraccion_identidad_json_estricto():
    json_ollama = '{"nombre": "Carlos", "apellido": "Pérez", "empresa": "Acme Corp", "cargo": "Director", "notas": "Cliente VIP"}'
    with patch("requests.post", return_value=_RespuestaOllamaFalsa(json_ollama)):
        res = inferir_identidad_cognitiva("Carlos Pérez - Director en Acme Corp")

    assert res["nombre"] == "Carlos"
    assert res["apellido"] == "Pérez"
    assert res["empresa"] == "Acme Corp"
    assert res["cargo"] == "Director"
    assert res["notas"] == "Cliente VIP"


def test_ollama_clasificacion_calidad_util():
    json_calidad = '{"calidad": "util", "motivo": "Contacto con nombre y WhatsApp corporativo"}'
    with patch("requests.post", return_value=_RespuestaOllamaFalsa(json_calidad)):
        calidad, motivo = clasificar_calidad_cognitiva({"nombre": "Carlos", "telefonos": ["+5491122334455"]})

    assert calidad == "util"
    assert "WhatsApp" in motivo


def test_fallback_local_extraccion_identidad_si_no_hay_llm(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    with patch("motor.dedup.llm_judge._consultar_ollama", return_value=None):
        res = inferir_identidad_cognitiva("Ing. Roberto Gómez - Gerente")

    assert res["nombre"] == "Roberto"
    assert res["apellido"] == "Gómez"
    assert res["cargo"] == "Gerente"


def test_fallback_local_clasificacion_calidad_si_no_hay_llm():
    with patch("motor.dedup.llm_judge._consultar_ollama", return_value=None):
        calidad, motivo = clasificar_calidad_cognitiva({
            "nombre": "Ana",
            "apellido": "Martínez",
            "organizacion": "GlobalTech",
            "cargo": "Ingeniera",
            "telefonos": ["+5491177778888"],
            "emails": ["ana@gt.com"]
        })

    assert calidad == "util"

