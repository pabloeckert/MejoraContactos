from motor.config import TelefonoConfig
from motor.phone_normalizer import (
    dividir_campo_telefono,
    normalizar_campo_telefono,
    normalizar_telefono_unico,
)

CFG = TelefonoConfig(codigo_area_default="376", asumir_movil_por_defecto=True)
CFG_SIN_ASUMIR = TelefonoConfig(codigo_area_default="376", asumir_movil_por_defecto=False)


def test_15_despues_del_codigo_de_area():
    r = normalizar_telefono_unico("0 3743 15-504517", CFG)
    assert r.e164 == "+5493743504517"
    assert r.pais == "AR"
    assert r.flags == []
    assert r.valido is True


def test_numero_corto_sin_codigo_de_area_calza_10():
    # área default (376, 3 dígitos) + 7 dígitos de abonado = 10 exacto
    r = normalizar_telefono_unico("1234567", CFG)
    assert r.e164 == "+5493761234567"
    assert set(r.flags) == {"incompleto", "corregido"}
    assert r.valido is True


def test_numero_corto_sin_codigo_de_area_no_calza_justo():
    # área default (376) + 6 dígitos = 9, no llega a 10 -> además 'revisar'
    r = normalizar_telefono_unico("504517", CFG)
    assert r.e164 == "+549376504517"
    assert set(r.flags) == {"incompleto", "corregido", "revisar"}
    assert r.valido is False


def test_numero_extranjero_brasil():
    r = normalizar_telefono_unico("+55 11 98765-4321", CFG)
    assert r.pais == "BR"
    assert r.e164 == "+5511987654321"
    assert r.flags == ["extranjero"]
    assert r.valido is True


def test_numero_extranjero_sin_signo_mas():
    # Sin '+' pero con código de país reconocible y largo válido
    r = normalizar_telefono_unico("5511987654321", CFG)
    assert r.pais == "BR"
    assert r.flags == ["extranjero"]


def test_numeros_pegados_se_separan_en_bloques_de_10():
    campo = "3743504517" + "3764368724"  # 20 dígitos, sin separador
    resultados = normalizar_campo_telefono(campo, CFG)
    assert len(resultados) == 2
    assert resultados[0].e164 == "+5493743504517"
    assert resultados[1].e164 == "+5493764368724"
    assert all(r.pais == "AR" for r in resultados)


def test_multiples_numeros_separados_por_coma():
    resultados = normalizar_campo_telefono("3743504517, 3764368724", CFG)
    assert len(resultados) == 2
    assert resultados[0].e164 == "+5493743504517"
    assert resultados[1].e164 == "+5493764368724"


def test_multiples_numeros_separados_por_y():
    resultados = normalizar_campo_telefono("3743504517 y 3764368724", CFG)
    assert len(resultados) == 2


def test_multiples_numeros_separados_por_barra_y_punto_y_coma():
    resultados = normalizar_campo_telefono("3743504517/3764368724;3765555555", CFG)
    assert len(resultados) == 3


def test_separador_triple_dos_puntos_de_exports_reales():
    # El export real de Google Contacts que procesamos usa ' ::: ' para unir
    # valores duplicados dentro del mismo campo.
    resultados = normalizar_campo_telefono("3743504517 ::: 3764368724 ::: 3743504517", CFG)
    assert [r.e164 for r in resultados] == ["+5493743504517", "+5493764368724"]


def test_notacion_cientifica_de_excel_no_fabrica_numero_falso():
    # Excel/Sheets corrompe teléfonos largos a notación científica al
    # tratarlos como número. Esos dígitos son irrecuperables: tiene que
    # quedar para revisión, nunca "completarse" con el área default.
    r = normalizar_telefono_unico("3,76155E+11", CFG)
    assert r.e164 is None
    assert r.flags == ["revisar"]


def test_notacion_cientifica_dentro_de_un_campo_con_mas_valores():
    resultados = normalizar_campo_telefono("376-462-5348 ::: 3,76155E+11", CFG)
    e164s = [r.e164 for r in resultados]
    assert "+5493764625348" in e164s
    revisar = [r for r in resultados if r.e164 is None]
    assert len(revisar) == 1
    assert revisar[0].flags == ["revisar"]


def test_10_digitos_sin_prefijo_prefiere_ar_aunque_coincida_con_otro_pais():
    # "3624204468" (área 362 = Resistencia, Chaco) también valida como un
    # número húngaro si se lo interpreta con código de país +36. Sin un '+'
    # explícito, en esta base gana la interpretación doméstica argentina.
    r = normalizar_telefono_unico("3624204468", CFG)
    assert r.pais == "AR"
    assert r.e164 == "+5493624204468"


