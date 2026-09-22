"""Juez cognitivo de deduplicación y clasificación de calidad.

Arquitectura de proveedores:
1. Ollama local (prioritario): endpoint 'http://localhost:11434/api/chat'
   con modelo por defecto 'qwen2.5:3b' (o 'llama3.2:3b') y formato JSON estricto.
2. Fallback secundario: Gemini Flash (con throttle preventivo de 4s y captura de cuota).
3. Fallback final: Reglas locales deterministas en Python / SQLite si ningún LLM responde.

Casos de uso cubiertos con salida JSON estricta:
- Extracción de identidad (nombre, apellido, empresa, cargo, notas).
- Clasificación de calidad ('util', 'dudoso', 'inutil').
- Desempate de duplicados (fusionar: true/false con justificación y confianza).
"""

from __future__ import annotations

import json
import re
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

from motor.config import LlmConfig

logger = logging.getLogger(__name__)

# Configuración Ollama
OLLAMA_HOST_DEFAULT = "http://localhost:11434"
OLLAMA_MODEL_DEFAULT = "qwen2.5:3b"
OLLAMA_MODEL_ALT = "llama3.2:3b"
OLLAMA_TIMEOUT_DEFAULT = 15

# Configuración Gemini
_PROMPT_SISTEMA_DEDUP = (
    "Sos un asistente de deduplicación de contactos. Decidí si dos registros pertenecen a la misma persona real.\n"
    "Respondé OBLIGATORIAMENTE en formato JSON estricto, sin explicaciones ni texto adicional:\n"
    '{"fusionar": true, "confianza": 0.95, "justificacion": "Mismo nombre y teléfono coincidente"}'
)

_MODELO_GEMINI_DEFAULT = "gemini-flash-latest"
_TIMEOUT_GEMINI_SEGUNDOS = 30
_THROTTLE_GEMINI_SEGUNDOS = 4



# ----------------------------------------------------------------------
# 0. PRIVACIDAD Y ENMASCARAMIENTO DE PII (Ley 25.326)
# Ningún dato de teléfono o email viaja en texto claro a modelos LLM
# ----------------------------------------------------------------------

def enmascarar_telefono(tel: str) -> str:
    """Enmascara un número telefónico preservando únicamente los últimos 4 dígitos."""
    if not tel or not isinstance(tel, str):
        return ""
    tel_str = str(tel).strip()
    if tel_str.startswith("****"):
        return tel_str
    digitos = re.sub(r"\D", "", tel_str)
    if len(digitos) < 4:
        return "****"
    return f"****{digitos[-4:]}"


def enmascarar_email(email: str) -> str:
    """Enmascara la parte de usuario de un email preservando el dominio."""
    if not email or not isinstance(email, str):
        return ""
    email_str = str(email).strip()
    if "@" not in email_str:
        return "****"
    partes = email_str.split("@", 1)
    dominio = partes[1].strip().lower()
    return f"***@{dominio}"


def enmascarar_texto_libre(texto: str) -> str:
    """Enmascara emails y teléfonos que puedan estar dentro de notas o texto libre."""
    if not texto or not isinstance(texto, str):
        return ""
    # Enmascarar correos
    texto = re.sub(r"[\w\.-]+@([\w\.-]+)", r"***@\1", texto)
    # Enmascarar teléfonos con secuencias de dígitos
    def _reemplazar_tel(match: re.Match) -> str:
        s = match.group(0)
        digs = re.sub(r"\D", "", s)
        if len(digs) >= 6:
            return f"****{digs[-4:]}"
        return s

    return re.sub(r"\+?\d[\d\s\-\.]{5,}\d", _reemplazar_tel, texto)


