"""Fuente de datos: Google Contacts en vivo vía People API, en vez de
exports CSV que hay que generar y copiar a mano a Data/Crudos. Decisión
explícita del usuario (2026-08-11): "es más fácil que vos creés la
conexión a Google Contacts y lo hagas vos de ahí con el sistema".

Esto NO reemplaza el resto del pipeline — solo llena raw_records, igual
que cualquier extractor de extractors/. normalize_pipeline.py, dedup/, etc.
no saben ni les importa de dónde salió el dato. Los extractores de
archivos siguen ahí por si algún día hace falta importar algo que no vive
en Google Contacts (un PDF, una captura, un export de otro sistema).

Autorización: cada cuenta de Google (ej. "pablo", "sindy") se autoriza por
separado la primera vez que se corre `motor importar-google <cuenta>` —
abre el navegador, pide login y permiso de SOLO LECTURA de contactos
(scope contacts.readonly, nunca se escribe nada en la cuenta de origen).
Eso lo tiene que hacer el usuario, es lo único de este módulo que Claude
no puede hacer solo. El token queda guardado en token_<cuenta>.json
(gitignored) y se refresca solo en corridas siguientes, sin volver a pedir
login. Requiere motor-contactos/credentials.json (client OAuth de Google
Cloud Console, un solo archivo sirve para todas las cuentas) — ver
GOOGLE_SETUP.md para cómo generarlo.

Incremental: se reusa la tabla fuentes_procesadas (la misma que usa
ingest.py para archivos) con una "ruta" sintética `google:<cuenta>:
<resourceName>` y el etag de Google en vez de un hash de archivo — así una
corrida recurrente solo trae contactos nuevos o modificados desde la
última vez, sin duplicar raw_records."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from motor.config import Config

_SCOPES = ["https://www.googleapis.com/auth/contacts.readonly"]
_CAMPOS_PERSONA = "names,phoneNumbers,emailAddresses,organizations,addresses,biographies,birthdays,photos"
_RUTA_CREDENCIALES = Path("credentials.json")

# "Otros contactos" (people/otherContacts): la gente con la que tuviste
# intercambio de mail en Gmail pero nunca guardaste como contacto -- Google
# ya hace la extracción de "¿quién me escribió?" mejor de lo que haríamos
# nosotros parseando encabezados de mail a mano. Requiere un scope
# DISTINTO al de Fase 4 (contacts.other.readonly, no contacts.readonly) --
# por eso token y función de credenciales separados: no queremos que
# activar esto rompa/pida re-login al import de Google Contacts normal que
# ya venía funcionando.
_SCOPES_OTROS_CONTACTOS = ["https://www.googleapis.com/auth/contacts.other.readonly"]
_CAMPOS_OTROS_CONTACTOS = "names,emailAddresses,phoneNumbers"


class CredencialesFaltantesError(RuntimeError):
    pass


def _ruta_token(cuenta: str, sufijo: str = "") -> Path:
    return Path(f"token_{cuenta}{sufijo}.json")


def obtener_credenciales(cuenta: str, scopes: list[str] = _SCOPES, sufijo_token: str = ""):
    """Devuelve credenciales OAuth válidas para `cuenta`, refrescando o
    pidiendo login interactivo (run_local_server abre el navegador) según
    haga falta. Import local de las librerías de Google -- son pesadas y
    solo hacen falta acá, no en el resto del pipeline.

    `scopes`/`sufijo_token` separados para "otros contactos" (scope
    distinto al de Fase 4, ver _SCOPES_OTROS_CONTACTOS) -- así cada
    capacidad pide su propio login la primera vez sin pisar el token de
    la otra.

    El token en disco queda cifrado con DPAPI (ver token_crypto.py) --
    solo se puede desproteger desde esta misma cuenta de Windows. Un
    token_*.json de antes de este cambio (texto plano) se sigue leyendo
    igual (migración transparente) y queda re-escrito cifrado la próxima
    vez que se guarde acá abajo."""
    import json

    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    from motor.token_crypto import escribir_token_protegido, leer_token_protegido

    ruta_token = _ruta_token(cuenta, sufijo_token)
    creds = None
    if ruta_token.exists():
        info = json.loads(leer_token_protegido(ruta_token))
        creds = Credentials.from_authorized_user_info(info, scopes)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not _RUTA_CREDENCIALES.exists():
                raise CredencialesFaltantesError(
                    "Falta motor-contactos/credentials.json (client OAuth de Google Cloud "
                    "Console). Ver GOOGLE_SETUP.md -- ese paso lo tenés que hacer vos, "
                    "requiere tu login en Google Cloud Console."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(_RUTA_CREDENCIALES), scopes)
            creds = flow.run_local_server(port=0)
        escribir_token_protegido(ruta_token, creds.to_json())
    return creds


def importar_google_contactos(config: Config, conn: sqlite3.Connection, cuenta: str) -> int:
    """Trae todos los contactos de `cuenta` (paginado) y los inserta en
    raw_records -- salta los que ya se importaron con el mismo etag
    (sin cambios desde la última corrida). Devuelve raw_records nuevos."""
    from googleapiclient.discovery import build

    creds = obtener_credenciales(cuenta)
    servicio = build("people", "v1", credentials=creds)

    total_insertados = 0
    token_pagina = None
    while True:
        peticion = (
            servicio.people()
            .connections()
            .list(
                resourceName="people/me",
                pageSize=1000,
                personFields=_CAMPOS_PERSONA,
                pageToken=token_pagina,
            )
        )
        respuesta = peticion.execute()

        for persona in respuesta.get("connections", []):
            resource_name = persona.get("resourceName", "")
            etag = persona.get("etag", "")
            ruta_virtual = f"google:{cuenta}:{resource_name}"
            if _ya_procesado(conn, ruta_virtual, etag):
                continue
            campos = _persona_a_campos(persona)
            if not campos:
                continue
            conn.execute(
                "INSERT INTO raw_records (source_file, source_row, raw_json, confianza_extraccion, creado_en) "
                "VALUES (?, 1, ?, 'alta', ?)",
                (ruta_virtual, json.dumps(campos, ensure_ascii=False), _ahora()),
            )
            _marcar_procesado(conn, ruta_virtual, etag)
            total_insertados += 1

        token_pagina = respuesta.get("nextPageToken")
        if not token_pagina:
            break

    conn.commit()
    return total_insertados


def importar_otros_contactos(config: Config, conn: sqlite3.Connection, cuenta: str) -> int:
    """"Otros contactos" de `cuenta`: gente con la que hubo intercambio de
    mail en Gmail pero nunca se guardó como contacto explícito -- el
    equivalente a "leer contactos desde la cuenta de mail" pedido, pero
    usando la extracción que ya hace Google en vez de parsear encabezados
    de mail a mano (más preciso: ya resuelve hilos, respuestas, alias).
    Primera vez pide un login/consentimiento APARTE del de Fase 4 (scope
    distinto). Mismo patrón incremental que importar_google_contactos:
    etag de Google, source_file con prefijo propio para no chocar con
    fuentes_procesadas de los contactos "de verdad"."""
    from googleapiclient.discovery import build

    creds = obtener_credenciales(cuenta, scopes=_SCOPES_OTROS_CONTACTOS, sufijo_token="_gmail")
    servicio = build("people", "v1", credentials=creds)

    total_insertados = 0
    token_pagina = None
    while True:
        respuesta = (
            servicio.people()
            .otherContacts()
            .list(pageSize=1000, readMask=_CAMPOS_OTROS_CONTACTOS, pageToken=token_pagina)
            .execute()
        )

        for persona in respuesta.get("otherContacts", []):
            resource_name = persona.get("resourceName", "")
            etag = persona.get("etag", "")
            ruta_virtual = f"google-otros-contactos:{cuenta}:{resource_name}"
            if _ya_procesado(conn, ruta_virtual, etag):
                continue
            campos = _persona_a_campos(persona)
            if not campos:
                continue
            conn.execute(
                "INSERT INTO raw_records (source_file, source_row, raw_json, confianza_extraccion, creado_en) "
                "VALUES (?, 1, ?, 'baja', ?)",
                (ruta_virtual, json.dumps(campos, ensure_ascii=False), _ahora()),
            )
            _marcar_procesado(conn, ruta_virtual, etag)
            total_insertados += 1

        token_pagina = respuesta.get("nextPageToken")
        if not token_pagina:
            break

    conn.commit()
    return total_insertados


def _persona_a_campos(persona: dict) -> dict[str, str]:
    """Traduce un Person de la People API a las claves canónicas que ya
    entiende normalize_pipeline.py (las mismas que produce csv_extractor.py
    vía column_mapping.py) -- así el resto del pipeline no distingue entre
    un contacto que vino de un CSV o de Google."""
    campos: dict[str, str] = {}

    nombres = persona.get("names") or []
    if nombres:
        n = nombres[0]
        if n.get("givenName"):
            campos["nombre"] = n["givenName"]
        if n.get("familyName"):
            campos["apellido"] = n["familyName"]

    organizaciones = persona.get("organizations") or []
    if organizaciones:
        o = organizaciones[0]
        if o.get("name"):
            campos["organizacion"] = o["name"]
        if o.get("title"):
            campos["cargo"] = o["title"]

    # el "type" de Google (mobile/home/work/...) ya matchea las pistas que
    # phone_normalizer.py reconoce (_PISTAS_MOVIL incluye "mobile",
    # _PISTAS_FIJO incluye "home") -- se pasa tal cual como etiqueta.
    for i, telefono in enumerate(persona.get("phoneNumbers") or [], start=1):
        if telefono.get("value"):
            campos[f"telefono_{i}"] = telefono["value"]
            if telefono.get("type"):
                campos[f"telefono_{i}_etiqueta"] = telefono["type"]

    for i, email in enumerate(persona.get("emailAddresses") or [], start=1):
        if email.get("value"):
            campos[f"email_{i}"] = email["value"]

    direcciones = persona.get("addresses") or []
    if direcciones:
        d = direcciones[0]
        if d.get("streetAddress"):
            campos["domicilio"] = d["streetAddress"]
        if d.get("city"):
            campos["ciudad"] = d["city"]
        if d.get("region"):
            campos["provincia"] = d["region"]
        if d.get("country"):
            campos["pais"] = d["country"]

    biografias = persona.get("biographies") or []
    if biografias and biografias[0].get("value"):
        campos["notas"] = biografias[0]["value"]

    cumpleanos = persona.get("birthdays") or []
    if cumpleanos:
        fecha = cumpleanos[0].get("date") or {}
        dia, mes, anio = fecha.get("day"), fecha.get("month"), fecha.get("year")
        if dia and mes:
            # Google permite guardar el cumpleaños sin año (no siempre lo
            # sabe/comparte el contacto) -- se guarda igual, DD/MM sin año,
            # en vez de descartarlo.
            campos["cumpleanos"] = f"{dia:02d}/{mes:02d}/{anio}" if anio else f"{dia:02d}/{mes:02d}"

    fotos = persona.get("photos") or []
    for foto in fotos:
        # Google marca con "default": true la silueta genérica que pone
        # cuando el contacto no tiene foto real -- no vale la pena
        # guardarla como si fuera una foto de verdad.
        if foto.get("url") and not foto.get("default"):
            campos["foto_url"] = foto["url"]
            break

    return campos


def _ya_procesado(conn: sqlite3.Connection, ruta_virtual: str, etag: str) -> bool:
    fila = conn.execute(
        "SELECT hash_sha256 FROM fuentes_procesadas WHERE ruta = ?", (ruta_virtual,)
    ).fetchone()
    return fila is not None and fila["hash_sha256"] == etag


def _marcar_procesado(conn: sqlite3.Connection, ruta_virtual: str, etag: str) -> None:
    conn.execute(
        "INSERT INTO fuentes_procesadas (ruta, hash_sha256, mtime, tamano_bytes, procesado_en) "
        "VALUES (?, ?, 0, 0, ?) "
        "ON CONFLICT(ruta) DO UPDATE SET hash_sha256=excluded.hash_sha256, procesado_en=excluded.procesado_en",
        (ruta_virtual, etag, _ahora()),
    )


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()