def test_54_pegado_sin_signo_mas_se_reconoce_como_ar():
    # Formato real de exports de Google Contacts: mismo número, sin '+'.
    r = normalizar_telefono_unico("5493743504517", CFG)
    assert r.e164 == "+5493743504517"
    assert r.pais == "AR"
    assert r.flags == []


def test_deduplica_mismo_e164_repetido_en_un_campo():
    resultados = normalizar_campo_telefono("3743504517 ::: 3743504517 ::: 5493743504517", CFG)
    assert len(resultados) == 1
    assert resultados[0].e164 == "+5493743504517"


def test_dividir_campo_telefono_ignora_vacios():
    assert dividir_campo_telefono("") == []
    assert dividir_campo_telefono("   ") == []
    assert dividir_campo_telefono(",,,") == []


def test_numero_no_parseable_queda_para_revisar():
    r = normalizar_telefono_unico("abc", CFG)
    assert r.e164 is None
    assert r.valido is False
    assert r.flags == ["revisar"]


def test_numero_demasiado_corto_queda_para_revisar():
    r = normalizar_telefono_unico("12345", CFG)
    assert r.e164 is None
    assert r.flags == ["revisar"]


def test_numero_con_mas_pero_sin_pais_valido_no_se_inventa_ar():
    r = normalizar_telefono_unico("+123456789", CFG)
    assert r.e164 is None
    assert r.flags == ["revisar"]


def test_doce_digitos_sin_15_en_la_posicion_correcta_queda_para_revisar():
    r = normalizar_telefono_unico("0119876543210", CFG)
    assert r.e164 is None
    assert r.flags == ["revisar"]


def test_ambiguo_10_digitos_asume_movil_por_config():
    r = normalizar_telefono_unico("3743504517", CFG)
    assert r.e164 == "+5493743504517"
    assert r.flags == ["movil-asumido"]
    assert r.valido is True


def test_ambiguo_10_digitos_con_config_sin_asumir_movil_es_fijo():
    r = normalizar_telefono_unico("3743504517", CFG_SIN_ASUMIR)
    assert r.e164 == "+543743504517"
    assert r.flags == ["fijo"]


def test_pista_de_etiqueta_home_fuerza_fijo():
    r = normalizar_telefono_unico("3743504517", CFG, label_hint="Home")
    assert r.e164 == "+543743504517"
    assert r.flags == ["fijo"]


def test_pista_de_etiqueta_celular_fuerza_movil_aunque_config_diga_fijo():
    r = normalizar_telefono_unico("3743504517", CFG_SIN_ASUMIR, label_hint="Celular")
    assert r.e164 == "+5493743504517"
    assert r.flags == []


def test_formato_internacional_ya_normalizado_es_idempotente():
    r1 = normalizar_telefono_unico("+54 9 3743 504517", CFG)
    assert r1.e164 == "+5493743504517"
    assert r1.flags == []
    r2 = normalizar_telefono_unico(r1.e164, CFG)
    assert r2.e164 == r1.e164
    assert r2.flags == []


def test_area_code_2_digitos_buenos_aires_con_15():
    r = normalizar_telefono_unico("011 15-1234-5678", CFG)
    assert r.e164 == "+5491112345678"
    assert r.flags == []


def test_multiples_paises_de_la_lista_minima_pedida():
    # Números de ejemplo oficiales de libphonenumber (garantizado válidos) para
    # cada país de la lista mínima pedida: Brasil, Chile, Uruguay, Paraguay,
    # Bolivia, Perú, Colombia, Venezuela, Ecuador, México, EE.UU., España,
    # Italia, Francia, Alemania, Reino Unido, Portugal, Israel, China.
    casos = {
        "+551123456789": "BR",
        "+56600123456": "CL",
        "+59821231234": "UY",
        "+595212345678": "PY",
        "+59122123456": "BO",
        "+5111234567": "PE",
        "+576012345678": "CO",
        "+582121234567": "VE",
        "+59322123456": "EC",
        "+522001234567": "MX",
        "+12015550123": "US",
        "+34810123456": "ES",
        "+390212345678": "IT",
        "+33123456789": "FR",
        "+4930123456": "DE",
        "+441212345678": "GB",
        "+351212345678": "PT",
        "+97221234567": "IL",
        "+861012345678": "CN",
    }
    for numero, pais_esperado in casos.items():
        r = normalizar_telefono_unico(numero, CFG)
        assert r.pais == pais_esperado, f"{numero} -> esperaba {pais_esperado}, dio {r.pais}"
        assert r.flags == ["extranjero"]
