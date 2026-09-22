"""Módulo de Backup Histórico y Snapshots para MejoraContactos.

Empaqueta staging.sqlite, archivos XLSX de salida y crudos en
Data/Backups/backup_contactos_%Y%m%d_%H%M%S.zip, con copia opcional
en Google Drive (si está configurado o detectado).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from motor.config import Config

logger = logging.getLogger(__name__)


def _formatear_tamano(bytes_totales: int) -> str:
    """Formatea bytes a KB, MB o GB legible."""
    if bytes_totales < 1024:
        return f"{bytes_totales} B"
    elif bytes_totales < 1024 * 1024:
        return f"{bytes_totales / 1024:.1f} KB"
    elif bytes_totales < 1024 * 1024 * 1024:
        return f"{bytes_totales / (1024 * 1024):.1f} MB"
    return f"{bytes_totales / (1024 * 1024 * 1024):.2f} GB"


def _obtener_carpeta_backups(config: Config) -> Path:
    """Obtiene y asegura la existencia de Data/Backups."""
    carpeta = config.rutas.carpeta_salida.parent / "Backups"
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def _detectar_carpeta_drive() -> Path | None:
    """Intenta detectar una carpeta local sincronizada con Google Drive."""
    # 1. Variable de entorno explícita
    env_drive = os.environ.get("GOOGLE_DRIVE_PATH")
    if env_drive:
        p = Path(env_drive)
        if p.exists():
            return p

    # 2. Letras de unidad comunes de Google Drive en Windows (G:, H:, etc.)
    candidatos = [
        Path("G:/Mi unidad/MejoraContactos/Backups"),
        Path("G:/My Drive/MejoraContactos/Backups"),
        Path("G:/Mi unidad"),
        Path("G:/My Drive"),
        Path("G:/"),
    ]
    for cand in candidatos:
        if cand.exists():
            return cand

    return None


def crear_snapshot_historico(
    config: Config,
    destino_drive_path: str | Path | None = None,
    prefijo: str = "backup_contactos",
) -> dict[str, Any]:
    """Empaqueta el estado actual de staging.sqlite, los crudos y los XLSX en
    'Data/Backups/{prefijo}_%Y%m%d_%H%M%S.zip'.
    Si existe una ruta de Google Drive configurada o pasada, copia el snapshot allí.
    """
    carpeta_backups = _obtener_carpeta_backups(config)
    ahora = datetime.now(timezone.utc)
    estampa = ahora.strftime("%Y%m%d_%H%M%S")
    nombre_archivo = f"{prefijo}_{estampa}.zip"
    ruta_zip = carpeta_backups / nombre_archivo
    if ruta_zip.exists():
        nombre_archivo = f"{prefijo}_{estampa}_{ahora.microsecond:06d}.zip"
        ruta_zip = carpeta_backups / nombre_archivo

    archivos_incluidos: list[dict[str, Any]] = []

    # Crear el zip empaquetando staging.sqlite, salidas y crudos
    with zipfile.ZipFile(ruta_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1. staging.sqlite y auxiliares de WAL si existen
        db_path = config.rutas.base_sqlite
        if db_path.exists():
            zf.write(db_path, arcname=f"sqlite/{db_path.name}")
            archivos_incluidos.append({"arcname": f"sqlite/{db_path.name}", "tamano": db_path.stat().st_size})

            wal_path = db_path.with_name(db_path.name + "-wal")
            if wal_path.exists():
                zf.write(wal_path, arcname=f"sqlite/{wal_path.name}")
                archivos_incluidos.append({"arcname": f"sqlite/{wal_path.name}", "tamano": wal_path.stat().st_size})

            shm_path = db_path.with_name(db_path.name + "-shm")
            if shm_path.exists():
                zf.write(shm_path, arcname=f"sqlite/{shm_path.name}")
                archivos_incluidos.append({"arcname": f"sqlite/{shm_path.name}", "tamano": shm_path.stat().st_size})

        # 2. Planillas y exportaciones en Data/Salida/
        salida_dir = config.rutas.carpeta_salida
        if salida_dir.exists():
            for f in salida_dir.glob("*.*"):
                if f.suffix.lower() in {".xlsx", ".xls", ".csv", ".json"} and not f.name.endswith(".sqlite"):
                    arcname = f"salida/{f.name}"
                    zf.write(f, arcname=arcname)
                    archivos_incluidos.append({"arcname": arcname, "tamano": f.stat().st_size})

        # 3. Archivos crudos en Data/Crudos/ (hasta 50 archivos más recientes para no inflar innecesariamente)
        crudos_dir = config.rutas.carpeta_raiz
        if crudos_dir.exists():
            archivos_crudos = [p for p in crudos_dir.glob("**/*") if p.is_file()]
            archivos_crudos.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            for f in archivos_crudos[:50]:
                try:
                    rel = f.relative_to(crudos_dir)
                    arcname = f"crudos/{rel.as_posix()}"
                    zf.write(f, arcname=arcname)
                    archivos_incluidos.append({"arcname": arcname, "tamano": f.stat().st_size})
                except Exception as e:
                    logger.debug("Omitiendo archivo crudo en snapshot: %s", e)

        # 4. Manifiesto del Backup embebido
        manifiesto = {
            "version": "1.0",
            "creado_en": ahora.isoformat(),
            "nombre_archivo": nombre_archivo,
            "archivos_incluidos": archivos_incluidos,
            "total_archivos": len(archivos_incluidos),
        }
        zf.writestr("snapshot_manifest.json", json.dumps(manifiesto, indent=2, ensure_ascii=False))

    tamano_bytes = ruta_zip.stat().st_size

    # Copia a Google Drive si corresponde
    copia_drive_path: str | None = None
    drive_dest = None
    if destino_drive_path:
        drive_dest = Path(destino_drive_path)
    else:
        drive_dest = _detectar_carpeta_drive()

    if drive_dest is not None:
        try:
            drive_dest.mkdir(parents=True, exist_ok=True)
            destino_final = drive_dest / nombre_archivo
            shutil.copy2(ruta_zip, destino_final)
            copia_drive_path = str(destino_final)
            logger.info("Snapshot copiado a Google Drive: %s", destino_final)
        except Exception as exc:
            logger.warning("No se pudo copiar el snapshot a Google Drive (%s): %s", drive_dest, exc)

    return {
        "ok": True,
        "nombre": nombre_archivo,
        "ruta_local": str(ruta_zip),
        "ruta_drive": copia_drive_path,
        "tamano_bytes": tamano_bytes,
        "tamano_formateado": _formatear_tamano(tamano_bytes),
        "fecha": ahora.strftime("%d/%m/%Y %H:%M:%S"),
        "total_archivos": len(archivos_incluidos),
    }


def listar_backups(config: Config) -> list[dict[str, Any]]:
    """Devuelve la lista cronológica de backups disponibles en Data/Backups."""
    carpeta_backups = _obtener_carpeta_backups(config)
    zips = list(carpeta_backups.glob("backup_contactos*.zip"))
    zips.sort(key=lambda p: p.stat().st_mtime, reverse=True)

    resultado = []
    for z in zips:
        try:
            st = z.stat()
            mtime = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
            resultado.append({
                "nombre": z.name,
                "ruta": str(z),
                "tamano_bytes": st.st_size,
                "tamano_formateado": _formatear_tamano(st.st_size),
                "fecha": mtime.strftime("%d/%m/%Y %H:%M"),
                "fecha_iso": mtime.isoformat(),
            })
        except Exception:
            continue

    return resultado
