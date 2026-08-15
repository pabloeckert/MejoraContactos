"""Extractor de VCF (vCard) vía vobject. Cada vCard del archivo produce un
RawContactRecord; los campos TEL/EMAIL múltiples se numeran igual que en
los otros extractores (telefono_1, telefono_2, ...) para que
normalize_pipeline los trate de forma uniforme."""

from __future__ import annotations

from pathlib import Path

import vobject

from motor.extractors.base import RawContactRecord, registrar


@registrar("vcf")
def extraer_vcf(path: Path) -> list[RawContactRecord]:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        contenido = f.read()

    registros: list[RawContactRecord] = []
    for i, vcard in enumerate(vobject.readComponents(contenido), start=1):
        campos = _campos_de_vcard(vcard)
        if campos:
            registros.append(RawContactRecord(str(path), i, campos))
    return registros


def _campos_de_vcard(vcard) -> dict[str, str]:
    campos: dict[str, str] = {}

    if hasattr(vcard, "fn") and vcard.fn.value and vcard.fn.value.strip():
        campos["nombre_completo"] = vcard.fn.value.strip()
    if hasattr(vcard, "org") and vcard.org.value:
        organizacion = " ".join(v for v in vcard.org.value if v).strip()
        if organizacion:
            campos["organizacion"] = organizacion
    if hasattr(vcard, "note") and vcard.note.value and vcard.note.value.strip():
        campos["notas"] = vcard.note.value.strip()

    for i, tel in enumerate(getattr(vcard, "tel_list", []), start=1):
        if tel.value and tel.value.strip():
            campos[f"telefono_{i}"] = tel.value.strip()
            etiqueta = _tipo_param(tel)
            if etiqueta:
                campos[f"telefono_{i}_etiqueta"] = etiqueta

    for i, email in enumerate(getattr(vcard, "email_list", []), start=1):
        if email.value and email.value.strip():
            campos[f"email_{i}"] = email.value.strip()

    return campos


def _tipo_param(campo) -> str | None:
    tipo = campo.params.get("TYPE")
    if not tipo:
        return None
    return tipo[0] if isinstance(tipo, list) else str(tipo)
