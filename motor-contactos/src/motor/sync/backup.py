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


def hacer_backup_previo(config: Config, motivo: str = "auto") -> dict[str, Any]:
    """Flujo de backup automático antes de cada proceso:
    1. Guarda en 'Data/Backups/ultimo_backup/' (carpeta fija que se pisa/actualiza con la versión previa más reciente).
    2. Guarda en 'Data/Backups/historico/' con timestamp y motivo para auditoría permanente.
    Respalda lista-maestra.xlsx y contactos-whatsapp.csv.
    """
    carpeta_backups = _obtener_carpeta_backups(config)
    carpeta_ultimo = carpeta_backups / "ultimo_backup"
    carpeta_historico = carpeta_backups / "historico"
    carpeta_ultimo.mkdir(parents=True, exist_ok=True)
    carpeta_historico.mkdir(parents=True, exist_ok=True)

    ahora = datetime.now(timezone.utc)
    estampa = ahora.strftime("%Y%m%d_%H%M%S")
    salida_dir = config.rutas.carpeta_salida

    respaldados: list[str] = []

    archivos_objetivo = ["lista-maestra.xlsx", "contactos-whatsapp.csv"]
    for nombre in archivos_objetivo:
        origen = salida_dir / nombre
        if origen.exists() and origen.stat().st_size > 0:
            # 1. Copia fija que se pisa/actualiza con el último estado previo
            destino_fijo = carpeta_ultimo / nombre
            shutil.copy2(origen, destino_fijo)

            # 2. Copia histórica versionada
            ext = origen.suffix
            stem = origen.stem
            destino_historico = carpeta_historico / f"{stem}_{estampa}_{motivo}{ext}"
            shutil.copy2(origen, destino_historico)

            respaldados.append(nombre)

    if respaldados:
        info_txt = (
            f"ÚLTIMO BACKUP PREVIO\n"
            f"Fecha: {ahora.strftime('%d/%m/%Y %H:%M:%S')} UTC\n"
            f"Motivo: {motivo}\n"
            f"Archivos respaldados: {', '.join(respaldados)}\n"
            f"\nNota: Esta carpeta se actualiza/pisa automáticamente en cada proceso con el estado previo más reciente.\n"
            f"En la carpeta contigua 'historico' se conservan todas las versiones históricas fechadas.\n"
        )
        try:
            (carpeta_ultimo / "info_ultimo_backup.txt").write_text(info_txt, encoding="utf-8")
        except Exception:
            pass

    logger.info("Backup previo completado (%s): %s", motivo, respaldados)
    return {
        "ok": True,
        "fecha": ahora.strftime("%d/%m/%Y %H:%M:%S"),
        "archivos_respaldados": respaldados,
        "carpeta_ultimo": str(carpeta_ultimo),
        "carpeta_historico": str(carpeta_historico),
    }


def restaurar_ultimo_backup(config: Config) -> dict[str, Any]:
    """Restaura los archivos del último backup previo (Data/Backups/ultimo_backup/)
    hacia la carpeta de salida activa (Data/Salida/).
    """
    carpeta_backups = _obtener_carpeta_backups(config)
    carpeta_ultimo = carpeta_backups / "ultimo_backup"
    if not carpeta_ultimo.exists():
        return {"ok": False, "error": "No existe la carpeta de último backup previo."}

    salida_dir = config.rutas.carpeta_salida
    salida_dir.mkdir(parents=True, exist_ok=True)

    restaurados = []
    for f in carpeta_ultimo.iterdir():
        if f.is_file() and not f.name.endswith(".txt") and not f.name.endswith(".json"):
            dest = salida_dir / f.name
            shutil.copy2(str(f), str(dest))
            restaurados.append(f.name)

    if not restaurados:
        return {"ok": False, "error": "No se encontraron archivos de planilla para restaurar en 'ultimo_backup'."}

    logger.info("Último backup restaurado hacia Salida: %s", restaurados)
    return {
        "ok": True,
        "archivos_restaurados": restaurados,
    }


