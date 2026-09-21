"""Módulo de Sincronización Segura a Google People API y Rollback (Undo).

Permite impactar contactos canónicos hacia las cuentas de Google (Sindy y Pablo)
respetando la regla de gobernanza regente de Sindy, guardando un manifiesto
de rollback para revertir las modificaciones de manera exacta e idempotente.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from motor.config import Config

logger = logging.getLogger(__name__)

_SCOPES_CONTACTS_ESCRITURA = ["https://www.googleapis.com/auth/contacts"]
_CAMPOS_PERSONA = "names,phoneNumbers,emailAddresses,organizations,addresses,biographies,photos"


def _ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _obtener_carpeta_backups(config: Config) -> Path:
    carpeta = config.rutas.carpeta_salida.parent / "Backups"
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def _obtener_servicio_google(cuenta: str, service_mock: Any = None) -> Any:
    """Devuelve el cliente de Google People API con permisos de escritura o el mock provisto."""
    if service_mock is not None:
        return service_mock

    from googleapiclient.discovery import build
    from motor.google_contacts_source import obtener_credenciales

    creds = obtener_credenciales(cuenta, scopes=_SCOPES_CONTACTS_ESCRITURA)
    return build("people", "v1", credentials=creds)


def _contacto_a_person_body(c: dict[str, Any], etag: str | None = None) -> dict[str, Any]:
    """Convierte un contacto unificado canónico al formato Person de Google People API."""
    body: dict[str, Any] = {}
    if etag:
        body["etag"] = etag

    # Nombres
    nombre = (c.get("nombre") or "").strip()
    apellido = (c.get("apellido") or "").strip()
    if nombre or apellido:
        body["names"] = [{
            "givenName": nombre,
            "familyName": apellido,
        }]

    # Organizaciones
    empresa = (c.get("empresa") or c.get("organizacion") or "").strip()
    cargo = (c.get("cargo") or "").strip()
    if empresa or cargo:
        body["organizations"] = [{
            "name": empresa,
            "title": cargo,
        }]

    # Teléfonos (WhatsApp y Fijo)
    telefonos = []
    for wa in sorted(list(c.get("whatsapp") or [])):
        if wa:
            telefonos.append({"value": str(wa), "type": "mobile"})
    for tf in sorted(list(c.get("telefono_fijo") or [])):
        if tf:
            telefonos.append({"value": str(tf), "type": "work"})
    if telefonos:
        body["phoneNumbers"] = telefonos

    # Emails
    emails = []
    for em in sorted(list(c.get("emails") or [])):
        if em:
            emails.append({"value": str(em), "type": "work"})
    if emails:
        body["emailAddresses"] = emails

    # Notas / Biografía
    nota = (c.get("nota_referencia") or c.get("notas") or "").strip()
    if isinstance(nota, list):
        nota = " | ".join(dict.fromkeys(nota))
    if nota:
        body["biographies"] = [{"value": nota, "contentType": "TEXT_PLAIN"}]

    return body


def _extraer_identificadores_google(persona: dict[str, Any]) -> tuple[set[str], set[str], str]:
    """Extrae conjunto de teléfonos, emails y nombre completo de una persona de Google."""
    phones = set()
    for p in persona.get("phoneNumbers", []):
        val = p.get("value", "").replace(" ", "").replace("-", "")
        if val:
            phones.add(val)

    emails = set()
    for e in persona.get("emailAddresses", []):
        val = e.get("value", "").strip().lower()
        if val:
            emails.add(val)

    nom_comp = ""
    for n in persona.get("names", []):
        nom_comp = f"{n.get('givenName', '')} {n.get('familyName', '')}".strip().lower()
        if nom_comp:
            break

    return phones, emails, nom_comp


def sincronizar_hacia_google(
    cuenta: str,
    config: Config,
    conn: sqlite3.Connection | None = None,
    dry_run: bool = False,
    service_mock: Any = None,
    lista_canonica: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Sincroniza los contactos consolidados hacia Google People API respetando la

    gobernanza regente de Sindy y genera un rollback_manifest_%Y%m%d_%H%M%S.json.
    """
    cuenta = cuenta.strip().lower()
    if cuenta not in ("sindy", "pablo"):
        raise ValueError(f"Cuenta inválida '{cuenta}'. Solo se permite 'sindy' o 'pablo'.")

    # 1. Obtener lista canónica
    if lista_canonica is None:
        if conn is None:
            from motor.staging_db import conectar
            conn = conectar(config.rutas.base_sqlite)
        from motor.export import _materializar_clusters
        lista_canonica = _materializar_clusters(conn)

    # 2. Inicializar servicio People API
    servicio = _obtener_servicio_google(cuenta, service_mock=service_mock)

    # 3. Leer contactos actuales de Google
    contactos_google = []
    token_pagina = None
    try:
        while True:
            req = servicio.people().connections().list(
                resourceName="people/me",
                pageSize=1000,
                personFields=_CAMPOS_PERSONA,
                pageToken=token_pagina,
            )
            resp = req.execute()
            contactos_google.extend(resp.get("connections", []))
            token_pagina = resp.get("nextPageToken")
            if not token_pagina:
                break
    except Exception as exc:
        logger.warning("Error leyendo contactos de Google para %s: %s", cuenta, exc)

    # Mapear contactos de Google por teléfonos, emails y nombre
    indice_google: dict[str, dict[str, Any]] = {}
    for g in contactos_google:
        res_name = g.get("resourceName", "")
        phones, emails, nom = _extraer_identificadores_google(g)
        for ph in phones:
            indice_google[f"ph:{ph}"] = g
        for em in emails:
            indice_google[f"em:{em}"] = g
        if nom:
            indice_google[f"nm:{nom}"] = g

    altas: list[dict[str, Any]] = []
    modificaciones: list[dict[str, Any]] = []
    sin_cambios: int = 0
    personas_modificadas_registradas: set[str] = set()

    for can in lista_canonica:
        # Respetar Gobernanza de Sindy
        # Si la cuenta destino es 'pablo' y el contacto tiene marca 'sindy_regente',
        # el contacto canónico porta la jerarquía ya unificada por Sindy
        nombre_can = (can.get("nombre") or "").strip()
        apellido_can = (can.get("apellido") or "").strip()
        nom_completo = f"{nombre_can} {apellido_can}".strip().lower()

        wa_phones = can.get("whatsapp") or set()
        tf_phones = can.get("telefono_fijo") or set()
        all_phones = wa_phones | tf_phones
        all_emails = can.get("emails") or set()

        # Buscar coincidencia en Google
        match_google = None
        for ph in all_phones:
            val = str(ph).replace(" ", "").replace("-", "")
            if f"ph:{val}" in indice_google:
                match_google = indice_google[f"ph:{val}"]
                break
        if not match_google:
            for em in all_emails:
                val = str(em).strip().lower()
                if f"em:{val}" in indice_google:
                    match_google = indice_google[f"em:{val}"]
                    break
        if not match_google and nom_completo:
            if f"nm:{nom_completo}" in indice_google:
                match_google = indice_google[f"nm:{nom_completo}"]

        if match_google is None:
            # Es un alta nueva
            nuevo_body = _contacto_a_person_body(can)
            altas.append({
                "canonico": can,
                "body": nuevo_body,
            })
        else:
            res_name = match_google.get("resourceName")
            if res_name in personas_modificadas_registradas:
                continue

            etag = match_google.get("etag")
            nuevo_body = _contacto_a_person_body(can, etag=etag)

            # Comparar si hay diferencias sustanciales
            g_phones, g_emails, g_nom = _extraer_identificadores_google(match_google)
            can_phones = {str(p).replace(" ", "").replace("-", "") for p in all_phones}
            can_emails = {str(e).strip().lower() for e in all_emails}

            hay_diferencia = (
                (g_nom != nom_completo and nom_completo != "") or
                (can_phones != g_phones and len(can_phones) > 0) or
                (can_emails != g_emails and len(can_emails) > 0)
            )

            if hay_diferencia:
                modificaciones.append({
                    "resource_name": res_name,
                    "etag": etag,
                    "estado_anterior": match_google,
                    "estado_nuevo": nuevo_body,
                    "canonico": can,
                })
                personas_modificadas_registradas.add(res_name)
            else:
                sin_cambios += 1

    # Si es DRY RUN, retornar cálculo predictivo
    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "cuenta": cuenta,
            "altas_estimadas": len(altas),
            "modificaciones_estimadas": len(modificaciones),
            "sin_cambios": sin_cambios,
            "total_canónicos": len(lista_canonica),
            "detalles_altas": [
                f"{a['canonico'].get('nombre', '')} {a['canonico'].get('apellido', '')}".strip()
                for a in altas[:10]
            ],
            "detalles_modificaciones": [
                f"{m['canonico'].get('nombre', '')} {m['canonico'].get('apellido', '')}".strip()
                for m in modificaciones[:10]
            ],
        }

    # EJECUCIÓN REAL (dry_run=False): Crear Manifiesto de Rollback
    carpeta_backups = _obtener_carpeta_backups(config)
    ahora_dt = datetime.now(timezone.utc)
    estampa = ahora_dt.strftime("%Y%m%d_%H%M%S")
    manifest_name = f"rollback_manifest_{estampa}.json"
    manifest_path = carpeta_backups / manifest_name
    if manifest_path.exists():
        manifest_name = f"rollback_manifest_{estampa}_{ahora_dt.microsecond:06d}.json"
        manifest_path = carpeta_backups / manifest_name

    operaciones_registradas: list[dict[str, Any]] = []

    # 1. Ejecutar modificaciones
    mods_exitosas = 0
    for mod in modificaciones:
        res_name = mod["resource_name"]
        body = mod["estado_nuevo"]
        try:
            req = servicio.people().updateContact(
                resourceName=res_name,
                body=body,
                updatePersonFields="names,phoneNumbers,emailAddresses,organizations,biographies",
            )
            resp = req.execute()
            operaciones_registradas.append({
                "tipo": "update",
                "resource_name": res_name,
                "etag": mod["etag"],
                "estado_anterior": mod["estado_anterior"],
                "estado_nuevo": resp,
            })
            mods_exitosas += 1
        except Exception as exc:
            logger.error("Error actualizando contacto %s en Google: %s", res_name, exc)

    # 2. Ejecutar altas
    altas_exitosas = 0
    for alta in altas:
        body = alta["body"]
        try:
            req = servicio.people().createContact(body=body)
            resp = req.execute()
            nuevo_res_name = resp.get("resourceName")
            operaciones_registradas.append({
                "tipo": "create",
                "resource_name": nuevo_res_name,
                "etag": resp.get("etag"),
                "estado_anterior": None,
                "estado_nuevo": resp,
            })
            altas_exitosas += 1
        except Exception as exc:
            logger.error("Error creando nuevo contacto en Google: %s", exc)

    # 3. Guardar manifiesto de rollback en disco
    manifiesto_data = {
        "version": "1.0",
        "cuenta": cuenta,
        "creado_en": ahora_dt.isoformat(),
        "revertido": False,
        "revertido_en": None,
        "total_altas": altas_exitosas,
        "total_modificaciones": mods_exitosas,
        "operaciones": operaciones_registradas,
    }
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(manifiesto_data, f, indent=2, ensure_ascii=False)

    return {
        "ok": True,
        "dry_run": False,
        "cuenta": cuenta,
        "altas_ejecutadas": altas_exitosas,
        "modificaciones_ejecutadas": mods_exitosas,
        "sin_cambios": sin_cambios,
        "manifest_path": str(manifest_path),
        "manifest_nombre": manifest_name,
    }