def enmascarar_contacto(contacto: dict[str, Any]) -> dict[str, Any]:
    """Retorna una copia profunda sanitizada del contacto para enviar a modelos LLM:
    - Teléfonos: sólo últimos 4 dígitos (****1234).
    - Emails: sólo dominio (***@dominio.com).
    - Notas: teléfonos y correos ofuscados.
    """
    if not isinstance(contacto, dict):
        return {}

    resultado = dict(contacto)

    for k in ("telefonos", "telefonos_e164", "telefonos_fijo_e164", "whatsapp"):
        val = resultado.get(k)
        if isinstance(val, list):
            resultado[k] = [enmascarar_telefono(t) for t in val if t]
        elif isinstance(val, str) and val:
            resultado[k] = enmascarar_telefono(val)

    for k in ("emails", "email"):
        val = resultado.get(k)
        if isinstance(val, list):
            resultado[k] = [enmascarar_email(e) for e in val if e]
        elif isinstance(val, str) and val:
            resultado[k] = enmascarar_email(val)

    if "notas" in resultado and isinstance(resultado["notas"], str):
        resultado["notas"] = enmascarar_texto_libre(resultado["notas"])

    return resultado

@dataclass(frozen=True)
class VeredictoLlm:
    misma_persona: bool
    confianza: float
    razon: str
    proveedor: str = "ollama"


class LlmJudge:
    def __init__(self, config: LlmConfig | None = None) -> None:
        self._config = config

    def decidir(self, contacto_a: dict[str, Any], contacto_b: dict[str, Any]) -> VeredictoLlm | None:
        if self._config and not self._config.activar_para_dudosos:
            return None

        # Enmascarar PII estrictamente antes de cualquier procesamiento LLM (Ley 25.326)
        contacto_a_seguro = enmascarar_contacto(contacto_a)
        contacto_b_seguro = enmascarar_contacto(contacto_b)

        proveedor_config = self._config.primario.proveedor if self._config and self._config.primario else None

        # Si el config solicita explícitamente Anthropic como primario
        if proveedor_config in ("anthropic", "claude"):
            _cargar_dotenv()
            api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
            if api_key:
                modelo = getattr(self._config.primario, "modelo", "claude-3-5-sonnet-20241022") if self._config else "claude-3-5-sonnet-20241022"
                veredicto_anthropic = _decidir_con_anthropic(api_key, contacto_a_seguro, contacto_b_seguro, modelo=modelo)
                if veredicto_anthropic is not None:
                    return veredicto_anthropic
            return None

        # Si el config solicita explícitamente Gemini como primario
        if proveedor_config == "gemini":
            _cargar_dotenv()
            api_key = os.environ.get("GEMINI_API_KEY", "").strip()
            if api_key:
                veredicto_gemini = _decidir_con_gemini(api_key, contacto_a_seguro, contacto_b_seguro)
                if veredicto_gemini is not None:
                    return veredicto_gemini
            return None

        # 1. Proveedor prioritario por defecto: Ollama local
        veredicto_ollama = _decidir_con_ollama(contacto_a_seguro, contacto_b_seguro)
        if veredicto_ollama is not None:
            return veredicto_ollama

        # 2. Fallback seguro: Anthropic (si está configurada la API key)
        _cargar_dotenv()
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if anthropic_key:
            veredicto_anthropic = _decidir_con_anthropic(anthropic_key, contacto_a_seguro, contacto_b_seguro)
            if veredicto_anthropic is not None:
                return veredicto_anthropic

        # 3. Fallback secundario: Gemini Flash (si está configurada la API key)
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if api_key:
            veredicto_gemini = _decidir_con_gemini(api_key, contacto_a_seguro, contacto_b_seguro)
            if veredicto_gemini is not None:
                return veredicto_gemini

        # 4. Fallback a reglas locales (retorna None para resolución determinista / revisión en SQLite)
        logger.info("Ollama/Anthropic/Gemini no disponibles. Fallback a resolución local determinista.")
        return None

        proveedor_config = self._config.primario.proveedor if self._config and self._config.primario else None

        # Si el config solicita explícitamente Gemini como primario
        if proveedor_config == "gemini":
            _cargar_dotenv()
            api_key = os.environ.get("GEMINI_API_KEY", "").strip()
            if api_key:
                veredicto_gemini = _decidir_con_gemini(api_key, contacto_a, contacto_b)
                if veredicto_gemini is not None:
                    return veredicto_gemini
            return None

        # 1. Proveedor prioritario por defecto: Ollama local
        veredicto_ollama = _decidir_con_ollama(contacto_a, contacto_b)
        if veredicto_ollama is not None:
            return veredicto_ollama

        # 2. Fallback secundario: Gemini Flash (si está configurada la API key)
        _cargar_dotenv()
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if api_key:
            veredicto_gemini = _decidir_con_gemini(api_key, contacto_a, contacto_b)
            if veredicto_gemini is not None:
                return veredicto_gemini

        # 3. Fallback a reglas locales (retorna None para resolución determinista / revisión en SQLite)
        logger.info("Ollama/Gemini no disponibles. Fallback a resolución local determinista.")
        return None


