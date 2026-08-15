"""Limpieza de campos de texto libre (nombre, apellido, cargo, empresa,
domicilio, ciudad, provincia, país) que llegan del origen sin pasar por
phone_normalizer/email_normalizer.

A diferencia de esos dos módulos, acá no hay una especificación cerrada de
"formato válido" — es una heurística, calibrada mirando patrones reales
encontrados en pablo.csv/Sindy.csv:
- ~570 contactos con un teléfono completo (ej. "+541151095490") guardado
  literalmente en el campo Nombre (Google Contacts hace esto cuando el
  contacto se creó solo con un número, sin nombre).
- Contactos con una dirección de email completa en el campo Nombre en vez
  del teléfono (ej. "543764327889@mailin-sms.com" — un gateway SMS-a-email,
  o directamente "Aloy0845@gmail.com") — no siempre caen en el filtro de
  "mayoría dígitos" porque tienen letras mezcladas.
- Nombres envueltos en comillas literales ('"Daniel Alfredo"').
- Prefijos de fecha + sufijos "(E-Mail" en algunos nombres (convención
  personal del usuario para recordatorios de cumpleaños: "02/02 Pp Suarez
  Gerardo Raul (E-Mail").
- Cargos con varios roles/empresas concatenados con ":::", "/", "\\," o
  comas ("Director/Gerente/Encargad@ ::: Emprendedor",
  "litoral serigrafia s.r.l. - construyendo activo s.r.l. \\, Sociogerente
  \\, Dueño").
- Marcadores de género neutro con "@" ("Dueñ@/Propietari@/Soci@").

Nada de esto se puede resolver con 100% de precisión sin NLP real — el
objetivo es eliminar la basura obvia y mayoritaria, no una clasificación
perfecta. Casos raros van a seguir necesitando una pasada manual."""

from __future__ import annotations

import re

_CARACTERES_ESPECIALES_RE = re.compile(r"[\"'“”‘’«»`´{}\[\]*#~^_=<>|\\]")
_ESPACIOS_RE = re.compile(r"\s+")
_SEPARADOR_EXPORT_RE = re.compile(r":::")
_PREFIJO_FECHA_RE = re.compile(r"^\d{1,2}/\d{1,2}[a-zA-Z\-]*\s+")
_SUFIJO_EMAIL_RE = re.compile(r"\s*\(e-?mail.*$", re.IGNORECASE)
_FORMA_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_TIENE_LETRA_RE = re.compile(r"[^\W\d_]", re.UNICODE)

_HONORIFICOS = {
    "sr", "sr.", "sra", "sra.", "srta", "srta.", "dr", "dr.", "dra", "dra.",
    "don", "doña", "dña", "dña.",
}

_CONECTORES_MINUSCULA = {"de", "del", "la", "las", "los", "y", "el", "en"}

_PALABRAS_EMPRESA = {
    "sa", "s.a", "s.a.", "srl", "s.r.l", "s.r.l.", "sas", "s.a.s", "ltda",
    "cia", "cía", "corp", "corporation", "company", "group", "grupo",
    "empresa", "estudio", "consultora", "distribuidora", "constructora",
    "sociedad", "asociados", "hnos", "hnos.",
}

_CARGOS_CONOCIDOS = {
    "gerente", "gerenta", "dueño", "dueña", "dueñ@", "propietario",
    "propietaria", "propietari@", "socio", "socia", "soci@", "supervisor",
    "supervisora", "encargado", "encargada", "encargad@", "jefe", "jefa",
    "director", "directora", "presidente", "presidenta", "vendedor",
    "vendedora", "plomero", "electricista", "doctor", "doctora", "abogado",
    "abogada", "contador", "contadora", "arquitecto", "arquitecta",
    "ingeniero", "ingeniera", "profesor", "profesora", "medico", "médico",
    "medica", "médica", "enfermero", "enfermera", "administrador",
    "administradora", "secretario", "secretaria", "asesor", "asesora",
    "coordinador", "coordinadora", "recepcionista", "cajero", "cajera",
    "sociogerente", "emprendedor", "emprendedora", "estudiante",
}

_SEPARADORES_CARGO_RE = re.compile(r":::|\\+,|\\+/|/| - |,|;")

# Siglas societarias/abreviaturas que se mantienen en mayúsculas al hacer
# Title Case — "Distribuidora Srl" se lee raro, "Distribuidora SRL" no.
_MANTENER_MAYUSCULA = {"sa", "srl", "sas", "ltda", "cia", "sh", "sca"}


def limpiar_texto_libre(valor: str | None) -> str:
    """Limpieza genérica: saca separadores de export (":::", backslashes
    sueltos), comillas/apóstrofes/comillas tipográficas, colapsa espacios.
    Válida para domicilio/notas — cualquier campo de texto donde no hace
    falta detectar nombre vs. empresa vs. cargo."""
    if not valor:
        return ""
    s = _SEPARADOR_EXPORT_RE.sub(" ", valor)
    s = s.replace("\\", "")
    s = _CARACTERES_ESPECIALES_RE.sub("", s)
    s = _ESPACIOS_RE.sub(" ", s).strip()
    return s


def _es_mayoria_digitos(valor: str) -> bool:
    compacto = valor.replace(" ", "")
    if not compacto:
        return True
    digitos = sum(1 for c in compacto if c.isdigit())
    return digitos >= max(1, len(compacto) * 0.5)


