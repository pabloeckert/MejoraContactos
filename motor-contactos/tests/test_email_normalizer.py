from motor.config import EmailConfig
from motor.email_normalizer import (
    dividir_campo_email,
    normalizar_campo_email,
    normalizar_email_unico,
)

CFG = EmailConfig()


def test_minusculas_y_trim():
    r = normalizar_email_unico(" Juan.Perez@GMAIL.com ", CFG)
    assert r.normalizado == "juan.perez@gmail.com"
    assert r.valido is True
    assert r.flags == []  # minúsculas/trim no cuentan como "corrección"


def test_envoltorio_angular():
    r = normalizar_email_unico("<juan@gmail.com>", CFG)
    assert r.normalizado == "juan@gmail.com"
    assert r.valido is True


def test_envoltorio_corchetes():
    r = normalizar_email_unico("[juan@gmail.com]", CFG)
    assert r.normalizado == "juan@gmail.com"


def test_envoltorio_comillas():
    r = normalizar_email_unico('"juan@gmail.com"', CFG)
    assert r.normalizado == "juan@gmail.com"


def test_puntuacion_de_borde():
    r = normalizar_email_unico(",juan@gmail.com.", CFG)
    assert r.normalizado == "juan@gmail.com"


def test_mailto_removido():
    r = normalizar_email_unico("mailto:juan@gmail.com", CFG)
    assert r.normalizado == "juan@gmail.com"
    assert "mailto_removido" in r.correcciones
    assert r.flags == ["corregido"]


def test_arroba_como_palabra():
    r = normalizar_email_unico("juan arroba gmail.com", CFG)
    assert r.normalizado == "juan@gmail.com"
    assert "arroba_convertida" in r.correcciones


def test_at_entre_parentesis():
    r = normalizar_email_unico("juan(at)gmail.com", CFG)
    assert r.normalizado == "juan@gmail.com"


def test_at_entre_corchetes():
    r = normalizar_email_unico("juan[at]gmail.com", CFG)
    assert r.normalizado == "juan@gmail.com"


def test_arroba_duplicada_colapsada():
    r = normalizar_email_unico("juan@@gmail.com", CFG)
    assert r.normalizado == "juan@gmail.com"
    assert "arroba_duplicada_colapsada" in r.correcciones


def test_puntos_duplicados_colapsados():
    r = normalizar_email_unico("juan@gmail..com", CFG)
    assert r.normalizado == "juan@gmail.com"
    assert "puntos_duplicados_colapsados" in r.correcciones


def test_tildes_y_enie_transliteradas():
    r = normalizar_email_unico("josé.muñoz@gmail.com", CFG)
    assert r.normalizado == "jose.munoz@gmail.com"
    assert "tildes_transliteradas" in r.correcciones


def test_espacios_internos_removidos():
    r = normalizar_email_unico("ju an@gmail.com", CFG)
    assert r.normalizado == "juan@gmail.com"


def test_tld_typo_con():
    r = normalizar_email_unico("juan@gmail.con", CFG)
    assert r.normalizado == "juan@gmail.com"
    assert "tld_corregido:con->com" in r.correcciones


def test_tld_typo_cmo():
    r = normalizar_email_unico("juan@gmail.cmo", CFG)
    assert r.normalizado == "juan@gmail.com"


def test_tld_typo_vom():
    r = normalizar_email_unico("juan@hotmail.vom", CFG)
    assert r.normalizado == "juan@hotmail.com"


def test_dominio_sin_punto_gmailcom():
    r = normalizar_email_unico("juan@gmailcom", CFG)
    assert r.normalizado == "juan@gmail.com"
    assert any(c.startswith("dominio_reconstruido") for c in r.correcciones)


def test_dominio_sin_punto_comar():
    r = normalizar_email_unico("juan@fibertelcomar", CFG)
    assert r.normalizado == "juan@fibertel.com.ar"


def test_dominio_corregido_por_levenshtein_gmial():
    r = normalizar_email_unico("juan@gmial.com", CFG)
    assert r.normalizado == "juan@gmail.com"
    assert any(c.startswith("dominio_corregido") for c in r.correcciones)


def test_dominio_corregido_por_levenshtein_hotnail():
    r = normalizar_email_unico("juan@hotnail.com", CFG)
    assert r.normalizado == "juan@hotmail.com"


def test_dominio_argentino_conocido_no_se_toca():
    r = normalizar_email_unico("juan@fibertel.com.ar", CFG)
    assert r.normalizado == "juan@fibertel.com.ar"
    assert r.correcciones == []


