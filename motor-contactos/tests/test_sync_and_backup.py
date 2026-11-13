"""Tests para el módulo de Backup Histórico, Sincronización Google People API y Rollback (Undo)."""

from __future__ import annotations

import dataclasses
import json
import zipfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from motor.config import RutasConfig, cargar_config
from motor.staging_db import conectar
from motor.sync.backup import crear_snapshot_historico, listar_backups
from motor.sync.google_sync import (
    deshacer_sincronizacion,
    obtener_ultimo_manifiesto,
    sincronizar_hacia_google,
)


@pytest.fixture
def mock_entorno(tmp_path):
    """Crea una estructura de carpetas temporal con base staging y archivos de salida."""
    db_path = tmp_path / "test_staging.sqlite"
    crudos_path = tmp_path / "Data" / "Crudos"
    salida_path = tmp_path / "Data" / "Salida"
    backups_path = tmp_path / "Data" / "Backups"
    drive_path = tmp_path / "GoogleDrive"

    crudos_path.mkdir(parents=True)
    salida_path.mkdir(parents=True)
    backups_path.mkdir(parents=True)
    drive_path.mkdir(parents=True)

    # Crear base sqlite y registros mínimos
    conn = conectar(db_path)
    conn.execute(
        "INSERT INTO raw_records (id, source_file, source_row, raw_json, creado_en) "
        "VALUES (1, 'google:sindy:people/c1', 1, '{\"nombre\": \"Sindy\", \"apellido\": \"Regente\"}', '2026-09-20T00:00:00')"
    )
    conn.commit()
    conn.close()

    # Crear un archivo de salida de prueba
    (salida_path / "lista-maestra.xlsx").write_bytes(b"PK\x03\x04fake_excel_content")
    (crudos_path / "archivo_origen.csv").write_text("nombre,apellido\nJuan,Perez", encoding="utf-8")

    config_base = cargar_config("config.yaml")
    nuevas_rutas = RutasConfig(
        carpeta_raiz=crudos_path,
        carpeta_salida=salida_path,
        base_sqlite=db_path,
    )
    config = dataclasses.replace(config_base, rutas=nuevas_rutas)

    return config, tmp_path, drive_path


def test_crear_snapshot_historico(mock_entorno):
    config, tmp_path, drive_path = mock_entorno

    resultado = crear_snapshot_historico(config, destino_drive_path=drive_path)

    assert resultado["ok"] is True
    assert resultado["tamano_bytes"] > 0
    assert Path(resultado["ruta_local"]).exists()
    assert resultado["ruta_drive"] is not None
    assert Path(resultado["ruta_drive"]).exists()

    # Verificar contenido interno del zip
    with zipfile.ZipFile(resultado["ruta_local"], "r") as zf:
        nombres = zf.namelist()
        assert "sqlite/test_staging.sqlite" in nombres
        assert "salida/lista-maestra.xlsx" in nombres
        assert "snapshot_manifest.json" in nombres

        manifest_data = json.loads(zf.read("snapshot_manifest.json"))
        assert manifest_data["version"] == "1.0"
        assert manifest_data["total_archivos"] >= 2


def test_listar_backups(mock_entorno):
    config, _, _ = mock_entorno

    crear_snapshot_historico(config)
    crear_snapshot_historico(config)

    backups = listar_backups(config)
    assert len(backups) >= 2
    assert backups[0]["tamano_bytes"] > 0
    assert "backup_contactos_" in backups[0]["nombre"]


def test_sincronizar_hacia_google_dry_run(mock_entorno):
    config, _, _ = mock_entorno

    # Mock del servicio de Google People API
    service_mock = MagicMock()
    connections_list_mock = MagicMock()
    connections_list_mock.execute.return_value = {
        "connections": [
            {
                "resourceName": "people/cExisting1",
                "etag": "etag_123",
                "names": [{"givenName": "Carlos", "familyName": "Existente"}],
                "phoneNumbers": [{"value": "+5493764001122"}],
                "emailAddresses": [{"value": "carlos@test.com"}],
            }
        ],
        "nextPageToken": None,
    }
    service_mock.people.return_value.connections.return_value.list.return_value = connections_list_mock

    lista_canonica = [
        # Contacto que existe pero con diferencia de nombre (Modificación)
        {
            "nombre": "Carlos",
            "apellido": "Actualizado",
            "empresa": "Mejora",
            "cargo": "Director",
            "whatsapp": {"+5493764001122"},
            "telefono_fijo": set(),
            "emails": {"carlos@test.com"},
            "nota_referencia": "Gobernanza regente",
            "flags": {"sindy_regente"},
        },
        # Contacto nuevo (Alta)
        {
            "nombre": "Nuevo",
            "apellido": "Contacto",
            "empresa": "Tech",
            "cargo": "Dev",
            "whatsapp": {"+5493764998877"},
            "telefono_fijo": set(),
            "emails": {"nuevo@tech.com"},
            "nota_referencia": "",
            "flags": set(),
        },
    ]

    res = sincronizar_hacia_google(
        cuenta="sindy",
        config=config,
        dry_run=True,
        service_mock=service_mock,
        lista_canonica=lista_canonica,
    )

    assert res["ok"] is True
    assert res["dry_run"] is True
    assert res["altas_estimadas"] == 1
    assert res["modificaciones_estimadas"] == 1

    # Asegurar que en dry_run NO se ejecutan mutaciones
    service_mock.people.return_value.createContact.assert_not_called()
    service_mock.people.return_value.updateContact.assert_not_called()