def parece_empresa(valor: str) -> bool:
    v = valor.lower().strip()
    if not v:
        return False
    tokens = re.findall(r"[a-záéíóúñ.]+", v)
    return bool(set(tokens) & _PALABRAS_EMPRESA)


def parece_cargo_suelto(valor: str) -> bool:
    """True si TODO el valor (no una parte) es directamente una palabra de
    cargo/profesión conocida — para detectar cuando se coló en el campo
    Nombre o Apellido."""
    v = valor.lower().strip().rstrip(".")
    return v in _CARGOS_CONOCIDOS


def _title_case(texto: str) -> str:
    palabras = texto.split(" ")
    resultado = []
    for i, palabra in enumerate(palabras):
        base = palabra.lower()
        if base.rstrip(".") in _MANTENER_MAYUSCULA:
            resultado.append(base.upper())
        elif i > 0 and base in _CONECTORES_MINUSCULA:
            resultado.append(base)
        elif base:
            resultado.append(base[0].upper() + base[1:])
        else:
            resultado.append(base)
    return " ".join(resultado)


def limpiar_nombre_persona(valor: str | None) -> str:
    """Limpieza estricta para nombre/apellido: si después de sacar ruido
    conocido (prefijo de fecha, sufijo "(E-Mail", honoríficos, caracteres
    especiales) el valor sigue pareciendo un teléfono o queda vacío,
    devuelve cadena vacía — mejor no poner nombre que poner basura."""
    if not valor:
        return ""

    s = _PREFIJO_FECHA_RE.sub("", valor)
    s = _SUFIJO_EMAIL_RE.sub("", s)
    s = limpiar_texto_libre(s)
    if not s:
        return ""

    palabras = [p for p in s.split(" ") if p.strip(".").lower() not in _HONORIFICOS]
    s = " ".join(palabras).strip()
    if not s:
        return ""

    if _es_mayoria_digitos(s) or _FORMA_EMAIL_RE.search(s) or ("@" in s and " " not in s):
        # El último caso cubre emails truncados sin TLD ("user@hotmail",
        # sin el ".com") que la forma de email completa no reconoce — un
        # nombre de persona real nunca trae "@" pegado sin espacios.
        return ""

    if not _TIENE_LETRA_RE.search(s):
        # Caso real: "*" o "**" sueltos como nombre — sin una sola letra
        # adentro, no puede ser un nombre de persona.
        return ""

    return _title_case(s)


def normalizar_cargo(valor: str | None) -> str:
    """Un cargo con varios roles/empresas concatenados (separados por
    ":::", "/", comas, o barras escapadas "\\,") se reduce al primer
    segmento que NO parece nombre de empresa — "no todo junto en el mismo
    casillero", pedido explícito."""
    if not valor:
        return ""
    s = valor.replace("\\", "")
    partes = [p.strip() for p in _SEPARADORES_CARGO_RE.split(s) if p.strip()]
    if not partes:
        partes = [s]

    for parte in partes:
        limpio = limpiar_texto_libre(parte).replace("@", "o")
        if limpio and _TIENE_LETRA_RE.search(limpio) and not parece_empresa(limpio):
            return _title_case(limpio)

    return ""


def clasificar_identidad(
    nombre_crudo: str | None,
    apellido_crudo: str | None,
    organizacion_crudo: str | None,
    cargo_crudo: str | None,
) -> tuple[str, str, str, str]:
    """Devuelve (nombre, apellido, organizacion, cargo) limpios,
    reasignando valores que se colaron en el campo equivocado: un cargo
    escrito en el campo Nombre ("Gerente" como si fuera nombre de pila), o
    un nombre de empresa en Nombre/Apellido en vez de en Empresa."""
    nombre = limpiar_nombre_persona(nombre_crudo)
    apellido = limpiar_nombre_persona(apellido_crudo)
    organizacion = _title_case(limpiar_texto_libre(organizacion_crudo)) if organizacion_crudo else ""
    if organizacion and not _TIENE_LETRA_RE.search(organizacion):
        organizacion = ""  # ej. "**" — sin una sola letra, no es un nombre de empresa
    cargo = normalizar_cargo(cargo_crudo)

    # "Empresa"/"Cargo" a secas como valor literal es el placeholder que
    # deja Google Contacts (o un merge field de Mailchimp sin completar) —
    # nunca es información real, sea cual sea el resto de la fila.
    if organizacion.strip().lower() == "empresa":
        organizacion = ""
    if cargo.strip().lower() == "cargo":
        cargo = ""

    for campo, valor in (("nombre", nombre), ("apellido", apellido)):
        if not valor:
            continue
        if parece_cargo_suelto(valor) and not cargo:
            cargo = _title_case(valor.replace("@", "o"))
            if campo == "nombre":
                nombre = ""
            else:
                apellido = ""
        elif parece_empresa(valor) and not organizacion:
            organizacion = valor
            if campo == "nombre":
                nombre = ""
            else:
                apellido = ""

    return nombre, apellido, organizacion, cargo


def limpiar_lugar(valor: str | None) -> str:
    """Ciudad/Provincia/País: limpieza + Title Case (a diferencia de
    Domicilio, que puede tener abreviaturas tipo "Av." o números de piso
    que no conviene retitular)."""
    s = limpiar_texto_libre(valor)
    return _title_case(s) if s else ""
