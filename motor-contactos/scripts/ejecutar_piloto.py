"""Script de ejecución autónoma del Piloto Controlado con datos reales.
Fase 5 del Plan Maestro de Saneamiento.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Agregar src al sys.path
BASE_DIR = Path(__file__).resolve().parent.parent / "motor-contactos"
sys.path.insert(0, str(BASE_DIR / "src"))

from motor.config import cargar_config, RutasConfig, Config
from motor.dedup.merge_engine import deduplicar_todo
from motor.export import (
    exportar_contactos_finales_json,
    exportar_lista_maestra,
    exportar_whatsapp_csv,
    _materializar_clusters,
)
from motor.google_contacts_source import importar_google_contactos, obtener_credenciales
from motor.normalize_pipeline import normalizar_todo
from motor.staging_db import conectar
from motor.sync.backup import crear_snapshot_historico
from motor.sync.google_sync import sincronizar_hacia_google
from googleapiclient.discovery import build


def ejecutar_piloto(cuenta: str = "pablo", limite_contactos: int = 150) -> dict:
    print("=" * 70)
    print(f"  EJECUTANDO PILOTO CONTROLADO CON DATOS REALES (Cuenta: {cuenta.upper()})")
    print("=" * 70)

    config_base = cargar_config(BASE_DIR / "config.yaml")

    # Rutas para el piloto
    db_piloto_path = BASE_DIR.parent / "Data" / "Salida" / "staging_piloto.sqlite"
    if db_piloto_path.exists():
        try:
            db_piloto_path.unlink()
        except Exception:
            pass

    config_piloto = Config(
        rutas=RutasConfig(
            carpeta_raiz=config_base.rutas.carpeta_raiz,
            carpeta_salida=config_base.rutas.carpeta_salida,
            base_sqlite=db_piloto_path,
        ),
        extensiones_permitidas=config_base.extensiones_permitidas,
        telefono=config_base.telefono,
        email=config_base.email,
        dedup=config_base.dedup,
        llm=config_base.llm,
        revisor=config_base.revisor,
        ocr=config_base.ocr,
        google=config_base.google,
        mejoraws=config_base.mejoraws,
    )

    conn = conectar(db_piloto_path)

    # -------------------------------------------------------------
    # PASO 1: BACKUP INMUTABLE PREVIO DE GOOGLE CONTACTS
    # -------------------------------------------------------------
    print("\n[PASO 1/6] Respaldando estado actual de Google Contacts...")
    t0_backup = time.time()
    creds = obtener_credenciales(cuenta)
    service = build("people", "v1", credentials=creds)

    contactos_google_raw = []
    token_pag = None
    while True:
        req = service.people().connections().list(
            resourceName="people/me",
            pageSize=1000,
            personFields="names,phoneNumbers,emailAddresses,organizations,addresses,biographies,photos,metadata",
            pageToken=token_pag,
        )
        res = req.execute()
        contactos_google_raw.extend(res.get("connections", []))
        token_pag = res.get("nextPageToken")
        if not token_pag or len(contactos_google_raw) >= 1000:
            break

    backup_dir = BASE_DIR.parent / "Data" / "Backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    estampa = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_google_file = backup_dir / f"google_contacts_{cuenta}_pre_piloto_{estampa}.json"
    with backup_google_file.open("w", encoding="utf-8") as f:
        json.dump(contactos_google_raw, f, ensure_ascii=False, indent=2)

    duracion_backup = time.time() - t0_backup
    print(f"  [OK] Snapshot de {len(contactos_google_raw)} contactos guardado en:")
    print(f"       {backup_google_file.name} ({duracion_backup:.2f}s)")

    # -------------------------------------------------------------
    # PASO 2: INGESTA CONTROLADA (LOTE PILOTO DE CONTACTOS REALES)
    # -------------------------------------------------------------
    print(f"\n[PASO 2/6] Importando lote piloto real de {limite_contactos} contactos desde Google...")
    t0_ingest = time.time()
    insertados = importar_google_contactos(config_piloto, conn, cuenta, limite_maximo=limite_contactos)
    duracion_ingest = time.time() - t0_ingest
    print(f"  [OK] Registros crudos insertados en staging_piloto: {insertados} ({duracion_ingest:.2f}s)")

    # -------------------------------------------------------------
    # PASO 3: NORMALIZACIÓN Y LIMPIEZA DETERMINISTA
    # -------------------------------------------------------------
    print("\n[PASO 3/6] Normalizando teléfonos (E.164), emails y clasificando identidades...")
    t0_norm = time.time()
    normalizados = normalizar_todo(config_piloto, conn)
    duracion_norm = time.time() - t0_norm
    print(f"  [OK] Registros normalizados: {normalizados} ({duracion_norm:.2f}s)")

    # -------------------------------------------------------------
    # PASO 4: DEDUPLICACIÓN Y MEDICIÓN DE ZONA GRIS
    # -------------------------------------------------------------
    print("\n[PASO 4/6] Deduplicando con scoring protegido y midiendo 'zona gris'...")
    t0_dedup = time.time()
    res_dedup = deduplicar_todo(config_piloto, conn)
    duracion_dedup = time.time() - t0_dedup

    # Medir casos en la base
    cur = conn.cursor()
    total_clusters = cur.execute("SELECT COUNT(DISTINCT cluster_id) FROM clusters").fetchone()[0]
    total_personas = cur.execute("SELECT COUNT(DISTINCT persona_id) FROM clusters WHERE persona_id IS NOT NULL").fetchone()[0]
    fusiones_regla = res_dedup.get("regla", 0)
    zona_gris_llm = res_dedup.get("llm", 0)
    pendientes_humano = res_dedup.get("pendiente", 0)

    print(f"  [OK] Deduplicación finalizada ({duracion_dedup:.2f}s):")
    print(f"       * Fusiones directas por regla: {fusiones_regla}")
    print(f"       * Casos en zona gris consultados al LLM: {zona_gris_llm}")
    print(f"       * Casos pendientes de decisión humana: {pendientes_humano}")
    print(f"       * Total clusters unificados: {total_clusters}")
    print(f"       * Total identidades canónicas únicas (persona_id): {total_personas}")

    # Costo estimado de IA
    costo_ia_usd = 0.0
    if zona_gris_llm > 0:
        costo_in = (zona_gris_llm * 400 / 1_000_000) * 3.0
        costo_out = (zona_gris_llm * 60 / 1_000_000) * 15.0
        costo_ia_usd = costo_in + costo_out
    print(f"       * Costo estimado IA (Anthropic): ${costo_ia_usd:.4f} USD")

    # -------------------------------------------------------------
    # PASO 5: GENERACIÓN DE ARTEFACTOS Y SALIDAS
    # -------------------------------------------------------------
    print("\n[PASO 5/6] Generando listas maestras y JSON para Supabase...")
    t0_export = time.time()
    ruta_xlsx = exportar_lista_maestra(config_piloto, conn)
    ruta_wa = exportar_whatsapp_csv(config_piloto, conn, con_prefijo_mas=True)
    ruta_json = exportar_contactos_finales_json(config_piloto, conn)
    duracion_export = time.time() - t0_export

    print(f"  [OK] Lista Maestra XLSX: {ruta_xlsx.name} ({duracion_export:.2f}s)")
    print(f"  [OK] WhatsApp CSV: {ruta_wa.name}")
    print(f"  [OK] Supabase JSON: {ruta_json.name}")

    # -------------------------------------------------------------
    # PASO 6: SIMULACIÓN DRY-RUN DE SINCRONIZACIÓN A GOOGLE
    # -------------------------------------------------------------
    print("\n[PASO 6/6] Simulando sincronización hacia Google Contacts (DRY RUN seguro)...")
    t0_sync = time.time()
    res_sync = sincronizar_hacia_google(cuenta, config_piloto, conn=conn, dry_run=True)
    duracion_sync = time.time() - t0_sync

    print(f"  [OK] Simulación Dry-Run ({duracion_sync:.2f}s):")
    print(f"       * Altas estimadas en Google: {len(res_sync.get('altas', []))}")
    print(f"       * Modificaciones estimadas en Google: {len(res_sync.get('modificaciones', []))}")
    print(f"       * Contactos sin cambios en Google: {res_sync.get('sin_cambios', 0)}")

    tiempo_total = time.time() - t0_backup

    resumen = {
        "cuenta": cuenta,
        "lote_crudos_procesados": insertados,
        "registros_normalizados": normalizados,
        "identidades_unicas_consolidadas": total_personas,
        "fusiones_deterministas": fusiones_regla,
        "casos_zona_gris": zona_gris_llm + pendientes_humano,
        "costo_ia_usd": costo_ia_usd,
        "duracion_total_segundos": round(tiempo_total, 2),
        "backup_google_file": str(backup_google_file),
        "sync_preview": {
            "altas": len(res_sync.get("altas", [])),
            "modificaciones": len(res_sync.get("modificaciones", [])),
            "sin_cambios": res_sync.get("sin_cambios", 0),
        },
    }

    print("\n" + "=" * 70)
    print(f"  PILOTO COMPLETADO EXITOSAMENTE EN {tiempo_total:.2f} SEGUNDOS")
    print("=" * 70)
    return resumen


if __name__ == "__main__":
    cuenta_sel = sys.argv[1] if len(sys.argv) > 1 else "pablo"
    limite = int(sys.argv[2]) if len(sys.argv) > 2 else 150
    resultado = ejecutar_piloto(cuenta=cuenta_sel, limite_contactos=limite)
