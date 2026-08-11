from motor.config import DedupConfig
from motor.dedup.scoring import RegistroParaScoring, calcular_score

CFG = DedupConfig()


def _reg(id_, nombre, apellido, telefonos=(), emails=(), organizacion=None):
    return RegistroParaScoring(
        id=id_,
        nombre=nombre,
        apellido=apellido,
        organizacion=organizacion,
        telefonos=frozenset(telefonos),
        emails=frozenset(emails),
    )


def test_mismo_telefono_da_score_alto():
    a = _reg(1, "Juan", "Perez", telefonos=["+5493743504517"])
    b = _reg(2, "J", "P", telefonos=["+5493743504517"])
    score, patron = calcular_score(a, b, CFG)
    assert score >= CFG.umbral_fusion_automatica
    assert "tel=si" in patron


def test_sin_ninguna_senial_en_comun_da_score_bajo():
    a = _reg(1, "Juan", "Perez", telefonos=["+5493743504517"])
    b = _reg(2, "Ricardo", "Gomez", telefonos=["+5493764368724"])
    score, patron = calcular_score(a, b, CFG)
    assert score <= CFG.umbral_no_fusionar
    assert "tel=no" in patron
    assert "mail=no" in patron


def test_mismo_email_da_score_alto():
    a = _reg(1, "Juan", "Perez", emails=["juan@gmail.com"])
    b = _reg(2, "Juancito", "P", emails=["juan@gmail.com"])
    score, _ = calcular_score(a, b, CFG)
    assert score >= CFG.umbral_fusion_automatica


def test_nombre_identico_sin_otras_senales_no_alcanza_umbral_alto():
    a = _reg(1, "Juan", "Perez")
    b = _reg(2, "Juan", "Perez")
    score, _ = calcular_score(a, b, CFG)
    assert score < CFG.umbral_fusion_automatica


def test_registro_sin_nombre_no_rompe():
    a = _reg(1, None, None, telefonos=["+5493743504517"])
    b = _reg(2, None, None, telefonos=["+5493743504517"])
    score, _ = calcular_score(a, b, CFG)
    assert score >= CFG.umbral_fusion_automatica


def test_mismo_telefono_pero_nombres_completos_claramente_distintos_no_fusiona_solo():
    # Caso real encontrado corriendo contra pablo.csv/Sindy.csv: un
    # teléfono fijo compartido por dos personas de la misma familia/oficina
    # no debe fusionarlas en silencio solo porque el teléfono coincide.
    a = _reg(1, "Maria Graciela", "Rolon", telefonos=["+5493764167669"])
    b = _reg(2, "Daniel Alfredo", "Altamira Gonzalez", telefonos=["+5493764167669"])
    score, patron = calcular_score(a, b, CFG)
    assert score < CFG.umbral_fusion_automatica
    assert "nombres_distintos" in patron


def test_mismo_telefono_con_un_nombre_vacio_igual_fusiona_solo():
    # La salvaguarda de nombres distintos solo aplica si AMBOS traen
    # nombre — si uno no tiene nombre cargado, no hay nada que comparar y
    # el criterio agresivo original sigue aplicando.
    a = _reg(1, None, None, telefonos=["+5493764167669"])
    b = _reg(2, "Daniel Alfredo", "Altamira Gonzalez", telefonos=["+5493764167669"])
    score, patron = calcular_score(a, b, CFG)
    assert score >= CFG.umbral_fusion_automatica
    assert "nombres_distintos" not in patron
