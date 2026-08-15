"""Backfill puntual (2026-08-13): cumpleaños y foto se agregaron a
_CAMPOS_PERSONA/_persona_a_campos DESPUÉS de que los 36.103 raw_records ya
estuvieran importados -- el mecanismo incremental normal de
importar_google_contactos() no los va a traer solo, porque se salta
cualquier contacto cuyo etag de Google no cambió (y agregar un campo que
nosotros pedimos no cambia el etag del contacto en Google).

En vez de forzar un reimport completo (duplicaría los 36.103 raw_records,
porque el INSERT de importar_google_contactos() no tiene lógica de
"actualizar si ya existe", solo "insertar si no está"), este script pide
SOLO birthdays+photos en una pasada de connections.list (paginada, ~37
páginas por cuenta -- mismo volumen que un import normal, pero liviana
porque personFields pide poco) y actualiza directamente el raw_json y los
dos campos nuevos de normalized_records para los raw_records que ya
existen, matcheando por resourceName.

Excepción deliberada y acotada a "raw_records nunca se edita": acá se
edita, pero solo para completar dos campos que deberían haber estado desde
el importe original y nunca se capturaron por un olvido de scope, no para
limpiar/corregir datos reales del contacto. No es un precedente para
editar raw_records por otro motivo."""

from __future__ import annotations

import json
import sqlite3
import sys

sys.path.insert(0, "src")

from motor.config import cargar_config
from motor.google_contacts_source import obtener_credenciales
from motor.staging_db import conectar

_CAMPOS = "birthdays,photos"


def _cumpleanos_de(persona: dict) -> str | None:
    cumpleanos = persona.get("birthdays") or []
    if not cumpleanos:
        return None
    fecha = cumpleanos[0].get("date") or {}
    dia, mes, anio = fecha.get("day"), fecha.get("month"), fecha.get("year")
    if not (dia and mes):
        return None
    return f"{dia:02d}/{mes:02d}/{anio}" if anio else f"{dia:02d}/{mes:02d}"


def _foto_de(persona: dict) -> str | None:
    for foto in persona.get("photos") or []:
        if foto.get("url") and not foto.get("default"):
            return foto["url"]
    return None


def backfill_cuenta(conn: sqlite3.Connection, cuenta: str) -> tuple[int, int]:
    from googleapiclient.discovery import build

    creds = obtener_credenciales(cuenta)
    servicio = build("people", "v1", credentials=creds)

    actualizados_raw = 0
    actualizados_norm = 0
    token_pagina = None
    pagina_n = 0
    while True:
        pagina_n += 1
        respuesta = (
            servicio.people()
            .connections()
            .list(
                resourceName="people/me",
                pageSize=1000,
                personFields=_CAMPOS,
                pageToken=token_pagina,
            )
            .execute()
        )

        for persona in respuesta.get("connections", []):
            cumpleanos = _cumpleanos_de(persona)
            foto_url = _foto_de(persona)
            if not cumpleanos and not foto_url:
                continue

            resource_name = persona.get("resourceName", "")
            ruta_virtual = f"google:{cuenta}:{resource_name}"
            fila_raw = conn.execute(
                "SELECT id, raw_json FROM raw_records WHERE source_file = ?", (ruta_virtual,)
            ).fetchone()
            if fila_raw is None:
                continue

            campos = json.loads(fila_raw["raw_json"])
            if cumpleanos:
                campos["cumpleanos"] = cumpleanos
            if foto_url:
                campos["foto_url"] = foto_url
            conn.execute(
                "UPDATE raw_records SET raw_json = ? WHERE id = ?",
                (json.dumps(campos, ensure_ascii=False), fila_raw["id"]),
            )
            actualizados_raw += 1

            cur = conn.execute(
                "UPDATE normalized_records SET cumpleanos = COALESCE(?, cumpleanos), "
                "foto_url = COALESCE(?, foto_url) WHERE raw_record_id = ?",
                (cumpleanos, foto_url, fila_raw["id"]),
            )
            actualizados_norm += cur.rowcount

        conn.commit()
        print(f"  [{cuenta}] pagina {pagina_n} -- acumulado raw={actualizados_raw} norm={actualizados_norm}", flush=True)

        token_pagina = respuesta.get("nextPageToken")
        if not token_pagina:
            break

    return actualizados_raw, actualizados_norm


def main() -> None:
    config = cargar_config("config.yaml")
    conn = conectar(config.rutas.base_sqlite)
    for cuenta in config.google.cuentas:
        print(f"Backfill cumpleaños/foto para cuenta '{cuenta}'...")
        raw, norm = backfill_cuenta(conn, cuenta)
        print(f"  {cuenta}: {raw} raw_records actualizados, {norm} normalized_records actualizados")
    conn.close()


if __name__ == "__main__":
    main()
