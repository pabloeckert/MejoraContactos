"""App de escritorio real: la UI React compilada (`ui/dist/`, ya con la
identidad de marca Mejora Continua) servida por el mismo Flask que ya usa
la API JSON, envuelta en una ventana nativa de Windows vía `pywebview` —
sin pestaña de navegador, sin URL visible, sin consola.

No reemplaza el panel HTML clásico (`reviewer_app.py`, `motor.cli panel`)
ni la API en modo desarrollo (`motor.cli revisar` + `npm run dev` en
`ui/`) — es un tercer modo de arrancar, pensado para uso diario una vez
que la UI está construida y no hace falta iterar sobre su código.

Requiere `ui/dist/` ya compilado (`npm run build` en `ui/`) — si no
existe, se avisa con un mensaje claro en vez de una ventana en blanco."""

from __future__ import annotations

import sqlite3
import sys
import threading
from pathlib import Path

from flask import Flask, send_from_directory

from motor.api import registrar_rutas_api
from motor.config import Config
from motor.staging_db import conectar


def _raiz_datos() -> Path:
    """En un .exe de PyInstaller (onedir), los datos agregados con
    --add-data quedan en sys._MEIPASS (una carpeta "_internal" al lado del
    ejecutable) -- no relativo a este archivo .py, que vive empaquetado
    dentro del .pyz. Corriendo desde código fuente (venv normal), es la
    raíz del repo (tres niveles arriba de este archivo)."""
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass)
    return Path(__file__).resolve().parent.parent.parent


_RUTA_DIST = _raiz_datos() / "ui" / "dist"
_RUTA_ICONO = _raiz_datos() / "assets" / "icono.ico"


def crear_app_escritorio(config: Config, conn: sqlite3.Connection) -> Flask:
    app = Flask(__name__, static_folder=None)
    registrar_rutas_api(app, config, conn)

    @app.get("/")
    @app.get("/<path:ruta>")
    def servir_ui(ruta: str = ""):
        # SPA de una sola página (sin react-router) -- cualquier ruta que
        # no sea un archivo real de dist/ cae al index.html.
        candidato = _RUTA_DIST / ruta
        if ruta and candidato.is_file():
            return send_from_directory(_RUTA_DIST, ruta)
        return send_from_directory(_RUTA_DIST, "index.html")

    return app


def iniciar_escritorio(config: Config) -> None:
    if not (_RUTA_DIST / "index.html").exists():
        print(
            "Falta ui/dist/ (la UI compilada). Corré 'npm run build' dentro de "
            "motor-contactos/ui/ antes de usar este modo -- ver README."
        )
        return

    import webview

    puerto = config.revisor.puerto

    def _correr_servidor() -> None:
        # La conexión sqlite se crea ACÁ ADENTRO a propósito, no se recibe
        # como parámetro: sqlite3 no es thread-safe entre hilos distintos
        # del que la creó (check_same_thread=True default), y Flask sirve
        # los requests desde ESTE hilo de background (webview.start() abajo
        # necesita el hilo principal para la ventana nativa en Windows).
        # Crearla en el hilo principal y pasarla acá rompía con
        # "SQLite objects created in a thread can only be used in that
        # same thread" en cualquier request real -- mismo bug que ya se
        # había encontrado y arreglado en el panel clásico (cli.py, threaded=False).
        conn = conectar(config.rutas.base_sqlite)
        app = crear_app_escritorio(config, conn)
        app.run(port=puerto, threaded=False, use_reloader=False)

    hilo = threading.Thread(target=_correr_servidor, daemon=True)
    hilo.start()

    webview.create_window(
        "motor-contactos — Mejora Continua",
        f"http://127.0.0.1:{puerto}/",
        width=1280,
        height=800,
        min_size=(960, 600),
    )
    webview.start(icon=str(_RUTA_ICONO) if _RUTA_ICONO.exists() else None)
