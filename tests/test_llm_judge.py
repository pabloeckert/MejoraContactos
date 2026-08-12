"""LlmJudge: rotación round-robin entre Groq + modelos gratis de
OpenRouter, con escalado a Anthropic. Nunca llama a una API real — todo
mockeado vía requests.post."""

from unittest.mock import patch

import pytest

from motor.config import LlmConfig, LlmEscaladoConfig, LlmProveedorConfig
from motor.llm_judge import LlmJudge


def _config(rotacion=(), umbral=0.6, activar=True):
    return LlmConfig(
        activar_para_dudosos=activar,
        primario=LlmProveedorConfig(proveedor="groq", modelo="modelo-groq"),
        rotacion_gratis_openrouter=rotacion,
        escalado=LlmEscaladoConfig(proveedor="anthropic", modelo="modelo-claude", umbral_confianza_groq=umbral),
    )


class _RespuestaFalsa:
    def __init__(self, cuerpo_json=None, anthropic=False, status=200):
        self.status_code = status
        self._cuerpo = cuerpo_json
        self._anthropic = anthropic

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests

            raise requests.HTTPError(f"status {self.status_code}")

    def json(self):
        import json

        texto = json.dumps(self._cuerpo)
        if self._anthropic:
            return {"content": [{"text": texto}]}
        return {"choices": [{"message": {"content": texto}}]}


@pytest.fixture(autouse=True)
def _keys(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "fake-groq")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-anthropic")
    monkeypatch.setenv("OPENROUTER_API_KEY", "fake-openrouter")


def test_desactivado_no_llama_a_nadie():
    judge = LlmJudge(_config(activar=False))
    with patch("requests.post") as post:
        assert judge.decidir({}, {}) is None
        post.assert_not_called()


def test_groq_confiado_no_escala():
    config = _config(rotacion=("modelo-a:free",))
    judge = LlmJudge(config)
    with patch("requests.post", return_value=_RespuestaFalsa({"misma_persona": True, "confianza": 0.9, "razon": "ok"})) as post:
        veredicto = judge.decidir({"nombre": "Juan"}, {"nombre": "Juan"})
    assert veredicto is not None
    assert veredicto.proveedor == "groq"
    assert veredicto.confianza == 0.9
    assert post.call_count == 1  # ni siquiera probó la rotación


def test_rotacion_prueba_siguiente_si_el_primero_falla(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)  # groq sin key -> _consultar da None directo
    config = _config(rotacion=("modelo-a:free",))
    judge = LlmJudge(config)
    with patch("requests.post", return_value=_RespuestaFalsa({"misma_persona": True, "confianza": 0.8, "razon": "ok"})) as post:
        veredicto = judge.decidir({}, {})
    assert veredicto.proveedor == "openrouter"
    assert post.call_count == 1  # solo llamó al de OpenRouter, groq se salteó sin red


def test_ninguno_confiado_escala_a_anthropic():
    config = _config(rotacion=("modelo-a:free",), umbral=0.9)
    judge = LlmJudge(config)
    respuestas = [
        _RespuestaFalsa({"misma_persona": True, "confianza": 0.3, "razon": "dudoso groq"}),
        _RespuestaFalsa({"misma_persona": True, "confianza": 0.4, "razon": "dudoso openrouter"}),
        _RespuestaFalsa({"misma_persona": True, "confianza": 0.95, "razon": "seguro claude"}, anthropic=True),
    ]
    with patch("requests.post", side_effect=respuestas) as post:
        veredicto = judge.decidir({}, {})
    assert veredicto.proveedor == "anthropic"
    assert veredicto.confianza == 0.95
    assert post.call_count == 3


def test_si_nadie_responde_devuelve_none():
    import requests

    config = _config(rotacion=("modelo-a:free",))
    judge = LlmJudge(config)
    with patch("requests.post", side_effect=requests.ConnectionError("boom")):
        veredicto = judge.decidir({}, {})
    assert veredicto is None


def test_rotacion_round_robin_entre_llamadas():
    config = _config(rotacion=("modelo-a:free", "modelo-b:free"), umbral=0.5)
    judge = LlmJudge(config)
    confiado = _RespuestaFalsa({"misma_persona": True, "confianza": 0.9, "razon": "ok"})

    modelos_llamados = []

    def registrar(*args, **kwargs):
        modelos_llamados.append(kwargs["json"]["model"])
        return confiado

    with patch("requests.post", side_effect=registrar):
        judge.decidir({}, {})  # arranca en groq (indice 0)
        judge.decidir({}, {})  # como groq respondió confiado, el indice avanzó a modelo-a
        judge.decidir({}, {})  # y ahora a modelo-b

    assert modelos_llamados == ["modelo-groq", "modelo-a:free", "modelo-b:free"]
