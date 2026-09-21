"""Módulo de juez cognitivo: reexporta desde motor.dedup.llm_judge para compatibilidad total."""

from motor.dedup.llm_judge import (
    LlmJudge,
    VeredictoLlm,
    OLLAMA_HOST_DEFAULT,
    OLLAMA_MODEL_DEFAULT,
    OLLAMA_MODEL_ALT,
    _consultar_ollama,
    _decidir_con_ollama,
    _consultar_gemini,
    _decidir_con_gemini,
    _extraer_json,
    inferir_identidad_cognitiva,
    clasificar_calidad_cognitiva,
)

__all__ = [
    "LlmJudge",
    "VeredictoLlm",
    "OLLAMA_HOST_DEFAULT",
    "OLLAMA_MODEL_DEFAULT",
    "OLLAMA_MODEL_ALT",
    "_consultar_ollama",
    "_decidir_con_ollama",
    "_consultar_gemini",
    "_decidir_con_gemini",
    "_extraer_json",
    "inferir_identidad_cognitiva",
    "clasificar_calidad_cognitiva",
]
