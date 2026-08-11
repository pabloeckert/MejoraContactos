from motor.dedup import learning
from motor.staging_db import conectar

PATRON = "tel=si|mail=no|nombre=media"


def test_sin_evidencia_suficiente_el_ajuste_es_cero(tmp_path):
    conn = conectar(tmp_path / "staging.sqlite")
    for _ in range(5):
        learning.registrar_decision(conn, PATRON, aceptada=True)
    assert learning.obtener_ajuste(conn, PATRON) == 0.0


def test_evidencia_suficiente_toda_aceptada_da_ajuste_positivo_maximo(tmp_path):
    conn = conectar(tmp_path / "staging.sqlite")
    for _ in range(20):
        learning.registrar_decision(conn, PATRON, aceptada=True)
    assert learning.obtener_ajuste(conn, PATRON) == 0.1


def test_evidencia_suficiente_toda_rechazada_da_ajuste_negativo_maximo(tmp_path):
    conn = conectar(tmp_path / "staging.sqlite")
    for _ in range(20):
        learning.registrar_decision(conn, PATRON, aceptada=False)
    assert learning.obtener_ajuste(conn, PATRON) == -0.1


def test_patron_desconocido_da_ajuste_cero(tmp_path):
    conn = conectar(tmp_path / "staging.sqlite")
    assert learning.obtener_ajuste(conn, "patron-nunca-visto") == 0.0
