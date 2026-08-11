from motor.extractors.vcard_extractor import extraer_vcf

_VCARD_UNO = """BEGIN:VCARD
VERSION:3.0
FN:Juan Perez
ORG:Acme;;
TEL;TYPE=CELL:3743504517
EMAIL:juan@gmail.com
NOTE:Cliente viejo
END:VCARD
"""

_VCARD_DOS = """BEGIN:VCARD
VERSION:3.0
FN:Maria Gomez
TEL;TYPE=HOME:3764368724
END:VCARD
"""


def test_extrae_campos_basicos(tmp_path):
    path = tmp_path / "contacto.vcf"
    path.write_text(_VCARD_UNO, encoding="utf-8")

    registros = extraer_vcf(path)

    assert len(registros) == 1
    campos = registros[0].campos
    assert campos["nombre_completo"] == "Juan Perez"
    assert campos["organizacion"] == "Acme"
    assert campos["telefono_1"] == "3743504517"
    assert campos["telefono_1_etiqueta"] == "CELL"
    assert campos["email_1"] == "juan@gmail.com"
    assert campos["notas"] == "Cliente viejo"


def test_archivo_con_multiples_vcards(tmp_path):
    path = tmp_path / "dos_contactos.vcf"
    path.write_text(_VCARD_UNO + _VCARD_DOS, encoding="utf-8")

    registros = extraer_vcf(path)

    assert len(registros) == 2
    assert registros[0].campos["nombre_completo"] == "Juan Perez"
    assert registros[1].campos["nombre_completo"] == "Maria Gomez"
