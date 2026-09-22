"""Actualizador de vcard_extractor.py"""
code = '''"""Extractor de VCF (vCard) resiliente y de alto rendimiento por streaming.
Soporta vCard 2.1 (con QUOTED-PRINTABLE multilínea), 3.0 y 4.0.
Omite bloques pesados de PHOTO para no saturar memoria.
"""

from __future__ import annotations

import quopri
import re
from pathlib import Path

from motor.extractors.base import RawContactRecord, registrar


@registrar("vcf")
def extraer_vcf(path: Path) -> list[RawContactRecord]:
    registros: list[RawContactRecord] = []
    in_vcard = False
    skip_binary = False
    buffer: list[str] = []
    idx = 1

    with path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line_str = line.strip("\\r\\n")
            if not in_vcard:
                if line_str.upper() == "BEGIN:VCARD":
                    in_vcard = True
                    buffer = []
                    skip_binary = False
                continue

            if line_str.upper() == "END:VCARD":
                in_vcard = False
                campos = _procesar_lineas_vcard(buffer)
                if campos:
                    registros.append(RawContactRecord(str(path), idx, campos))
                    idx += 1
                buffer = []
                continue

            # Omitir fotos y binarios grandes para máxima velocidad y eficiencia
            if line_str.upper().startswith(("PHOTO", "LOGO", "KEY", "SOUND")):
                skip_binary = True
                continue
            if skip_binary:
                if line_str.startswith((" ", "\\t")) or (len(line_str) > 40 and ":" not in line_str):
                    continue
                else:
                    skip_binary = False

            buffer.append(line_str)

    return registros


def _procesar_lineas_vcard(lineas: list[str]) -> dict[str, str]:
    # Desplegar continuaciones (folded lines y quoted-printable con '=')
    desplegadas: list[str] = []
    prev = ""
    for line in lineas:
        if prev.endswith("="):
            prev = prev[:-1] + line
        elif line.startswith((" ", "\\t")):
            prev = prev + line[1:]
        else:
            if prev:
                desplegadas.append(prev)
            prev = line
    if prev:
        desplegadas.append(prev)

    campos: dict[str, str] = {}
    tel_idx = 1
    email_idx = 1

    for line in desplegadas:
        if ":" not in line:
            continue
        header, val = line.split(":", 1)
        header_upper = header.upper()
        if "ENCODING=QUOTED-PRINTABLE" in header_upper or "ENCODING=BASE64" in header_upper:
            try:
                val = quopri.decodestring(val.encode("latin1")).decode("utf-8", errors="replace")
            except Exception:
                pass

        tag = header_upper.split(";")[0]
        val = val.strip()
        if not val:
            continue

        if tag == "FN":
            campos["nombre_completo"] = val
        elif tag == "N" and "nombre_completo" not in campos:
            partes = [p.strip() for p in val.split(";") if p.strip()]
            if partes:
                campos["nombre_completo"] = " ".join(reversed(partes))
        elif tag == "TEL":
            campos[f"telefono_{tel_idx}"] = val
            tipo = _extraer_tipo(header)
            if tipo:
                campos[f"telefono_{tel_idx}_etiqueta"] = tipo
            tel_idx += 1
        elif tag == "EMAIL":
            campos[f"email_{email_idx}"] = val
            email_idx += 1
        elif tag == "ORG":
            org_limpia = " ".join(p.strip() for p in val.split(";") if p.strip()).strip()
            if org_limpia:
                campos["organizacion"] = org_limpia
        elif tag == "NOTE":
            campos["notas"] = val

    return campos


def _extraer_tipo(header: str) -> str | None:
    # Soporta TEL;TYPE=CELL: o TEL;CELL:
    m = re.search(r"TYPE=([^;:]+)", header, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    partes = header.split(";")[1:]
    for p in partes:
        p_up = p.upper().strip()
        if p_up in ("CELL", "HOME", "WORK", "PREF", "VOICE", "FAX", "MAIN"):
            return p.strip()
    return None
'''

with open('c:/github/MejoraContactos/motor-contactos/src/motor/extractors/vcard_extractor.py', 'w', encoding='utf-8') as f:
    f.write(code)
print('vcard_extractor.py actualizado correctamente!')