def archivar_base_actual(config: Config, etiqueta: str = "") -> dict[str, Any]:
    """Caso 2: Archiva la base actual (staging.sqlite y exportaciones) para
    permitir iniciar una base fresca independiente para un nuevo directorio.
    Mueve los archivos a 'Data/Backups/bases_archivadas/base_{etiqueta}_{timestamp}/'
    de forma casi instantánea y segura.
    """
    carpeta_backups = _obtener_carpeta_backups(config)
    ahora = datetime.now(timezone.utc)
    estampa = ahora.strftime("%Y%m%d_%H%M%S")
    sufijo = f"_{etiqueta.strip()}" if etiqueta.strip() else ""
    carpeta_archivo = carpeta_backups / "bases_archivadas" / f"base{sufijo}_{estampa}"
    carpeta_archivo.mkdir(parents=True, exist_ok=True)

    salida_dir = config.rutas.carpeta_salida
    archivos_movidos: list[str] = []

    # Copiar primero al último backup de seguridad
    hacer_backup_previo(config, motivo="antes_de_archivar")

    # Mover archivos de salida y base sqlite
    for f in salida_dir.iterdir():
        if f.is_file():
            dest = carpeta_archivo / f.name
            try:
                shutil.move(str(f), str(dest))
                archivos_movidos.append(f.name)
            except Exception as e:
                logger.warning("No se pudo mover %s a archivo: %s", f.name, e)

    # Si base_sqlite no estaba en salida_dir, moverla también
    db_file = config.rutas.base_sqlite
    if db_file.exists() and db_file.parent != salida_dir:
        dest = carpeta_archivo / db_file.name
        try:
            shutil.move(str(db_file), str(dest))
            archivos_movidos.append(db_file.name)
        except Exception as e:
            logger.warning("No se pudo mover %s a archivo: %s", db_file.name, e)

    manifiesto = {
        "etiqueta": etiqueta or "base_archivada",
        "archivado_en": ahora.isoformat(),
        "archivos": archivos_movidos,
    }
    (carpeta_archivo / "manifiesto.json").write_text(
        json.dumps(manifiesto, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    logger.info("Base archivada en %s con %d archivos", carpeta_archivo, len(archivos_movidos))
    return {
        "ok": True,
        "carpeta_archivo": str(carpeta_archivo),
        "nombre_carpeta": carpeta_archivo.name,
        "archivos_movidos": archivos_movidos,
        "fecha": ahora.strftime("%d/%m/%Y %H:%M:%S"),
    }


def listar_bases_archivadas(config: Config) -> list[dict[str, Any]]:
    """Lista las bases archivadas disponibles para consultar o restaurar."""
    carpeta_bases = _obtener_carpeta_backups(config) / "bases_archivadas"
    if not carpeta_bases.exists():
        return []

    resultado = []
    for d in sorted(carpeta_bases.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if d.is_dir():
            manifiesto_file = d / "manifiesto.json"
            meta = {}
            if manifiesto_file.exists():
                try:
                    meta = json.loads(manifiesto_file.read_text(encoding="utf-8"))
                except Exception:
                    pass
            mtime = datetime.fromtimestamp(d.stat().st_mtime, tz=timezone.utc)
            resultado.append({
                "nombre": d.name,
                "ruta": str(d),
                "etiqueta": meta.get("etiqueta", d.name),
                "fecha": mtime.strftime("%d/%m/%Y %H:%M"),
                "archivos": meta.get("archivos", [f.name for f in d.glob("*.*")]),
            })
    return resultado


def restaurar_base_archivada(config: Config, nombre_carpeta: str) -> dict[str, Any]:
    """Restaura una base archivada previamente como la base activa en Data/Salida/."""
    carpeta_bases = _obtener_carpeta_backups(config) / "bases_archivadas"
    origen_dir = carpeta_bases / nombre_carpeta
    if not origen_dir.exists() or not origen_dir.is_dir():
        return {"ok": False, "error": f"No se encontró la base archivada '{nombre_carpeta}'"}

    # Resguardar la actual antes de sobreescribir
    hacer_backup_previo(config, motivo="antes_de_restaurar")

    salida_dir = config.rutas.carpeta_salida
    salida_dir.mkdir(parents=True, exist_ok=True)

    restaurados = []
    db_file = config.rutas.base_sqlite
    for f in origen_dir.iterdir():
        if f.is_file() and f.name != "manifiesto.json":
            if f.name == db_file.name and db_file.parent != salida_dir:
                dest = db_file
            else:
                dest = salida_dir / f.name
            shutil.copy2(str(f), str(dest))
            restaurados.append(f.name)

    return {
        "ok": True,
        "base_restaurada": nombre_carpeta,
        "archivos_restaurados": restaurados,
    }

