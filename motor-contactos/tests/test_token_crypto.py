"""Cifrado DPAPI de tokens -- corre solo en Windows (la única plataforma
donde vive este proyecto). Usa siempre archivos sintéticos en tmp_path,
nunca los token_*.json reales."""

import json

import pytest

from motor.token_crypto import desproteger, escribir_token_protegido, leer_token_protegido, proteger


def test_proteger_desproteger_es_reversible():
    original = b'{"refresh_token": "dato-de-prueba-sintetico"}'
    cifrado = proteger(original)
    assert cifrado != original  # de verdad se transformó
    assert desproteger(cifrado) == original


def test_leer_token_protegido_migra_texto_plano_sin_perder_datos(tmp_path):
    # Simula un token_*.json de ANTES de este cambio: texto plano, nunca
    # pasó por proteger(). No debe romper, y el contenido tiene que volver
    # intacto -- una cuenta ya autorizada no puede perder su sesión.
    contenido = json.dumps({"refresh_token": "abc123", "client_id": "xyz"})
    ruta = tmp_path / "token_prueba.json"
    ruta.write_text(contenido, encoding="utf-8")

    leido = leer_token_protegido(ruta)

    assert json.loads(leido) == json.loads(contenido)


def test_escribir_token_protegido_queda_cifrado_en_disco(tmp_path):
    ruta = tmp_path / "token_prueba.json"
    contenido = json.dumps({"refresh_token": "secreto-de-prueba"})

    escribir_token_protegido(ruta, contenido)

    crudo_en_disco = ruta.read_bytes()
    assert b"secreto-de-prueba" not in crudo_en_disco  # no queda legible a simple vista
    assert leer_token_protegido(ruta) == contenido  # pero se recupera bien


def test_ciclo_completo_migracion_y_re_escritura(tmp_path):
    # El flujo real: token viejo en texto plano -> se lee (migración
    # transparente) -> se re-escribe cifrado -> se vuelve a leer bien.
    ruta = tmp_path / "token_prueba.json"
    original = json.dumps({"refresh_token": "valor-original"})
    ruta.write_text(original, encoding="utf-8")

    leido_1 = leer_token_protegido(ruta)
    assert leido_1 == original

    escribir_token_protegido(ruta, leido_1)
    assert ruta.read_bytes() != original.encode("utf-8")  # ahora sí está cifrado

    leido_2 = leer_token_protegido(ruta)
    assert leido_2 == original


def test_desproteger_datos_invalidos_levanta_oserror():
    with pytest.raises(OSError):
        desproteger(b"esto no es un blob DPAPI valido")