def test_sincronizar_real_y_rollback_idempotente(mock_entorno):
    config, _, _ = mock_entorno

    service_mock = MagicMock()
    # 1. Contacto existente
    connections_list_mock = MagicMock()
    connections_list_mock.execute.return_value = {
        "connections": [
            {
                "resourceName": "people/cExistente1",
                "etag": "etag_original",
                "names": [{"givenName": "Persona", "familyName": "Original"}],
                "phoneNumbers": [{"value": "+5493764112233"}],
                "emailAddresses": [],
            }
        ],
        "nextPageToken": None,
    }
    service_mock.people.return_value.connections.return_value.list.return_value = connections_list_mock

    # Mock para updateContact
    update_mock = MagicMock()
    update_mock.execute.return_value = {
        "resourceName": "people/cExistente1",
        "etag": "etag_modificado",
        "names": [{"givenName": "Persona", "familyName": "Nueva"}],
    }
    service_mock.people.return_value.updateContact.return_value = update_mock

    # Mock para createContact
    create_mock = MagicMock()
    create_mock.execute.return_value = {
        "resourceName": "people/cNuevo999",
        "etag": "etag_nuevo",
    }
    service_mock.people.return_value.createContact.return_value = create_mock

    lista_canonica = [
        # Modificación
        {
            "nombre": "Persona",
            "apellido": "Nueva",
            "empresa": "Mejora",
            "whatsapp": {"+5493764112233"},
            "telefono_fijo": set(),
            "emails": set(),
            "flags": {"sindy_regente"},
        },
        # Alta
        {
            "nombre": "Alta",
            "apellido": "Reciente",
            "empresa": "Ecosistema",
            "whatsapp": {"+5493764556677"},
            "telefono_fijo": set(),
            "emails": set(),
            "flags": set(),
        },
    ]

    # Ejecución Real (dry_run=False)
    res_sync = sincronizar_hacia_google(
        cuenta="sindy",
        config=config,
        dry_run=False,
        service_mock=service_mock,
        lista_canonica=lista_canonica,
    )

    assert res_sync["ok"] is True
    assert res_sync["altas_ejecutadas"] == 1
    assert res_sync["modificaciones_ejecutadas"] == 1
    assert Path(res_sync["manifest_path"]).exists()

    manifest_path = Path(res_sync["manifest_path"])
    with manifest_path.open("r", encoding="utf-8") as f:
        manifest_data = json.load(f)
        assert manifest_data["cuenta"] == "sindy"
        assert manifest_data["revertido"] is False
        assert len(manifest_data["operaciones"]) == 2

    ultimo = obtener_ultimo_manifiesto(config)
    assert ultimo is not None
    assert ultimo["revertido"] is False

    # Mock para deleteContact
    delete_mock = MagicMock()
    delete_mock.execute.return_value = {}
    service_mock.people.return_value.deleteContact.return_value = delete_mock

    # EJECUTAR ROLLBACK (UNDO)
    res_rollback = deshacer_sincronizacion(config, manifest_path=manifest_path, service_mock=service_mock)
    assert res_rollback["ok"] is True
    assert res_rollback["restaurados"] == 1
    assert res_rollback["eliminados"] == 1

    # Verificar que deleteContact se llamó con people/cNuevo999
    service_mock.people.return_value.deleteContact.assert_called_with(resourceName="people/cNuevo999")

    # Verificar que el manifiesto quedó marcado como revertido
    with manifest_path.open("r", encoding="utf-8") as f:
        manifest_revertido = json.load(f)
        assert manifest_revertido["revertido"] is True
        assert manifest_revertido["revertido_en"] is not None

    # IDEMPOTENCIA: Ejecutar rollback por segunda vez
    res_reintento = deshacer_sincronizacion(config, manifest_path=manifest_path, service_mock=service_mock)
    assert res_reintento["ok"] is True
    assert res_reintento.get("ya_revertido") is True
    assert res_reintento["restaurados"] == 0
    assert res_reintento["eliminados"] == 0


