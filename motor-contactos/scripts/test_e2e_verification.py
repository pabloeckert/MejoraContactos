"""
Script de Verificación End-to-End (E2E) para MejoraContactos
Prueba el flujo completo del sistema desde una base limpia:
1. Creación de lote de prueba realista (CSV + VCF con números argentinos variados y duplicados intencionales).
2. Procesamiento a través de la cola de carpetas (/accion/actualizar-y-respaldar).
3. Monitoreo de telemetría (/api/progreso-estado).
4. Verificación de estadísticas de base de datos (/api/stats).
5. Verificación de integridad de lista-maestra.xlsx (openpyxl).
6. Verificación de integridad de contactos-whatsapp.csv.
7. Verificación del botón/acción de reseteo a cero (/accion/resetear-base).
8. Limpieza de directorios temporales de prueba.
"""

import json
import shutil
import time
import urllib.parse
import urllib.request
from pathlib import Path
import openpyxl

BASE_URL = "http://127.0.0.1:5000"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DIR_PRUEBA = REPO_ROOT / "Data" / "Pruebas_E2E" / "Lote_Empresa_A"
SALIDA_DIR = REPO_ROOT / "Data" / "Salida"
BACKUPS_DIR = REPO_ROOT / "Data" / "Backups"


def _http_get(endpoint: str) -> dict:
    req = urllib.request.Request(f"{BASE_URL}{endpoint}")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _http_post(endpoint: str, data: dict) -> int:
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", data=encoded, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status


def crear_archivos_prueba():
    DIR_PRUEBA.mkdir(parents=True, exist_ok=True)
    
    # 1. Archivo CSV con 3 contactos (uno con celular local 15, otro sin +549, otro estándar)
    csv_content = (
        "Nombre,Telefono,Email,Empresa\n"
        "Carlos Benitez,+54 9 376 450-1122,carlos.b@empresa.com,Empresa Alfa\n"
        "Maria Fernandez,3764889900,maria@gmail.com,Estudio Contable\n"
        "Juan Perez,15-420-3344,juan.p@yahoo.com.ar,Comercio Local\n"
    )
    (DIR_PRUEBA / "clientes.csv").write_text(csv_content, encoding="utf-8")

    # 2. Archivo VCF con 2 contactos:
    # Uno es duplicado de Carlos Benitez (mismo teléfono y nombre para probar deduplicación)
    # El otro es Romina Duarte (nuevo)
    vcf_content = (
        "BEGIN:VCARD\n"
        "VERSION:3.0\n"
        "FN:Carlos Benitez\n"
        "TEL;TYPE=CELL:3764501122\n"
        "EMAIL:carlos.benitez@empresa.com\n"
        "ORG:Empresa Alfa\n"
        "END:VCARD\n"
        "BEGIN:VCARD\n"
        "VERSION:3.0\n"
        "FN:Romina Duarte\n"
        "TEL;TYPE=CELL:+5493743556677\n"
        "EMAIL:romina@duarte.com\n"
        "ORG:Logistica SA\n"
        "END:VCARD\n"
    )
    (DIR_PRUEBA / "tarjetas.vcf").write_text(vcf_content, encoding="utf-8")
    print(f"✓ Archivos de prueba creados en: {DIR_PRUEBA}")