# ----------------------------------------------------------------------
# 1. IMPLEMENTACIÓN OLLAMA LOCAL (PRIORITARIO)
# ----------------------------------------------------------------------

def _obtener_ollama_config() -> tuple[str, str]:
    _cargar_dotenv()
    host = os.environ.get("OLLAMA_HOST") or os.environ.get("OLLAMA_URL") or OLLAMA_HOST_DEFAULT
    host = host.rstrip("/")
    model = os.environ.get("OLLAMA_MODEL") or OLLAMA_MODEL_DEFAULT
    return host, model


_ollama_fallos_consecutivos: int = 0
_MAX_FALLOS_OLLAMA: int = 2


def reset_ollama_status() -> None:
    global _ollama_fallos_consecutivos
    _ollama_fallos_consecutivos = 0


def _consultar_ollama(prompt_usuario: str, prompt_sistema: str, timeout: int = 3) -> str | None:
    """Envía una petición a Ollama local exigiendo formato JSON estricto.
    Retorna el texto JSON generado o None si Ollama no está corriendo / falla."""
    global _ollama_fallos_consecutivos
    if _ollama_fallos_consecutivos >= _MAX_FALLOS_OLLAMA:
        return None

    host, model = _obtener_ollama_config()

    # Intentar endpoint /api/chat con format='json'
    url_chat = f"{host}/api/chat"
    payload_chat = {
        "model": model,
        "messages": [
            {"role": "system", "content": prompt_sistema},
            {"role": "user", "content": prompt_usuario},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.0},
    }
    try:
        resp = requests.post(url_chat, json=payload_chat, timeout=timeout)
        if resp.status_code == 200:
            _ollama_fallos_consecutivos = 0
            data = resp.json()
            contenido = data.get("message", {}).get("content", "")
            if contenido:
                return contenido
        elif resp.status_code == 404:
            # Si /api/chat no está implementado o el modelo no está en chat, intentar /api/generate
            url_gen = f"{host}/api/generate"
            payload_gen = {
                "model": model,
                "system": prompt_sistema,
                "prompt": prompt_usuario,
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.0},
            }
            resp_gen = requests.post(url_gen, json=payload_gen, timeout=timeout)
            if resp_gen.status_code == 200:
                _ollama_fallos_consecutivos = 0
                data_gen = resp_gen.json()
                contenido_gen = data_gen.get("response", "")
                if contenido_gen:
                    return contenido_gen
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
        _ollama_fallos_consecutivos += 1
        logger.debug("Ollama local no disponible en %s (%s): %s", host, model, exc)
        return None
    except requests.RequestException as exc:
        _ollama_fallos_consecutivos += 1
        logger.warning("Error consultando Ollama local (%s): %s", model, exc)
        return None

    return None


def _decidir_con_ollama(contacto_a: dict[str, Any], contacto_b: dict[str, Any]) -> VeredictoLlm | None:
    """Desempate de duplicados con Ollama: evalúa si dos registros pertenecen a la misma persona."""
    prompt_usuario = (
        f"Contacto A: {json.dumps(contacto_a, ensure_ascii=False)}\n"
        f"Contacto B: {json.dumps(contacto_b, ensure_ascii=False)}"
    )

    respuesta_texto = _consultar_ollama(prompt_usuario, _PROMPT_SISTEMA_DEDUP)
    if not respuesta_texto:
        return None

    try:
        datos = json.loads(_extraer_json(respuesta_texto))
        misma_persona = bool(datos.get("fusionar", datos.get("misma_persona", False)))
        confianza = float(datos.get("confianza", 0.9 if misma_persona else 0.1))
        justificacion = str(datos.get("justificacion", datos.get("razon", "Decisión Ollama local")))
        return VeredictoLlm(
            misma_persona=misma_persona,
            confianza=confianza,
            razon=justificacion,
            proveedor="ollama",
        )
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        logger.warning("Respuesta inválida de Ollama para desempate: %s (%s)", respuesta_texto, exc)
        return None


