"""Extracción heurística de contactos desde texto libre (.txt/.log,
WhatsApp exportado como texto, notas) — Fase 3, experimental. Siempre
confianza_extraccion="baja": un regex sobre prosa arbitraria va a tener
falsos positivos (un rango de fechas o un precio con guiones puede
"parecer" un teléfono), y el motor de dedup ya está diseñado para no
auto-fusionar nada de baja confianza contra un contacto verificado sin
pasar por revisión (ver dedup/scoring.py) — esa es la salvaguarda real,
no un regex más estricto.

Estrategia: separar el texto en bloques por línea en blanco, buscar dentro
de cada bloque tokens con forma de email o de teléfono, y si hay una línea
que parece nombre (sin dígitos, sin "@", pocas palabras), asociarla. Lo
que no calza con este patrón simple queda sin extraer — mejor perder un
caso raro que fabricar un dato falso.

Nota de alcance: el plan original mencionaba delegar a un LLM (llm_judge.py)
cuando el regex no encuentra nada. Eso requeriría que el registro de
extractores acepte config (API keys, modelo) además de path, que hoy no es
parte del contrato de extractors/base.py — es un cambio de arquitectura
real, no un ajuste rápido; queda señalado para cuando haga falta en la
práctica, no implementado todavía."""

from __future__ import annotations

import re
from pathlib import Path

from motor.extractors.base import RawContactRecord, registrar

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_TELEFONO_RE = re.compile(r"(?:\+?\d[\d\s().\-]{5,17}\d)")
_NOMBRE_RE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ\s.'\-]{3,40}$")


@registrar("txt", "log", "md")
def extraer_texto_libre(path: Path) -> list[RawContactRecord]:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        contenido = f.read()

    return [
        RawContactRecord(str(path), i, campos, confianza_extraccion="baja")
        for i, campos in enumerate(extraer_contactos_de_texto(contenido), start=1)
    ]


def extraer_contactos_de_texto(texto: str) -> list[dict[str, str]]:
    """Punto de entrada reusable: pdf_extractor.py e image_ocr_extractor.py
    llaman a esto sobre el texto que consiguen extraer/reconocer, en vez de
    duplicar la heurística."""
    bloques = re.split(r"\n\s*\n", texto)
    resultados: list[dict[str, str]] = []
    for bloque in bloques:
        campos = _analizar_bloque(bloque)
        if campos:
            resultados.append(campos)
    return resultados


def _analizar_bloque(bloque: str) -> dict[str, str]:
    campos: dict[str, str] = {}

    emails = list(dict.fromkeys(_EMAIL_RE.findall(bloque)))
    for i, email in enumerate(emails, start=1):
        campos[f"email_{i}"] = email

    telefonos = list(dict.fromkeys(t.strip() for t in _TELEFONO_RE.findall(bloque) if _digitos(t) >= 6))
    for i, telefono in enumerate(telefonos, start=1):
        campos[f"telefono_{i}"] = telefono

    if not campos:
        return {}

    nombre = _buscar_nombre(bloque)
    if nombre:
        campos["nombre_completo"] = nombre

    return campos


def _digitos(texto: str) -> int:
    return sum(1 for c in texto if c.isdigit())


def _buscar_nombre(bloque: str) -> str | None:
    for linea in bloque.splitlines():
        candidato = linea.strip(" :\t-")
        if not candidato:
            continue
        if _EMAIL_RE.search(candidato) or _digitos(candidato) >= 4:
            continue
        if _NOMBRE_RE.match(candidato) and 1 <= len(candidato.split()) <= 5:
            return candidato
    return None
