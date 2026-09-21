import io
import json
import pytest
from pathlib import Path
from motor.config import cargar_config
from motor.server import crear_servidor, scan_manager


@pytest.fixture
def client(tmp_path):
    # Setup test config with temporary directory
    db_path = tmp_path / "test_staging.sqlite"
    crudos_path = tmp_path / "Data" / "Crudos"
    salida_path = tmp_path / "Data" / "Salida"
    crudos_path.mkdir(parents=True)
    salida_path.mkdir(parents=True)

    from motor.staging_db import conectar
    conn = conectar(db_path)
    conn.execute(
        "INSERT INTO raw_records (id, source_file, source_row, raw_json, creado_en) "
        "VALUES (1, 'archivo.csv', 1, '{}', '2026-09-20T00:00:00')"
    )
    conn.execute(
        "INSERT INTO raw_records (id, source_file, source_row, raw_json, creado_en) "
        "VALUES (2, 'archivo.csv', 2, '{}', '2026-09-20T00:00:00')"
    )
    conn.execute(
        "INSERT INTO normalized_records (raw_record_id, nombre, apellido, calidad, calidad_motivo, creado_en) "
        "VALUES (1, 'Juan', 'Perez', 'util', 'Con telefono movil', '2026-09-20T00:00:00')"
    )
    conn.execute(
        "INSERT INTO normalized_records (raw_record_id, nombre, apellido, calidad, calidad_motivo, creado_en) "
        "VALUES (2, 'Solo', 'Nombre', 'dudoso', 'Sin telefono ni email', '2026-09-20T00:00:00')"
    )
    conn.commit()

    import dataclasses
    from motor.config import RutasConfig

    config_base = cargar_config("config.yaml")
    nuevas_rutas = RutasConfig(
        carpeta_raiz=crudos_path,
        carpeta_salida=salida_path,
        base_sqlite=db_path,
    )
    config = dataclasses.replace(config_base, rutas=nuevas_rutas)

    app = crear_servidor(config, conn=conn)
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client, config, tmp_path


def test_scan_status_endpoint(client):
    test_client, _, _ = client
    resp = test_client.get("/api/scan-status")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "estado" in data
    assert "actividad_reciente" in data
    assert "progreso_porcentaje" in data


def test_calidad_resumen_endpoint(client):
    test_client, _, _ = client
    resp = test_client.get("/api/calidad-resumen")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total"] == 2
    assert data["util"] == 1
    assert data["dudoso"] == 1
    assert data["inutil"] == 0
    assert data["porcentajes"]["util"] == 50.0
    assert data["porcentajes"]["dudoso"] == 50.0
    assert len(data["top_motivos_dudoso"]) >= 1


