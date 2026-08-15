"""CLI del motor de consolidación de contactos.

Uso:
    python -m motor.cli panel            # abre el panel web (dashboard con botones) en el navegador — EMPEZAR ACÁ
    python -m motor.cli importar-google <cuenta>  # trae contactos en vivo desde Google Contacts (ver GOOGLE_SETUP.md)
    python -m motor.cli importar-otros-contactos <cuenta>  # gente con la que hubo mail pero no está guardada como contacto (pide login aparte, scope distinto)
    python -m motor.cli extraer
    python -m motor.cli normalizar
    python -m motor.cli deduplicar
    python -m motor.cli exportar
    python -m motor.cli run              # extraer + normalizar + deduplicar + exportar, en orden (NO incluye importar-google)
    python -m motor.cli deshacer <cluster_id>
    python -m motor.cli deshacer-ultima-corrida

"panel" y "revisar" son el mismo servidor web (dashboard en "/", cola de
revisión en "/revisar") — "panel" abre el navegador solo, "revisar" no.

"importar-google" pide login la primera vez que se corre para cada cuenta
(abre el navegador) — corridas siguientes reusan el token guardado sin
pedir login de nuevo, salvo que el token se revoque o expire.
"""

from __future__ import annotations

import sys

from dotenv import load_dotenv

from motor.config import cargar_config
from motor.dedup.merge_engine import deduplicar_todo
from motor.dedup.merge_engine import deshacer as deshacer_cluster
from motor.dedup.merge_engine import deshacer_ultima_corrida
from motor.export import exportar_lista_maestra, exportar_whatsapp_csv
from motor.ingest import extraer_todo
from motor.normalize_pipeline import normalizar_todo
from motor.staging_db import conectar


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print(__doc__)
        return 1

    comando = argv[0]
    config = cargar_config(_ruta_config_real())
    _configurar_tesseract(config)
    conn = conectar(config.rutas.base_sqlite)

    try:
        if comando == "importar-google":
            if len(argv) < 2:
                print("uso: importar-google <cuenta>  (cuentas configuradas: " f"{', '.join(config.google.cuentas) or '(ninguna en config.yaml)'})")
                return 1
            from motor.google_contacts_source import CredencialesFaltantesError, importar_google_contactos

            try:
                print(f"raw_records nuevos desde Google ({argv[1]}): {importar_google_contactos(config, conn, argv[1])}")
            except CredencialesFaltantesError as exc:
                print(f"error: {exc}")
                return 1
        elif comando == "importar-otros-contactos":
            if len(argv) < 2:
                print("uso: importar-otros-contactos <cuenta>  -- gente con la que hubo mail pero nunca se guardó como contacto")
                return 1
            from motor.google_contacts_source import CredencialesFaltantesError, importar_otros_contactos

            try:
                print(f"raw_records nuevos (otros contactos, {argv[1]}): {importar_otros_contactos(config, conn, argv[1])}")
            except CredencialesFaltantesError as exc:
                print(f"error: {exc}")
                return 1
        elif comando == "extraer":
            print(f"raw_records nuevos: {extraer_todo(config, conn)}")
        elif comando == "normalizar":
            print(f"normalized_records nuevos: {normalizar_todo(config, conn)}")
        elif comando == "deduplicar":
            print(f"deduplicación: {deduplicar_todo(config, conn)}")
        elif comando == "exportar":
            print(f"exportado: {exportar_lista_maestra(config, conn)}")
        elif comando == "exportar-whatsapp":
            print(f"exportado (formato MejoraWS): {exportar_whatsapp_csv(config, conn)}")
        elif comando == "anomalias":
            from motor.anomalias import detectar_telefonos_sospechosos

            anomalias = detectar_telefonos_sospechosos(conn)
            if not anomalias:
                print("Sin anomalías: ningún teléfono aparece en más de 5 contactos finales distintos.")
            for a in anomalias:
                print(f"  {a['telefono']} — {a['cantidad']} contactos distintos: {', '.join(a['nombres'][:5])}" + (" ..." if a["cantidad"] > 5 else ""))
        elif comando == "run":
            print(f"raw_records nuevos: {extraer_todo(config, conn)}")
            print(f"normalized_records nuevos: {normalizar_todo(config, conn)}")
            print(f"deduplicación: {deduplicar_todo(config, conn)}")
            print(f"exportado: {exportar_lista_maestra(config, conn)}")
        elif comando in ("revisar", "panel"):
            from motor.reviewer_app import crear_app

            if comando == "panel":
                import threading
                import webbrowser

                url = f"http://127.0.0.1:{config.revisor.puerto}/"
                threading.Timer(1.0, lambda: webbrowser.open(url)).start()
                print(f"Abriendo {url} en el navegador...")

            # threaded=False a propósito: la conexión sqlite se crea una
            # sola vez acá arriba y se comparte entre requests — sqlite3
            # no es thread-safe por default (check_same_thread=True), así
            # que un request en otro hilo tira "SQLite objects created in
            # a thread can only be used in that same thread". Un solo
            # usuario en localhost no necesita concurrencia real.
            crear_app(config, conn).run(port=config.revisor.puerto, threaded=False)
        elif comando == "escritorio":
            # No usa la conexión `conn` de más abajo -- desktop_app.py crea
            # la suya propia dentro del hilo que sirve Flask (ver
            # comentario en iniciar_escritorio: sqlite3 no es thread-safe
            # entre hilos distintos del que la creó).
            from motor.desktop_app import iniciar_escritorio

            iniciar_escritorio(config)
        elif comando == "deshacer":
            if len(argv) < 2:
                print("uso: deshacer <cluster_id>")
                return 1
            print(f"raw_records revertidos: {deshacer_cluster(conn, argv[1])}")
        elif comando == "deshacer-ultima-corrida":
            print(f"deshacer última corrida: {deshacer_ultima_corrida(conn)}")
        else:
            print(f"comando desconocido: {comando}")
            return 1
    finally:
        conn.close()

    return 0


