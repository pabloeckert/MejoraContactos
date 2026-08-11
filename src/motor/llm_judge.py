"""Juez de casos ambiguos de deduplicación: para pares de contactos en la
banda de confianza intermedia (ni tan alta como para fusionar solos, ni tan
baja como para descartar), se le pregunta a un LLM. Arranca con Groq
(gratis) por costo; si Groq reporta baja confianza en su propio veredicto,
se escala el mismo caso a Anthropic (mejor calidad, pago) — así el costo se
paga solo en los casos genuinamente difíciles, no en todos.

Las API keys se leen de variables de entorno (GROQ_API_KEY,
ANTHROPIC_API_KEY), nunca de config.yaml ni hardcodeadas — ver
.env.example. Si una key falta, ese proveedor simplemente no responde
(_consultar devuelve None) y el caso sigue la cadena de fallback hasta
terminar, si hace falta, en la cola de revisión humana — nunca se rompe el
pipeline por falta de una key."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

import requests

from motor.config import LlmConfig

_PROMPT_SISTEMA = (
    "Sos un asistente que decide si dos registros de contacto pertenecen a "
    "la misma persona real. Respondé SOLO con JSON, sin texto adicional: "
    '{"misma_persona": true|false, "confianza": 0.0-1.0, "razon": "..."}'
)

_ENDPOINTS_OPENAI_COMPATIBLE = {
    "groq": "https://api.groq.com/openai/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
}

_VARIABLES_API_KEY = {
    "groq": "GROQ_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}


@dataclass(frozen=True)
class VeredictoLlm:
    misma_persona: bool
    confianza: float
    razon: str
    proveedor: str


class LlmJudge:
    def __init__(self, config: LlmConfig) -> None:
        self._config = config

    def decidir(self, contacto_a: dict, contacto_b: dict) -> VeredictoLlm | None:
        if not self._config.activar_para_dudosos:
            return None

        primario = self._config.primario
        veredicto = self._consultar(primario.proveedor, primario.modelo, contacto_a, contacto_b)
        if veredicto is not None and veredicto.confianza >= self._config.escalado.umbral_confianza_groq:
            return veredicto

        escalado = self._config.escalado
        veredicto_escalado = self._consultar(escalado.proveedor, escalado.modelo, contacto_a, contacto_b)
        return veredicto_escalado or veredicto

    def _consultar(
        self, proveedor: str, modelo: str, contacto_a: dict, contacto_b: dict
    ) -> VeredictoLlm | None:
        api_key = _api_key_para(proveedor)
        if not api_key:
            return None

        prompt_usuario = (
            f"Contacto A: {json.dumps(contacto_a, ensure_ascii=False)}\n"
            f"Contacto B: {json.dumps(contacto_b, ensure_ascii=False)}"
        )
        try:
            if proveedor == "anthropic":
                texto = _llamar_anthropic(api_key, modelo, prompt_usuario)
            else:
                texto = _llamar_openai_compatible(proveedor, api_key, modelo, prompt_usuario)
            datos = json.loads(_extraer_json(texto))
            return VeredictoLlm(
                misma_persona=bool(datos["misma_persona"]),
                confianza=float(datos["confianza"]),
                razon=str(datos.get("razon", "")),
                proveedor=proveedor,
            )
        except (requests.RequestException, KeyError, ValueError, json.JSONDecodeError):
            return None


def _llamar_openai_compatible(proveedor: str, api_key: str, modelo: str, prompt_usuario: str) -> str:
    url = _ENDPOINTS_OPENAI_COMPATIBLE[proveedor]
    respuesta = requests.post(
        url,
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": modelo,
            "messages": [
                {"role": "system", "content": _PROMPT_SISTEMA},
                {"role": "user", "content": prompt_usuario},
            ],
            "temperature": 0,
        },
        timeout=20,
    )
    respuesta.raise_for_status()
    return respuesta.json()["choices"][0]["message"]["content"]


def _llamar_anthropic(api_key: str, modelo: str, prompt_usuario: str) -> str:
    respuesta = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": modelo,
            "max_tokens": 300,
            "system": _PROMPT_SISTEMA,
            "messages": [{"role": "user", "content": prompt_usuario}],
        },
        timeout=20,
    )
    respuesta.raise_for_status()
    return respuesta.json()["content"][0]["text"]


def _extraer_json(texto: str) -> str:
    inicio, fin = texto.find("{"), texto.rfind("}")
    if inicio == -1 or fin == -1:
        raise ValueError("respuesta del LLM sin JSON")
    return texto[inicio : fin + 1]


def _api_key_para(proveedor: str) -> str | None:
    variable = _VARIABLES_API_KEY.get(proveedor)
    return os.environ.get(variable) if variable else None