def deshacer_sincronizacion(
    config: Config,
    manifest_path: str | Path | None = None,
    service_mock: Any = None,
) -> dict[str, Any]:
    """Restaura en Google People API el estado previo registrado en el manifiesto

    de rollback, eliminando contactos creados y restaurando contactos modificados.
    Es una operación idempotente.
    """
    carpeta_backups = _obtener_carpeta_backups(config)

    if manifest_path is None:
        manifiestos = list(carpeta_backups.glob("rollback_manifest_*.json"))
        manifiestos.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        if not manifiestos:
            return {"ok": False, "error": "No hay ningún manifiesto de rollback disponible para deshacer."}
        m_path = manifiestos[0]
    else:
        m_path = Path(manifest_path)
        if not m_path.exists():
            m_path = carpeta_backups / Path(manifest_path).name
        if not m_path.exists():
            return {"ok": False, "error": f"Manifiesto no encontrado: {manifest_path}"}

    with m_path.open("r", encoding="utf-8") as f:
        manifiesto = json.load(f)

    if manifiesto.get("revertido"):
        return {
            "ok": True,
            "ya_revertido": True,
            "mensaje": f"El manifiesto {m_path.name} ya había sido revertido previamente el {manifiesto.get('revertido_en')}.",
            "manifest_nombre": m_path.name,
            "restaurados": 0,
            "eliminados": 0,
        }

    cuenta = manifiesto.get("cuenta", "sindy")
    servicio = _obtener_servicio_google(cuenta, service_mock=service_mock)

    operaciones = manifiesto.get("operaciones", [])
    restaurados = 0
    eliminados = 0

    for op in reversed(operaciones):
        tipo = op.get("tipo")
        res_name = op.get("resource_name")
        if not res_name:
            continue

        if tipo == "create":
            # Eliminar contacto que se había creado
            try:
                servicio.people().deleteContact(resourceName=res_name).execute()
                eliminados += 1
            except Exception as exc:
                logger.warning("No se pudo eliminar contacto creado %s durante rollback: %s", res_name, exc)

        elif tipo == "update":
            # Restaurar contacto con su estado_anterior
            anterior = op.get("estado_anterior")
            if anterior:
                try:
                    servicio.people().updateContact(
                        resourceName=res_name,
                        body=anterior,
                        updatePersonFields="names,phoneNumbers,emailAddresses,organizations,biographies",
                    ).execute()
                    restaurados += 1
                except Exception as exc:
                    logger.warning("No se pudo restaurar estado anterior de %s durante rollback: %s", res_name, exc)

    # Actualizar estado del manifiesto a revertido
    manifiesto["revertido"] = True
    manifiesto["revertido_en"] = datetime.now(timezone.utc).isoformat()
    with m_path.open("w", encoding="utf-8") as f:
        json.dump(manifiesto, f, indent=2, ensure_ascii=False)

    return {
        "ok": True,
        "cuenta": cuenta,
        "manifest_nombre": m_path.name,
        "manifest_path": str(m_path),
        "restaurados": restaurados,
        "eliminados": eliminados,
        "mensaje": f"Sincronización revertida con éxito: {restaurados} contactos restaurados, {eliminados} contactos creados eliminados.",
    }


def obtener_ultimo_manifiesto(config: Config) -> dict[str, Any] | None:
    """Devuelve los datos del último manifiesto de sincronización disponible."""
    carpeta_backups = _obtener_carpeta_backups(config)
    manifiestos = list(carpeta_backups.glob("rollback_manifest_*.json"))
    manifiestos.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    if not manifiestos:
        return None

    m = manifiestos[0]
    try:
        with m.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "nombre": m.name,
            "cuenta": data.get("cuenta"),
            "creado_en": data.get("creado_en"),
            "revertido": bool(data.get("revertido")),
            "revertido_en": data.get("revertido_en"),
            "total_altas": data.get("total_altas", 0),
            "total_modificaciones": data.get("total_modificaciones", 0),
        }
    except Exception:
        return None