def test_dominio_propio_no_se_confunde_con_uno_conocido():
    # Dominio real de una empresa: no está en la lista y la distancia a
    # cualquiera de los conocidos es demasiado grande -> no se toca.
    r = normalizar_email_unico("juan@mejoracontinua-sa.com.ar", CFG)
    assert r.normalizado == "juan@mejoracontinua-sa.com.ar"
    assert r.correcciones == []


def test_local_part_puede_terminar_en_guion_bajo():
    # Válido según RFC (no es el punto, que sí tiene la restricción de
    # borde) y aparece de verdad en pablo.csv/Sindy.csv.
    r = normalizar_email_unico("nancri_05_@hotmail.com", CFG)
    assert r.normalizado == "nancri_05_@hotmail.com"
    assert r.valido is True


def test_local_part_puede_terminar_en_guion():
    r = normalizar_email_unico("iaruty-@hotmail.com", CFG)
    assert r.normalizado == "iaruty-@hotmail.com"
    assert r.valido is True


def test_local_part_con_virgulilla_rfc_valida():
    r = normalizar_email_unico("dasilvajorge~as@yahoo.com.ar", CFG)
    assert r.normalizado == "dasilvajorge~as@yahoo.com.ar"
    assert r.valido is True


def test_dominio_real_ymail_no_se_confunde_con_gmail():
    # ymail.com es un dominio real de Yahoo, no un typo de gmail.com,
    # aunque esté a distancia 1 en config.yaml.
    r = normalizar_email_unico("juan@ymail.com", CFG)
    assert r.normalizado == "juan@ymail.com"
    assert r.correcciones == []


def test_dominio_real_mail_com_no_se_confunde_con_gmail():
    r = normalizar_email_unico("juan@mail.com", CFG)
    assert r.normalizado == "juan@mail.com"
    assert r.correcciones == []


def test_dominio_corto_no_se_corrige_a_distancia_2():
    # "lge.com" (LG Electronics) y "gire.com" (Grupo Gire) son dominios
    # corporativos reales que aparecen en los datos reales; a distancia 2
    # de "live.com" pero son demasiado cortos para que 2 ediciones sea una
    # corrección confiable -> se dejan como están.
    r1 = normalizar_email_unico("juan@lge.com", CFG)
    assert r1.normalizado == "juan@lge.com"
    assert r1.correcciones == []

    r2 = normalizar_email_unico("juan@gire.com", CFG)
    assert r2.normalizado == "juan@gire.com"
    assert r2.correcciones == []


def test_invalido_sin_arroba():
    r = normalizar_email_unico("juan.perez", CFG)
    assert r.normalizado is None
    assert r.valido is False
    assert r.flags == ["invalido"]


def test_invalido_local_vacio():
    r = normalizar_email_unico("@gmail.com", CFG)
    assert r.normalizado is None
    assert r.flags == ["invalido"]


def test_invalido_dominio_vacio():
    r = normalizar_email_unico("juan@", CFG)
    assert r.normalizado is None
    assert r.flags == ["invalido"]


def test_invalido_texto_libre():
    r = normalizar_email_unico("no es un email", CFG)
    assert r.normalizado is None
    assert r.flags == ["invalido"]


def test_invalido_dos_arrobas_no_colapsables():
    r = normalizar_email_unico("juan@gmail.com@hotmail.com", CFG)
    assert r.normalizado is None
    assert r.flags == ["invalido"]


def test_multiples_emails_separados_por_coma():
    resultados = normalizar_campo_email("juan@gmail.com, maria@hotmail.com", CFG)
    assert [r.normalizado for r in resultados] == ["juan@gmail.com", "maria@hotmail.com"]


def test_multiples_emails_separados_por_triple_dos_puntos():
    resultados = normalizar_campo_email("juan@gmail.com ::: maria@hotmail.com", CFG)
    assert [r.normalizado for r in resultados] == ["juan@gmail.com", "maria@hotmail.com"]


def test_deduplica_email_repetido_en_un_campo():
    resultados = normalizar_campo_email("juan@gmail.com ::: JUAN@Gmail.com", CFG)
    assert len(resultados) == 1
    assert resultados[0].normalizado == "juan@gmail.com"


def test_dividir_campo_email_ignora_vacios():
    assert dividir_campo_email("") == []
    assert dividir_campo_email("   ") == []


def test_idempotente():
    r1 = normalizar_email_unico("juan.perez@gmail.com", CFG)
    r2 = normalizar_email_unico(r1.normalizado, CFG)
    assert r1.normalizado == r2.normalizado
    assert r2.flags == []
    assert r2.correcciones == []