def ejecutar_e2e():
    print("\n=======================================================")
    print("🚀 INICIANDO PRUEBA END-TO-END (E2E) EN MEJORACONTACTOS")
    print("=======================================================\n")

    # Paso 1: Verificar que el servidor esté activo y resetear si no está en cero
    print("1. Verificando disponibilidad del servidor en puerto 5000...")
    stats_iniciales = _http_get("/api/stats")
    print(f"   Estado inicial: {stats_iniciales}")
    if stats_iniciales["raw_records"] > 0:
        print("   Limpiando base antes de iniciar...")
        _http_post("/accion/resetear-base", {})
        stats_iniciales = _http_get("/api/stats")
        print(f"   Estado tras limpieza previa: {stats_iniciales}")
    assert stats_iniciales["raw_records"] == 0, "La base inicial debe estar limpia (0 crudos)"
    print("   ✓ Servidor respondiendo con base de datos limpia.")

    # Paso 2: Crear lote de prueba
    print("\n2. Generando lote de prueba en disco...")
    crear_archivos_prueba()

    # Paso 3: Encolar carpeta y procesar
    print("\n3. Enviando cola de carpetas a /accion/actualizar-y-respaldar...")
    cola = [str(DIR_PRUEBA.resolve())]
    status_code = _http_post("/accion/actualizar-y-respaldar", {"cola_carpetas": json.dumps(cola)})
    print(f"   Respuesta HTTP: {status_code}")
    assert status_code == 200, f"Código inesperado: {status_code}"

    # Paso 4: Monitorear progreso
    print("\n4. Consultando telemetría del proceso en vivo...")
    for _ in range(30):
        prog = _http_get("/api/progreso-estado")
        if not prog.get("activo"):
            break
        print(f"   En progreso: {prog.get('progreso_pct')}% — {prog.get('etapa_nombre')}")
        time.sleep(1)

    print(f"   Resultado telemetría: Éxito={prog.get('exito')}")
    print(f"   Mensaje: {prog.get('mensaje')}")
    assert prog.get("exito") is True, f"Error en telemetría: {prog.get('error')}"
    print("   ✓ Telemetría completada al 100% con éxito.")

    # Paso 5: Verificar estadísticas en la base de datos
    print("\n5. Validando estadísticas consolidadas en base de datos...")
    stats_finales = _http_get("/api/stats")
    print(f"   Estadísticas finales: {stats_finales}")
    # Se extrajeron 3 del CSV + 2 del VCF = 5 crudos
    assert stats_finales["raw_records"] == 5, f"Esperado 5 crudos, obtenido {stats_finales['raw_records']}"
    assert stats_finales["normalized_records"] == 5, f"Esperado 5 normalizados, obtenido {stats_finales['normalized_records']}"
    # Debería haber 4 contactos finales únicos (Carlos Benitez unificado)
    assert stats_finales["contactos_finales"] == 4, f"Esperado 4 contactos finales únicos, obtenido {stats_finales['contactos_finales']}"
    print("   ✓ Base de datos: 5 registros procesados y deduplicados correctamente a 4 únicos.")

    # Paso 6: Validar Excel lista-maestra.xlsx
    print("\n6. Validando archivo Excel generado (lista-maestra.xlsx)...")
    excel_path = SALIDA_DIR / "lista-maestra.xlsx"
    assert excel_path.exists(), "lista-maestra.xlsx no fue generado"
    wb = openpyxl.load_workbook(excel_path)
    sheet = wb.active
    rows = list(sheet.iter_rows(values_only=True))
    header = rows[0]
    data_rows = rows[1:]
    print(f"   Columnas del Excel ({len(header)}): {header[:5]}...")
    print(f"   Filas de contactos en Excel: {len(data_rows)}")
    assert len(data_rows) == 4, f"Se esperaban 4 filas en Excel, se obtuvieron {len(data_rows)}"
    
    # Validar formato E.164 de los teléfonos en el Excel (+549...)
    idx_tel = header.index("WhatsApp")
    telefonos_excel = [r[idx_tel] for r in data_rows if r[idx_tel]]
    print(f"   Teléfonos normalizados E.164 en Excel: {telefonos_excel}")
    for t in telefonos_excel:
        assert str(t).startswith("+549"), f"El teléfono {t} no tiene formato internacional E.164 +549"
    print("   ✓ Excel verificado: 4 contactos únicos con formato 100% E.164.")

    # Paso 7: Validar CSV contactos-whatsapp.csv
    print("\n7. Validando archivo CSV para WhatsApp (contactos-whatsapp.csv)...")
    wa_path = SALIDA_DIR / "contactos-whatsapp.csv"
    assert wa_path.exists(), "contactos-whatsapp.csv no fue generado"
    wa_lines = [l.strip() for l in wa_path.read_text(encoding="utf-8").splitlines() if l.strip()]
    print(f"   Encabezado CSV: {wa_lines[0]}")
    assert wa_lines[0].lower().startswith("nombre,telefono")
    contactos_wa = wa_lines[1:]
    print(f"   Contactos listos para WhatsApp ({len(contactos_wa)}):")
    for c in contactos_wa:
        print(f"     • {c}")
    assert len(contactos_wa) == 3, f"Se esperaban 3 contactos con WhatsApp válido en CSV, hay {len(contactos_wa)}"
    print("   ✓ CSV verificado: 3 contactos con WhatsApp válido exportados para MejoraWS (Juan Perez con '15-420-3344' se preserva en Excel pero se protege de envíos inválidos).")

    # Paso 8: Probar botón de reseteo a cero
    print("\n8. Probando acción de reseteo a cero (/accion/resetear-base)...")
    status_reset = _http_post("/accion/resetear-base", {})
    assert status_reset == 200, f"Error al resetear: {status_reset}"
    stats_post_reset = _http_get("/api/stats")
    print(f"   Estadísticas post-reseteo: {stats_post_reset}")
    assert stats_post_reset["raw_records"] == 0
    assert stats_post_reset["normalized_records"] == 0
    assert stats_post_reset["contactos_finales"] == 0
    assert not excel_path.exists(), "lista-maestra.xlsx debería haberse limpiado"
    assert not wa_path.exists(), "contactos-whatsapp.csv debería haberse limpiado"
    print("   ✓ Reseteo comprobado: todas las tablas y planillas quedaron en cero.")

    # Paso 9: Limpiar archivos temporales de prueba
    print("\n9. Higienizando entorno y removiendo archivos de prueba temporales...")
    if DIR_PRUEBA.parent.exists():
        shutil.rmtree(DIR_PRUEBA.parent)
    print("   ✓ Directorio Data/Pruebas_E2E/ eliminado.")

    print("\n=======================================================")
    print("🎉 PRUEBA END-TO-END COMPLETADA CON 100% DE ÉXITO")
    print("   Todo el sistema está higienizado, verificado y listo.")
    print("=======================================================\n")


if __name__ == "__main__":
    ejecutar_e2e()
