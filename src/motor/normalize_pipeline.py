"""Conecta raw_records con los normalizadores de teléfono/email existentes
(phone_normalizer.py, email_normalizer.py — sin tocarlos), y escribe
normalized_records + sus índices de teléfono/email (usados por
dedup/blocking.py) y la tabla FTS5 de búsqueda.

Los teléfonos se separan en móvil (Whatsapp) y fijo según el flag "fijo"
que ya devuelve phone_normalizer — pedido explícito del usuario (Ficha
15.1: columnas "Whatsapp" y "Telefono Fijo" separadas en el export final).
Para blocking/dedup ambos se indexan igual en telefono_index: la distinción
solo importa para el export, no para decidir si dos contactos son la misma
persona.

nombre/apellido/organizacion/cargo pasan por text_cleaning.clasificar_
identidad — sin esto, datos reales sucios (un teléfono guardado como
nombre, un cargo con tres roles concatenados, un nombre de empresa metido
en el campo Apellido) llegaban tal cual al export final."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from motor.config import Config
from motor.email_normalizer import normalizar_campo_email
from motor.phone_normalizer import normalizar_campo_telefono
from motor.tagging import auto_etiquetar
from motor.text_cleaning import clasificar_identidad, limpiar_lugar, limpiar_texto_libre


def normalizar_todo(config: Config, conn: sqlite3.Connection) -> int:
    """Devuelve la cantidad de normalized_records nuevos."""
    pendientes = conn.execute(
        "SELECT r.id, r.raw_json FROM raw_records r "
        "LEFT JOIN normalized_records n ON n.raw_record_id = r.id "
        "WHERE n.id IS NULL"
    ).fetchall()

    for fila in pendientes:
        campos = json.loads(fila["raw_json"])
        _normalizar_registro(config, conn, fila["id"], campos)
    conn.commit()
    return len(pendientes)


def _normalizar_registro(
    config: Config, conn: sqlite3.Connection, raw_record_id: int, campos: dict[str, str]
) -> None:
    if _es_contacto_diagnostico(campos):
        # Ej: la app "Contacts+" agrega un contacto propio con una nota que
        # dice "This contact was created by Contacts+ in order to detect
        # any syncing loops" — no es una persona, es un contacto técnico
        # de la app. No se inserta normalized_record para él.
        return

    nombre_crudo = campos.get("nombre") or campos.get("nombre_completo")
    apellido_crudo = campos.get("apellido")
    organizacion_crudo = campos.get("organizacion")
    cargo_crudo = campos.get("cargo")

    if _es_fila_plantilla_google(nombre_crudo, apellido_crudo):
        # Google Contacts agrega una fila "de ejemplo" al exportar, donde
        # cada campo vale literalmente el nombre de ese campo ("Nombre":
        # "Nombre", "Cargo": "Cargo", etc.) — no es un contacto real.
        nombre_crudo = apellido_crudo = organizacion_crudo = cargo_crudo = None

    nombre, apellido, organizacion, cargo = clasificar_identidad(
        nombre_crudo, apellido_crudo, organizacion_crudo, cargo_crudo
    )

    domicilio = limpiar_texto_libre(campos.get("domicilio")) or None
    ciudad = limpiar_lugar(campos.get("ciudad")) or None
    provincia = limpiar_lugar(campos.get("provincia")) or None
    pais = limpiar_lugar(campos.get("pais")) or None
    notas = limpiar_texto_libre(campos.get("notas")) or None
    cumpleanos = (campos.get("cumpleanos") or "").strip() or None
    foto_url = (campos.get("foto_url") or "").strip() or None
    nombre = nombre or None
    apellido = apellido or None
    organizacion = organizacion or None
    cargo = cargo or None
    tag = auto_etiquetar(cargo, organizacion, notas)

    telefonos_movil: list[str] = []
    telefonos_fijo: list[str] = []
    emails: list[str] = []
    flags: list[str] = []

    for clave, valor in campos.items():
        if clave.startswith("telefono_") and not clave.endswith("_etiqueta"):
            etiqueta = campos.get(f"{clave}_etiqueta")
            for r in normalizar_campo_telefono(valor, config.telefono, etiqueta):
                if r.e164:
                    (telefonos_fijo if "fijo" in r.flags else telefonos_movil).append(r.e164)
                flags.extend(f"telefono:{f}" for f in r.flags)
        elif clave.startswith("email_"):
            for r in normalizar_campo_email(valor, config.email):
                if r.normalizado:
                    emails.append(r.normalizado)
                flags.extend(f"email:{f}" for f in r.flags)

    telefonos_movil = sorted(set(telefonos_movil))
    telefonos_fijo = sorted(set(telefonos_fijo))
    emails = sorted(set(emails))

    cursor = conn.execute(
        "INSERT INTO normalized_records "
        "(raw_record_id, nombre, apellido, organizacion, cargo, telefonos_e164, "
        "telefonos_fijo_e164, emails, domicilio, ciudad, provincia, pais, tag, "
        "cumpleanos, foto_url, notas, flags, creado_en) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            raw_record_id,
            nombre,
            apellido,
            organizacion,
            cargo,
            json.dumps(telefonos_movil),
            json.dumps(telefonos_fijo),
            json.dumps(emails),
            domicilio,
            ciudad,
            provincia,
            pais,
            tag,
            cumpleanos,
            foto_url,
            notas,
            json.dumps(flags),
            _ahora(),
        ),
    )
    normalized_id = cursor.lastrowid

    for e164 in telefonos_movil + telefonos_fijo:
        conn.execute(
            "INSERT INTO telefono_index (normalized_record_id, e164) VALUES (?, ?)",
            (normalized_id, e164),
        )
    for email in emails:
        conn.execute(
            "INSERT INTO email_index (normalized_record_id, email) VALUES (?, ?)",
            (normalized_id, email),
        )

    conn.execute(
        "INSERT INTO busqueda_fts (rowid, nombre, apellido, organizacion, telefonos, emails, notas) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            normalized_id,
            nombre or "",
            apellido or "",
            organizacion or "",
            " ".join(telefonos_movil + telefonos_fijo),
            " ".join(emails),
            notas or "",
        ),
    )


_PLANTILLA_GOOGLE = {"nombre", "apellido", "nombre modelo", "apellido modelo"}

_FIRMAS_CONTACTO_DIAGNOSTICO = (
    "created by contacts+ in order to detect",
    "we will be unable to perform a safety check",
)


def _es_fila_plantilla_google(nombre_crudo: str | None, apellido_crudo: str | None) -> bool:
    n = (nombre_crudo or "").strip().lower()
    a = (apellido_crudo or "").strip().lower()
    return n in _PLANTILLA_GOOGLE and a in _PLANTILLA_GOOGLE


def _es_contacto_diagnostico(campos: dict[str, str]) -> bool:
    notas = (campos.get("notas") or "").lower()
    return any(firma in notas for firma in _FIRMAS_CONTACTO_DIAGNOSTICO)


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()