def test_endpoints_server_sync_and_backup(mock_entorno, monkeypatch):
    config, _, drive_path = mock_entorno
    from motor.server import crear_servidor

    app = crear_servidor(config)
    app.config["TESTING"] = True

    with app.test_client() as client:
        # 1. POST /api/backup-drive
        resp_backup = client.post("/api/backup-drive", json={"destino_drive_path": str(drive_path)})
        assert resp_backup.status_code == 200
        data_b = resp_backup.get_json()
        assert data_b["ok"] is True
        assert "backup_contactos_" in data_b["nombre"]

        # 2. GET /api/backups-lista
        resp_lista = client.get("/api/backups-lista")
        assert resp_lista.status_code == 200
        data_l = resp_lista.get_json()
        assert data_l["ok"] is True
        assert len(data_l["backups"]) >= 1

        # 3. POST /api/sync-google-push (dry_run=True) con mock
        import motor.sync.google_sync as gsync
        monkeypatch.setattr(
            gsync,
            "sincronizar_hacia_google",
            lambda cuenta, cfg, conn=None, dry_run=False, service_mock=None, lista_canonica=None: {
                "ok": True,
                "dry_run": dry_run,
                "cuenta": cuenta,
                "altas_estimadas": 5,
                "modificaciones_estimadas": 2,
                "sin_cambios": 10,
                "total_canónicos": 17,
            },
        )

        resp_sync = client.post("/api/sync-google-push", json={"cuenta": "sindy", "dry_run": True})
        assert resp_sync.status_code == 200
        data_s = resp_sync.get_json()
        assert data_s["ok"] is True
        assert data_s["altas_estimadas"] == 5

        # 4. POST /api/sync-undo con mock
        monkeypatch.setattr(
            gsync,
            "deshacer_sincronizacion",
            lambda cfg, manifest_path=None, service_mock=None: {
                "ok": True,
                "cuenta": "sindy",
                "manifest_nombre": "rollback_manifest_test.json",
                "restaurados": 2,
                "eliminados": 5,
            },
        )

        resp_undo = client.post("/api/sync-undo", json={})
        assert resp_undo.status_code == 200
        data_u = resp_undo.get_json()
        assert data_u["ok"] is True
        assert data_u["restaurados"] == 2


def test_hacer_backup_previo_y_archivar(mock_entorno):
    from motor.sync.backup import (
        archivar_base_actual,
        hacer_backup_previo,
        listar_bases_archivadas,
        restaurar_base_archivada,
        restaurar_ultimo_backup,
    )

    config, tmp_path, _ = mock_entorno

    # 1. Backup previo automático
    res_b = hacer_backup_previo(config, motivo="test_run")
    assert res_b["ok"] is True
    assert "lista-maestra.xlsx" in res_b["archivos_respaldados"]
    ultimo_file = Path(res_b["carpeta_ultimo"]) / "lista-maestra.xlsx"
    assert ultimo_file.exists()

    # 1b. Test restaurar ultimo backup
    # Borrar lista-maestra de salida y restaurarla
    (config.rutas.carpeta_salida / "lista-maestra.xlsx").unlink()
    assert not (config.rutas.carpeta_salida / "lista-maestra.xlsx").exists()
    res_ru = restaurar_ultimo_backup(config)
    assert res_ru["ok"] is True
    assert (config.rutas.carpeta_salida / "lista-maestra.xlsx").exists()

    # 2. Archivar base actual (Caso 2)
    res_arch = archivar_base_actual(config, etiqueta="lote_previo")
    assert res_arch["ok"] is True
    assert "test_staging.sqlite" in res_arch["archivos_movidos"]
    # El archivo en Salida fue movido
    assert not config.rutas.base_sqlite.exists()

    # Verificar que aparece en la lista de bases archivadas
    bases = listar_bases_archivadas(config)
    assert len(bases) >= 1
    assert any("lote_previo" in b["etiqueta"] for b in bases)

    # 3. Restaurar base archivada
    res_rest = restaurar_base_archivada(config, bases[0]["nombre"])
    assert res_rest["ok"] is True
    assert config.rutas.base_sqlite.exists()