# ----------------------------------------------------------------------
# 2. EXTRACCIÓN DE IDENTIDAD Y CLASIFICACIÓN DE CALIDAD
# ----------------------------------------------------------------------

_PROMPT_SISTEMA_EXTRACCION = (
    "Sos un extractor de entidades de contacto profesional.\n"
    "Analizá el texto y extraé OBLIGATORIAMENTE un JSON estricto con los siguientes campos:\n"
    '{"nombre": "nombre de pila", "apellido": "apellido o vacío", "empresa": "organización o vacía", '
    '"cargo": "rol o vacío", "notas": "información complementaria relevante o vacía"}'
)

_PROMPT_SISTEMA_CALIDAD = (
    "Sos un clasificador de calidad de datos de contactos para un CRM empresarial.\n"
    "Categorizá el contacto en una de estas 3 etiquetas exactas:\n"
    '- "util": si tiene nombre/apellido o empresa y al menos un teléfono móvil/WhatsApp o email válido para prospección comercial.\n'
    '- "dudoso": si los datos son ambiguos, nombres genéricos, teléfonos incompletos o requiere revisión humana.\n'
    '- "inutil": si es una fila vacía, código técnico/2FA, registro de prueba o sin datos de contacto útiles.\n\n'
    "Respondé OBLIGATORIAMENTE en formato JSON estricto:\n"
    '{"calidad": "util" | "dudoso" | "inutil", "motivo": "justificación breve"}'
)


def inferir_identidad_cognitiva(texto_crudo: str) -> dict[str, str]:
    """Inferencia cognitiva de identidad (nombre, apellido, empresa, cargo, notas):
    1. Prioridad: Ollama local ('qwen2.5:3b' / 'llama3.2:3b').
    2. Fallback: Gemini Flash (si hay key en .env).
    3. Fallback: Reglas locales deterministas de text_cleaning.
    """
    if not texto_crudo or len(texto_crudo.strip()) < 3:
        return {}

    prompt_usuario = f"Extraé las entidades de contacto de este texto: '{texto_crudo}'"

    # 1. Ollama local
    texto_ollama = _consultar_ollama(prompt_usuario, _PROMPT_SISTEMA_EXTRACCION)
    if texto_ollama:
        try:
            datos = json.loads(_extraer_json(texto_ollama))
            res = _limpiar_dict_identidad(datos)
            if res:
                return res
        except Exception:
            pass

    # 2. Gemini Flash
    _cargar_dotenv()
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if api_key:
        texto_gemini = _consultar_gemini(api_key, prompt_usuario, _PROMPT_SISTEMA_EXTRACCION)
        if texto_gemini:
            try:
                datos = json.loads(_extraer_json(texto_gemini))
                res = _limpiar_dict_identidad(datos)
                if res:
                    return res
            except Exception:
                pass

    # 3. Fallback determinista local en Python
    return _inferir_identidad_local(texto_crudo)


def clasificar_calidad_cognitiva(contacto: dict[str, Any]) -> tuple[str, str]:
    """Clasificación de calidad ('util', 'dudoso', 'inutil'):
    1. Prioridad: Ollama local con JSON estricto.
    2. Fallback: Reglas deterministas locales de clasificar_calidad_registro.
    Devuelve (calidad, motivo).
    """
    contacto_seguro = enmascarar_contacto(contacto)
    prompt_usuario = f"Contacto a clasificar: {json.dumps(contacto_seguro, ensure_ascii=False)}"

    # 1. Ollama local
    texto_ollama = _consultar_ollama(prompt_usuario, _PROMPT_SISTEMA_CALIDAD)
    if texto_ollama:
        try:
            datos = json.loads(_extraer_json(texto_ollama))
            calidad = str(datos.get("calidad", "")).lower().strip()
            motivo = str(datos.get("motivo", "Clasificación cognitiva Ollama"))
            if "util" in calidad:
                return "util", motivo
            elif "dud" in calidad:
                return "dudoso", motivo
            elif "inutil" in calidad or "descarte" in calidad:
                return "inutil", motivo
        except Exception:
            pass

    # 2. Fallback determinista local
    return _clasificar_calidad_local(contacto)


