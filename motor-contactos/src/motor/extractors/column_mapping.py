"""Mapeo de encabezados de columna a claves canónicas, compartido por los
extractores tabulares (CSV/TSV, Excel, JSON de objetos planos).

Reconoce tres casos:
1. El esquema de Google Contacts export ("Phone 1 - Value"/"Phone 1 -
   Label", "E-mail 1 - Value", etc. — confirmado contra pablo.csv/Sindy.csv
   reales, 78 columnas).
2. Alias genéricos en español/inglés para CSVs de otro origen (otro CRM,
   planillas armadas a mano).
3. Encabezados típicos de exports de HubSpot ("Phone Number", "Company
   Name", "Street Address", "State/Region", "Country/Region"), Mailchimp
   ("Email Address", "Address") y Brevo ("FIRSTNAME"/"LASTNAME"/"SMS", sin
   espacio — así salen sus merge tags) — no hace falta un extractor
   aparte por plataforma, son CSVs comunes que ya entra el extractor
   genérico si el encabezado está en estas listas.

Si un encabezado no matchea nada, se descarta (mejor perder una columna
rara que inventar una clave canónica equivocada).
"""

from __future__ import annotations

import re

_ALIAS_NOMBRE = {"first name", "firstname", "nombre", "name", "nombres"}
_ALIAS_APELLIDO = {"last name", "lastname", "apellido", "surname", "apellidos"}
_ALIAS_NOMBRE_COMPLETO = {"full name", "nombre completo", "display name", "fn"}
_ALIAS_ORGANIZACION = {
    "organization name", "organization", "organizacion", "organización", "empresa", "company", "company name",
}
_ALIAS_CARGO = {"organization title", "cargo", "puesto", "job title", "title", "posicion", "posición"}
_ALIAS_NOTAS = {"notes", "notas", "note", "nota"}
_ALIAS_TELEFONO_UNICO = {
    "phone", "telefono", "teléfono", "celular", "whatsapp", "cel", "movil", "móvil",
    "phone number", "mobile phone number", "primary phone number", "sms",
}
_ALIAS_EMAIL_UNICO = {"email", "e-mail", "correo", "mail", "email address"}
_ALIAS_DOMICILIO = {"address 1 - street", "domicilio", "direccion", "dirección", "street", "calle", "address", "street address"}
_ALIAS_CIUDAD = {"address 1 - city", "ciudad", "city", "localidad"}
_ALIAS_PROVINCIA = {"address 1 - region", "provincia", "region", "región", "state", "state/region"}
_ALIAS_PAIS = {"address 1 - country", "pais", "país", "country", "country/region"}

_NUMERO_RE = re.compile(r"\d+")


def mapear_columnas(encabezados: list[str]) -> dict[str, str]:
    """Devuelve {encabezado_original: clave_canonica} solo para los
    encabezados reconocidos."""
    mapa: dict[str, str] = {}
    for encabezado in encabezados:
        clave = _clave_canonica(encabezado)
        if clave:
            mapa[encabezado] = clave
    return mapa


def _clave_canonica(encabezado: str) -> str | None:
    h = encabezado.strip().lower()

    if h in _ALIAS_NOMBRE:
        return "nombre"
    if h in _ALIAS_APELLIDO:
        return "apellido"
    if h in _ALIAS_NOMBRE_COMPLETO:
        return "nombre_completo"
    if h in _ALIAS_ORGANIZACION:
        return "organizacion"
    if h in _ALIAS_CARGO:
        return "cargo"
    if h in _ALIAS_NOTAS:
        return "notas"
    if h in _ALIAS_TELEFONO_UNICO:
        return "telefono_1"
    if h in _ALIAS_EMAIL_UNICO:
        return "email_1"
    if h in _ALIAS_DOMICILIO:
        return "domicilio"
    if h in _ALIAS_CIUDAD:
        return "ciudad"
    if h in _ALIAS_PROVINCIA:
        return "provincia"
    if h in _ALIAS_PAIS:
        return "pais"

    if h.startswith("phone") and h.endswith("- value"):
        return f"telefono_{_indice(h)}"
    if h.startswith("phone") and h.endswith("- label"):
        return f"telefono_{_indice(h)}_etiqueta"
    if (h.startswith("e-mail") or h.startswith("email")) and h.endswith("- value"):
        return f"email_{_indice(h)}"

    return None


def _indice(encabezado_lower: str) -> str:
    m = _NUMERO_RE.search(encabezado_lower)
    return m.group(0) if m else "1"
