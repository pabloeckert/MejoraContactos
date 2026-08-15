from motor.text_cleaning import (
    clasificar_identidad,
    limpiar_lugar,
    limpiar_nombre_persona,
    limpiar_texto_libre,
    normalizar_cargo,
)


def test_telefono_guardado_como_nombre_queda_vacio():
    # Caso real: ~570 contactos en pablo.csv tienen el teléfono completo
    # guardado como si fuera el nombre.
    assert limpiar_nombre_persona("+541151095490") == ""


def test_email_guardado_como_nombre_queda_vacio():
    # Caso real: gateways SMS-a-email ("543764327889@mailin-sms.com") y
    # emails de verdad ("Aloy0845@gmail.com") guardados como nombre — no
    # los agarra el filtro de "mayoría dígitos" porque tienen letras.
    assert limpiar_nombre_persona("543764327889@mailin-sms.com") == ""
    assert limpiar_nombre_persona("Aloy0845@gmail.com") == ""


def test_nombre_envuelto_en_comillas_se_limpia():
    assert limpiar_nombre_persona('"Daniel Alfredo"') == "Daniel Alfredo"


def test_asterisco_suelto_sin_letras_queda_vacio():
    # Caso real: "*" y "**" como valor completo de Nombre/Apellido/Empresa.
    assert limpiar_nombre_persona("*") == ""
    assert limpiar_nombre_persona("**") == ""


def test_clasificar_identidad_empresa_solo_asteriscos_queda_vacia():
    _, _, empresa, _ = clasificar_identidad("Juan", "Perez", "**", None)
    assert empresa == ""


def test_apostrofe_se_saca_incluso_de_apellidos_legitimos():
    # Pedido explícito: nada de apóstrofes, ni siquiera en "D'Aloia".
    assert "'" not in limpiar_nombre_persona("D'Aloia")


def test_todo_mayusculas_pasa_a_title_case():
    assert limpiar_nombre_persona("JUAN PEREZ") == "Juan Perez"


def test_honorificos_se_sacan():
    assert limpiar_nombre_persona("Dr. Juan Perez") == "Juan Perez"
    assert limpiar_nombre_persona("Sra. Maria Gomez") == "Maria Gomez"


def test_prefijo_fecha_y_sufijo_email_se_sacan():
    # Caso real: "02/02 Pp Suarez Gerardo Raul (E-Mail" — convención
    # personal del usuario para recordatorios de cumpleaños.
    resultado = limpiar_nombre_persona("06/16 Santamaria Juan Daniel (E-Mail")
    assert "06/16" not in resultado
    assert "(E-Mail" not in resultado


def test_cargo_sin_letras_queda_vacio():
    # Casos reales: "-", ".", "1500", "555655" como valor de Cargo.
    assert normalizar_cargo("-") == ""
    assert normalizar_cargo(".") == ""
    assert normalizar_cargo("1500") == ""


def test_cargo_con_varios_roles_concatenados_se_reduce_a_uno():
    resultado = normalizar_cargo("Director/Gerente/Encargad@ ::: Emprendedor")
    assert resultado == "Director"
    assert "/" not in resultado
    assert ":::" not in resultado


def test_cargo_con_arroba_genero_neutro_se_normaliza():
    resultado = normalizar_cargo("Dueñ@/Propietari@/Soci@")
    assert "@" not in resultado
    assert resultado == "Dueño"


def test_cargo_salta_nombres_de_empresa_y_toma_el_rol_real():
    resultado = normalizar_cargo(
        "litoral serigrafia s.r.l. - construyendo activo s.r.l. \\, Sociogerente \\, Dueño"
    )
    assert resultado == "Sociogerente"


def test_clasificar_identidad_mueve_cargo_suelto_del_nombre_a_cargo():
    nombre, apellido, empresa, cargo = clasificar_identidad("Gerente", None, None, None)
    assert nombre == ""
    assert cargo == "Gerente"


def test_clasificar_identidad_mueve_empresa_del_apellido_a_empresa():
    nombre, apellido, empresa, cargo = clasificar_identidad("Juan", "Distribuidora SRL", None, None)
    assert apellido == ""
    assert empresa == "Distribuidora SRL"


def test_clasificar_identidad_empresa_y_cargo_placeholder_quedan_vacios():
    # "Empresa"/"Cargo" a secas es el placeholder que deja Google/Mailchimp
    # cuando el campo real no se completó — no es información real.
    nombre, apellido, empresa, cargo = clasificar_identidad("Maria", "Perez", "Empresa", "Cargo")
    assert empresa == ""
    assert cargo == ""
    assert nombre == "Maria"  # el resto del contacto no se toca


def test_clasificar_identidad_caso_normal_no_se_toca():
    nombre, apellido, empresa, cargo = clasificar_identidad("Juan", "Perez", "Acme", "Gerente")
    assert nombre == "Juan"
    assert apellido == "Perez"
    assert empresa == "Acme"
    assert cargo == "Gerente"


def test_limpiar_texto_libre_saca_separador_de_export():
    assert ":::" not in limpiar_texto_libre("Lic en Economia ::: evaluadora Libre Circulacion")


def test_limpiar_lugar_title_case():
    assert limpiar_lugar("POSADAS") == "Posadas"
