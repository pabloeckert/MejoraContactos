from motor.tagging import auto_etiquetar


def test_familiar_por_palabra_clave_en_notas():
    assert auto_etiquetar(None, None, "Es mi hermano, nos conocimos de chicos") == "familiar"


def test_cliente_por_palabra_clave():
    assert auto_etiquetar(None, "Ferretería Sur", "Cliente desde 2019") == "cliente"


def test_proveedor_por_palabra_clave():
    assert auto_etiquetar(None, "Insumos SRL", "Proveedor de repuestos") == "proveedor"


def test_laboral_por_tener_cargo_u_organizacion_sin_otra_senal():
    assert auto_etiquetar("Gerente", "Acme SRL", None) == "laboral"
    assert auto_etiquetar(None, "Acme SRL", None) == "laboral"


def test_personal_por_default_sin_ninguna_senal():
    assert auto_etiquetar(None, None, None) == "personal"
    assert auto_etiquetar(None, None, "Amigo de la infancia") == "personal"


def test_familiar_tiene_prioridad_sobre_laboral():
    # Puede ser un familiar que también trabaja con el usuario — gana el
    # vínculo familiar, que es la señal más fuerte de las cuatro.
    assert auto_etiquetar("Contadora", "Estudio Contable", "Es mi hija") == "familiar"
