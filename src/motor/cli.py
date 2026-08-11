"""CLI del motor de consolidación de contactos.

Uso:
    python -m motor.cli panel            # abre el panel web (dashboard con botones) en el navegador — EMPEZAR ACÁ
    python -m motor.cli extraer
    python -m motor.cli normalizar
    python -m motor.cli deduplicar
    python -m motor.cli exportar
    python -m motor.cli run              # las cuatro anteriores en orden
    python -m motor.cli deshacer <cluster_id>
    python -m motor.cli deshacer-ultima-corrida

"panel" y "revisar" son el mismo servidor web (dashboard en "/", cola de
revisión en "/revisar") — "panel" abre el navegador solo, "revisar" no.
"""

from __future__ import annotations

import sys

from dotenv import load_dotenv

from motor.config import cargar_config
from motor.dedup.merge_engine import deduplicar_todo
from motor.dedup.merge_engine import deshacer as deshacer_cluster
from motor.dedup.merge_engine import deshacer_ultima_corrida
from motor.export import exportar_lista_maestra
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
    config = cargar_config("config.yaml")
    _configurar_tesseract(config)
    conn = conectar(config.rutas.base_sqlite)

    try:
        if comando == "extraer":
            print(f"raw_records nuevos: {extraer_todo(config, conn)}")
        elif comando == "normalizar":
            print(f"normalized_records nuevos: {normalizar_todo(config, conn)}")
        elif comando == "deduplicar":
            print(f"deduplicación: {deduplicar_todo(config, conn)}")
        elif comando == "exportar":
            print(f"exportado: {exportar_lista_maestra(config, conn)}")
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