def test_upload_files_endpoint(client):
    test_client, config, _ = client
    data = {
        "files": (io.BytesIO(b"nombre,apellido\nAna,Gomez"), "test_clientes.csv")
    }
    resp = test_client.post("/api/upload-files", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    res = resp.get_json()
    assert res["ok"] is True
    assert "test_clientes.csv" in res["archivos"]
    assert (config.rutas.carpeta_raiz / "test_clientes.csv").exists()


def test_scan_folder_invalida(client):
    test_client, _, _ = client
    # Probar con comillas dobles y barras invertidas
    resp = test_client.post("/api/scan-folder", json={"ruta": '"c:\\ruta\\que\\no\\existe\\12345"'})
    assert resp.status_code == 400
    res = resp.get_json()
    assert res["ok"] is False
    assert "no existe en el sistema" in res["error"]
    assert "\\" not in res["error"]  # barras invertidas normalizadas a '/'
    assert '"' not in res["error"]  # comillas limpiadas

    # Verificar que el error quedó explícitamente en actividad_reciente
    status_resp = test_client.get("/api/scan-status")
    assert status_resp.status_code == 200
    status_data = status_resp.get_json()
    mensajes = [item["mensaje"] for item in status_data["actividad_reciente"]]
    assert any("no existe en el sistema" in m for m in mensajes)
    assert status_data["estado"] == "error"


def test_dashboard_ui_endpoint(client):
    test_client, _, _ = client
    resp = test_client.get("/")
    assert resp.status_code == 200
    assert "MejoraContactos" in resp.text
    assert "Centro de Control" in resp.text
    assert "Gobernanza: Sindy Regente" in resp.text


def test_deduplicar_endpoint(client, monkeypatch):
    test_client, _, _ = client
    from motor.server import scan_manager
    monkeypatch.setattr(scan_manager, "iniciar_deduplicacion", lambda cfg: (True, "Deduplicación simulada iniciada"))
    resp = test_client.post("/api/deduplicar")
    assert resp.status_code == 200
    res = resp.get_json()
    assert res["ok"] is True
    assert "iniciada" in res["mensaje"]


def test_exportar_endpoint(client):
    test_client, _, _ = client
    resp = test_client.post("/api/exportar")
    assert resp.status_code == 200
    res = resp.get_json()
    assert res["ok"] is True
    assert "archivos" in res


def test_seleccionar_carpeta_dialog_exito(client, monkeypatch):
    test_client, _, _ = client
    monkeypatch.setattr("motor.server.abrir_dialogo_carpeta_tkinter", lambda: "C:/Usuarios/Test/Contactos")
    resp = test_client.post("/api/seleccionar-carpeta-dialog")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ruta"] == "C:/Usuarios/Test/Contactos"


def test_seleccionar_carpeta_dialog_cancelado(client, monkeypatch):
    test_client, _, _ = client
    monkeypatch.setattr("motor.server.abrir_dialogo_carpeta_tkinter", lambda: None)
    resp = test_client.post("/api/seleccionar-carpeta-dialog")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ruta"] is None


def test_dashboard_ui_botones_carpeta(client):
    test_client, _, _ = client
    resp = test_client.get("/")
    assert resp.status_code == 200
    assert "📁 Examinar en mi PC" in resp.text
    assert "webkitdirectory" in resp.text
    assert "Seleccionar Carpeta Web" in resp.text
    assert "/api/seleccionar-carpeta-dialog" in resp.text
    assert "Explorando subcarpetas en:" in resp.text


def test_universal_scanner_recursivo_subcarpetas(tmp_path):
    root = tmp_path / "EscanerRecursivo"
    sub1 = root / "Nivel1"
    sub2 = root / "Nivel1" / "Nivel2"
    sub1.mkdir(parents=True)
    sub2.mkdir(parents=True)

    # Crear archivos soportados en diferentes profundidades
    (sub1 / "clientes.csv").write_text("nombre,apellido,telefono\nCarlos,Benitez,1155554444\n", encoding="utf-8")
    (sub2 / "contacto.vcf").write_text("BEGIN:VCARD\nVERSION:3.0\nFN:Laura Gomez\nTEL:+5491144443333\nEND:VCARD\n", encoding="utf-8")

    db = tmp_path / "test_rec.sqlite"
    from motor.staging_db import conectar
    conn = conectar(db)

    import dataclasses
    from motor.config import RutasConfig
    config_base = cargar_config("config.yaml")
    config = dataclasses.replace(
        config_base,
        rutas=RutasConfig(carpeta_raiz=root, carpeta_salida=tmp_path, base_sqlite=db)
    )

    from motor.extractors.universal_scanner import UniversalScanner
    telemetria_logs = []
    def callback(evento, info):
        telemetria_logs.append(info.get("mensaje", ""))

    resultado = UniversalScanner.escanear_directorio(root, config, conn, callback_progreso=callback)
    conn.close()

    assert resultado["archivos_analizados"] == 2
    assert resultado["total_personas_unificadas"] >= 2
    # Verificar que telemetría registró la exploración de subcarpetas y la lista de archivos
    assert any("Explorando subcarpetas en:" in m for m in telemetria_logs)
    assert any("Archivos encontrados" in m for m in telemetria_logs)