def _ruta_config_real() -> str:
    """"config.yaml" a secas asume que el proceso corre con cwd en
    motor-contactos/ (así lo usa siempre python -m motor.cli). El .exe
    empaquetado con PyInstaller NO puede depender de eso: `config.yaml`
    define rutas relativas a SÍ MISMO (../Data/Crudos, etc.) que apuntan a
    los datos reales del usuario -- si el .exe resolviera un config.yaml
    equivocado (ej. uno embebido en el bundle, en vez del real), el
    pipeline correría contra una carpeta Data/ vacía o distinta sin avisar,
    silenciosamente. Por eso NO se embebe config.yaml en el build
    (ver scripts/build_exe.ps1) y acá se busca hacia arriba desde la
    ubicación real del ejecutable hasta encontrar uno de verdad."""
    import sys
    from pathlib import Path

    if getattr(sys, "frozen", False):
        actual = Path(sys.executable).resolve().parent
        for _ in range(5):
            candidato = actual / "config.yaml"
            if candidato.exists():
                print(f"(usando config.yaml real en: {candidato})")
                return str(candidato)
            actual = actual.parent
        raise SystemExit(
            "No se encontró config.yaml real cerca del ejecutable. "
            "El .exe tiene que vivir dentro de motor-contactos/ (o una subcarpeta), "
            "al lado del config.yaml real -- no copiarlo suelto a otro lado."
        )
    return "config.yaml"


def _configurar_tesseract(config) -> None:
    """Si config.ocr.tesseract_cmd está seteado (el binario no quedó en el
    PATH del sistema), le avisa a pytesseract dónde buscarlo. Import local
    para no forzar la dependencia de Fase 3 en comandos que no la usan."""
    if not config.ocr.tesseract_cmd:
        return
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = config.ocr.tesseract_cmd


if __name__ == "__main__":
    raise SystemExit(main())