def _limpiar_dict_identidad(datos: dict[str, Any]) -> dict[str, str]:
    res: dict[str, str] = {}
    for k in ("nombre", "apellido", "empresa", "organizacion", "cargo", "notas"):
        v = datos.get(k)
        if v and isinstance(v, str) and v.strip():
            res[k] = v.strip()

    # Sincronizar empresa / organizacion
    if "empresa" in res and "organizacion" not in res:
        res["organizacion"] = res["empresa"]
    elif "organizacion" in res and "empresa" not in res:
        res["empresa"] = res["organizacion"]

    return res


def _inferir_identidad_local(texto_crudo: str) -> dict[str, str]:
    """Fallback determinista local usando text_cleaning."""
    try:
        from motor.text_cleaning import clasificar_identidad
        nom, ape, org, car = clasificar_identidad(texto_crudo, "", "", "")
        res: dict[str, str] = {}
        if nom:
            res["nombre"] = nom
        if ape:
            res["apellido"] = ape
        if org:
            res["empresa"] = org
            res["organizacion"] = org
        if car:
            res["cargo"] = car
        return res
    except Exception:
        return {}


def _clasificar_calidad_local(contacto: dict[str, Any]) -> tuple[str, str]:
    """Fallback determinista local usando clasificar_calidad_registro."""
    try:
        from motor.normalize_pipeline import clasificar_calidad_registro
        return clasificar_calidad_registro(
            nombre=contacto.get("nombre"),
            apellido=contacto.get("apellido"),
            organizacion=contacto.get("organizacion") or contacto.get("empresa"),
            cargo=contacto.get("cargo"),
            telefonos_movil=contacto.get("telefonos_e164", []) or contacto.get("telefonos", []),
            telefonos_fijo=contacto.get("telefonos_fijo_e164", []),
            emails=contacto.get("emails", []),
            flags=contacto.get("flags", []),
            notas=contacto.get("notas"),
        )
    except Exception:
        return "dudoso", "Fallback de reglas locales"



# ----------------------------------------------------------------------
# 2.5 IMPLEMENTACIÓN ANTHROPIC CLAUDE (PAGO / PRIVADO / SIN REENTRENAMIENTO)
# ----------------------------------------------------------------------

