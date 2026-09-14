"""Sincroniza el "contacto final" de motor-contactos hacia la tabla
`contactos_finales` en el proyecto Supabase de este mismo repo -- pensada
como la fuente de verdad compartida que van a consumir sistemas externos
(MejoraCRM, y en el futuro MejoraWS). Ver ESQUEMA-CONTACTO-COMPARTIDO.md
§ Resuelto para el diseño completo (tabla, RLS, API keys por sistema).

Best-effort y no bloqueante por diseño: si SUPABASE_URL/
SUPABASE_SERVICE_ROLE_KEY no están configurados (ver .env.example -- hoy,
uso normal, no lo están) o la request de red falla, esto se loguea y el
pipeline de dedup sigue funcionando exactamente igual que si esta
sincronización no existiera. Nunca debe ser la causa de que una corrida de
deduplicación, una fusión aprobada o un deshacer fallen."""

from __future__ import annotations

import logging
import os
from typing import Iterable

import requests

from motor import export

logger = logging.getLogger(__name__)

_TABLA = "contactos_finales"
# PostgREST acepta upserts en lote vía POST con un array JSON en el body --
# se trocea igual por las dudas de un lote muy grande (backfill inicial de
# ~8.500 contactos) contra límites de tamaño de request.
_TAMANO_LOTE = 200
_TIMEOUT_SEGUNDOS = 15


def sincronizar_contactos(conn, persona_ids: Iterable[str]) -> dict:
    """Empuja (upsert) a Supabase los contactos finales de los persona_id
    dados. Devuelve un dict de diagnóstico -- el caller (merge_engine.py)
    lo ignora a propósito, esto es fire-and-forget best-effort, nunca debe
    interrumpir al pipeline si algo sale mal."""
    ids = {pid for pid in persona_ids if pid}
    if not ids:
        return {"sincronizado": False, "motivo": "sin persona_ids"}

    url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_key:
        logger.info(
            "Supabase no configurado (falta SUPABASE_URL y/o "
            "SUPABASE_SERVICE_ROLE_KEY en el entorno) -- se omite la "
            "sincronización de %d contacto(s). Ver motor-contactos/.env.example.",
            len(ids),
        )
        return {"sincronizado": False, "motivo": "supabase no configurado"}

    contactos = export.obtener_contactos_por_persona(conn, ids)
    if not contactos:
        return {"sincronizado": False, "motivo": "sin contactos para esos persona_ids"}

    filas = [_a_fila_supabase(c) for c in contactos]
    endpoint = f"{url.rstrip('/')}/rest/v1/{_TABLA}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        # merge-duplicates = upsert por la primary key (persona_id) de la
        # tabla, sin necesitar on_conflict explícito. return=minimal: no
        # nos interesa la fila de vuelta, solo confirmar 2xx.
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    enviados = 0
    for inicio in range(0, len(filas), _TAMANO_LOTE):
        lote = filas[inicio : inicio + _TAMANO_LOTE]
        try:
            respuesta = requests.post(endpoint, json=lote, headers=headers, timeout=_TIMEOUT_SEGUNDOS)
            respuesta.raise_for_status()
            enviados += len(lote)
        except requests.RequestException as exc:
            logger.warning(
                "Fallo al sincronizar %d contacto(s) a Supabase (%s) -- el "
                "pipeline de dedup sigue igual, se reintentará en la "
                "próxima operación que toque a esas personas.",
                len(lote),
                exc,
            )
            return {
                "sincronizado": enviados > 0,
                "motivo": f"error de red/HTTP: {exc}",
                "enviados": enviados,
                "total": len(filas),
            }

    return {"sincronizado": True, "enviados": enviados, "total": len(filas)}


def _a_fila_supabase(c: dict) -> dict:
    return {
        "persona_id": c["persona_id"],
        "cluster_id": c["cluster_id"],
        "nombre": c["nombre"],
        "apellido": c["apellido"],
        "cargo": c["cargo"],
        "organizacion": c["organizacion"],
        "whatsapp": sorted(c["whatsapp"]),
        "telefono_fijo": sorted(c["telefono_fijo"]),
        "emails": sorted(c["emails"]),
        "tag": c["tag"],
        "domicilio": c["domicilio"],
        "ciudad": c["ciudad"],
        "provincia": c["provincia"],
        "pais": c["pais"],
        "cumpleanos": c["cumpleanos"] or None,
        "foto_url": c["foto_url"] or None,
        "nota_referencia": c["nota_referencia"],
        "flags": sorted(c["flags"]),
        "editado_manualmente": bool(c["editado_manualmente"]),
        "updated_at": c["updated_at"] or None,
    }
