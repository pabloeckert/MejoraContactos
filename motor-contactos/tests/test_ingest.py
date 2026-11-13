"""extraer_todo() con `raiz`/`todas_las_extensiones` (botón "Importar de
carpeta") y extraer_archivo() (botón "Importar archivo") -- ambos casos
nuevos del panel que dejan elegir una ubicación arbitraria en vez de la
carpeta_raiz configurada. Solo CSV/JSON sintéticos, nunca datos reales."""

import pytest

from motor.config import Config, DedupConfig, EmailConfig, LlmConfig, RevisorConfig, RutasConfig, TelefonoConfig
from motor.ingest import extraer_archivo, extraer_todo
from motor.staging_db import conectar


def _config_prueba(tmp_path):
    (tmp_path / "Crudos").mkdir()
    return Config(
        rutas=RutasConfig(
            carpeta_raiz=tmp_path / "Crudos",
            carpeta_salida=tmp_path / "Salida",
            base_sqlite=tmp_path / "Salida" / "staging.sqlite",
        ),
        extensiones_permitidas=frozenset({"csv"}),
        telefono=TelefonoConfig(),
        email=EmailConfig(),
        dedup=DedupConfig(),
        llm=LlmConfig(activar_para_dudosos=False),
        revisor=RevisorConfig(),
    )


def test_extraer_todo_con_raiz_distinta_a_la_configurada(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    otra_carpeta = tmp_path / "ElegidaAMano"
    (otra_carpeta / "sub").mkdir(parents=True)
    (otra_carpeta / "a.csv").write_text("Nombre,Telefono\nJuan,3743504517\n", encoding="utf-8")
    (otra_carpeta / "sub" / "b.csv").write_text("Nombre,Telefono\nAna,3743504518\n", encoding="utf-8")

    nuevos = extraer_todo(config, conn, raiz=otra_carpeta)

    assert nuevos == 2  # incluye la subcarpeta
    assert conn.execute("SELECT COUNT(*) FROM raw_records").fetchone()[0] == 2


def test_extraer_todo_todas_las_extensiones_ignora_config_extensiones_permitidas(tmp_path):
    config = _config_prueba(tmp_path)  # extensiones_permitidas = {"csv"} solamente
    conn = conectar(config.rutas.base_sqlite)

    carpeta = tmp_path / "Mixta"
    carpeta.mkdir()
    (carpeta / "a.csv").write_text("Nombre,Telefono\nJuan,3743504517\n", encoding="utf-8")
    (carpeta / "b.json").write_text(
        '[{"nombre": "Ana", "telefono_1": "3743504518"}]', encoding="utf-8"
    )

    sin_todas = extraer_todo(config, conn, raiz=carpeta)
    assert sin_todas == 1  # .json no está en extensiones_permitidas, se salteó

    con_todas = extraer_todo(config, conn, raiz=carpeta, todas_las_extensiones=True)
    assert con_todas == 1  # ahora sí procesa el .json (el .csv ya estaba, no se duplica)
    assert conn.execute("SELECT COUNT(*) FROM raw_records").fetchone()[0] == 2


def test_extraer_archivo_procesa_un_archivo_puntual_sin_importar_extensiones_permitidas(tmp_path):
    config = _config_prueba(tmp_path)  # extensiones_permitidas = {"csv"} solamente
    conn = conectar(config.rutas.base_sqlite)

    archivo = tmp_path / "suelto.json"
    archivo.write_text('[{"nombre": "Ana", "telefono_1": "3743504518"}]', encoding="utf-8")

    nuevos = extraer_archivo(conn, archivo)

    assert nuevos == 1
    assert conn.execute("SELECT COUNT(*) FROM raw_records").fetchone()[0] == 1


def test_extraer_archivo_sin_extractor_disponible_levanta_valueerror(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    archivo = tmp_path / "no-soportado.xyz"
    archivo.write_text("lo que sea", encoding="utf-8")

    with pytest.raises(ValueError, match=r"\.xyz"):
        extraer_archivo(conn, archivo)


def test_extraer_archivo_no_duplica_si_se_llama_dos_veces_sin_cambios(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    archivo = tmp_path / "a.csv"
    archivo.write_text("Nombre,Telefono\nJuan,3743504517\n", encoding="utf-8")

    primera = extraer_archivo(conn, archivo)
    segunda = extraer_archivo(conn, archivo)

    assert primera == 1
    assert segunda == 0  # mismo hash, ya procesado -- mismo criterio incremental que extraer_todo


def test_extraer_todo_reporta_progreso_y_omite_imagenes_sin_tesseract(tmp_path, monkeypatch):
    import motor.extractors.image_ocr_extractor as image_ocr_extractor
    import pytesseract
    from PIL import Image

    monkeypatch.setattr(image_ocr_extractor, "_avisado_tesseract_faltante", False)

    def _sin_tesseract(*args, **kwargs):
        raise pytesseract.TesseractNotFoundError()

    monkeypatch.setattr(pytesseract, "image_to_string", _sin_tesseract)

    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    carpeta = tmp_path / "MixConFotos"
    carpeta.mkdir()
    (carpeta / "datos.csv").write_text("Nombre,Telefono\nLucas,3764112233\n", encoding="utf-8")
    Image.new("RGB", (20, 20), color="white").save(carpeta / "foto1.jpg")
    Image.new("RGB", (20, 20), color="white").save(carpeta / "foto2.jpg")

    eventos = []
    nuevos = extraer_todo(
        config,
        conn,
        raiz=carpeta,
        todas_las_extensiones=True,
        callback_progreso=lambda actual, total, arch, n_arch, total_ins: eventos.append(
            (actual, total, arch.name, n_arch, total_ins)
        ),
    )

    assert nuevos == 1
    assert len(eventos) == 3
    assert eventos[-1][0] == 3 and eventos[-1][1] == 3
    assert eventos[-1][4] == 1
    rutas_proc = {r[0] for r in conn.execute("SELECT ruta FROM fuentes_procesadas").fetchall()}
    assert str(carpeta / "datos.csv") in rutas_proc
    assert str(carpeta / "foto1.jpg") not in rutas_proc
    assert str(carpeta / "foto2.jpg") not in rutas_proc