def _decidir_con_anthropic(
    api_key: str,
    contacto_a: dict[str, Any],
    contacto_b: dict[str, Any],
    modelo: str = "claude-3-5-sonnet-20241022",
) -> VeredictoLlm | None:
    """Consulta la API de Anthropic Claude garantizando privacidad de datos reales."""
    contacto_a_seguro = enmascarar_contacto(contacto_a)
    contacto_b_seguro = enmascarar_contacto(contacto_b)

    prompt_usuario = (
        f"Contacto A: {json.dumps(contacto_a_seguro, ensure_ascii=False)}\n"
        f"Contacto B: {json.dumps(contacto_b_seguro, ensure_ascii=False)}"
    )

    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    modelo_real = modelo if "claude" in modelo else "claude-3-5-sonnet-20241022"
    payload = {
        "model": modelo_real,
        "max_tokens": 300,
        "system": _PROMPT_SISTEMA_DEDUP,
        "messages": [
            {"role": "user", "content": prompt_usuario}
        ],
        "temperature": 0.0,
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        if resp.status_code == 200:
            datos = resp.json()
            bloques = datos.get("content", [])
            if bloques:
                texto = bloques[0].get("text", "")
                parsed = json.loads(_extraer_json(texto))
                misma_persona = bool(parsed.get("fusionar", parsed.get("misma_persona", False)))
                confianza = float(parsed.get("confianza", 0.95))
                justificacion = str(parsed.get("justificacion", parsed.get("razon", "Decisión Anthropic Claude")))
                return VeredictoLlm(
                    misma_persona=misma_persona,
                    confianza=confianza,
                    razon=justificacion,
                    proveedor="anthropic",
                )
        else:
            logger.warning("Anthropic respondió HTTP %d: %s", resp.status_code, resp.text[:200])
            return None
    except Exception as exc:
        logger.warning("Error consultando Anthropic (%s): %s", modelo, exc)
        return None

    return None

# ----------------------------------------------------------------------
# 3. IMPLEMENTACIÓN GEMINI FLASH (FALLBACK SECUNDARIO)
# ----------------------------------------------------------------------

def _decidir_con_gemini(api_key: str, contacto_a: dict[str, Any], contacto_b: dict[str, Any]) -> VeredictoLlm | None:
    prompt_usuario = (
        f"Contacto A: {json.dumps(contacto_a, ensure_ascii=False)}\n"
        f"Contacto B: {json.dumps(contacto_b, ensure_ascii=False)}"
    )
    texto_respuesta = _consultar_gemini(api_key, prompt_usuario, _PROMPT_SISTEMA_DEDUP)
    if not texto_respuesta:
        return None

    try:
        datos = json.loads(_extraer_json(texto_respuesta))
        misma_persona = bool(datos.get("fusionar", datos.get("misma_persona", False)))
        confianza = float(datos.get("confianza", 0.5))
        justificacion = str(datos.get("justificacion", datos.get("razon", "Decisión Gemini Flash")))
        return VeredictoLlm(
            misma_persona=misma_persona,
            confianza=confianza,
            razon=justificacion,
            proveedor="gemini",
        )
    except (KeyError, ValueError, json.JSONDecodeError):
        return None


def _consultar_gemini(api_key: str, prompt_usuario: str, prompt_sistema: str = _PROMPT_SISTEMA_DEDUP) -> str | None:
    """Invoca Gemini Flash con throttle preventivo (time.sleep(4)) y captura inmediata
    de 429/503/ReadTimeout para no bloquear la ejecución."""
    time.sleep(_THROTTLE_GEMINI_SEGUNDOS)

    modelos = (_MODELO_GEMINI_DEFAULT, "gemini-3.6-flash", "gemini-flash-lite-latest")

    for modelo in modelos:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{prompt_sistema}\n\n{prompt_usuario}"}],
                }
            ],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json",
            },
        }

        try:
            resp = requests.post(url, json=payload, timeout=_TIMEOUT_GEMINI_SEGUNDOS)

            if resp.status_code == 200:
                datos = resp.json()
                candidatos = datos.get("candidates", [])
                if candidatos:
                    partes = candidatos[0].get("content", {}).get("parts", [])
                    if partes:
                        return partes[0].get("text", "")
                return None

            if resp.status_code in (429, 503):
                logger.warning(
                    "Gemini (%s) HTTP %d. Captura inmediata; par enviado a revisión pendiente.",
                    modelo,
                    resp.status_code,
                )
                return None

            texto_error = getattr(resp, "text", "")
            logger.warning(
                "Gemini Flash (%s) respondió status %d: %s",
                modelo,
                resp.status_code,
                texto_error[:150],
            )
            if resp.status_code != 404:
                return None

        except requests.exceptions.ReadTimeout as exc:
            logger.warning("Gemini (%s) ReadTimeout: %s", modelo, exc)
            return None

        except requests.RequestException as exc:
            logger.warning("Excepción consultando Gemini Flash (%s): %s", modelo, exc)
            return None

    return None


def _extraer_json(texto: str | None) -> str:
    if not texto:
        raise ValueError("respuesta del LLM vacía")
    inicio, fin = texto.find("{"), texto.rfind("}")
    if inicio == -1 or fin == -1:
        raise ValueError("respuesta del LLM sin JSON")
    return texto[inicio : fin + 1]


def _cargar_dotenv() -> None:
    env_candidatos = [
        Path(".env"),
        Path(__file__).resolve().parents[3] / ".env",
        Path("c:/github/MejoraContactos/motor-contactos/.env"),
    ]
    for p in env_candidatos:
        if p.is_file():
            load_dotenv(dotenv_path=p, override=False)
            break
    else:
        load_dotenv(override=False)
