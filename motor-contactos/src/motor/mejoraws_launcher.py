"""Lanza MejoraWS (proyecto hermano Electron+React+Baileys que maneja el
envío de WhatsApp, `C:\\Github\\Herramientas\\MejoraWS`) como un módulo
accesible desde el panel de motor-contactos, en vez de que el usuario
tenga que ir a buscarlo a mano en el Explorador.

Por qué no se reimplementa el envío de WhatsApp acá adentro: son dos
stacks completamente distintos (Python/Flask vs Node/Electron/Baileys) y
la automatización de WhatsApp ya tiene riesgo real de ban de cuenta si se
hace mal (ver MejoraWS/README.md -- delay random y tope diario a
propósito). Duplicar esa lógica en este proyecto sería repetir trabajo ya
hecho y afinado, con más superficie de riesgo, no menos. Este módulo se
limita a abrir la app ya existente."""

from __future__ import annotations

import subprocess
from pathlib import Path

_NOMBRE_LANZADOR = "Iniciar MejoraContacto.bat"


class MejoraWsNoEncontradoError(RuntimeError):
    pass


def abrir_mejoraws(ruta: Path) -> None:
    """Lanza el .bat de MejoraWS en su propia ventana, sin bloquear -- a
    diferencia de las otras acciones del panel, esto abre una app de
    escritorio de larga duración (Electron + la sesión de WhatsApp quedan
    corriendo indefinidamente), así que esperar a que termine no tiene
    sentido. `start` (vía cmd.exe) desprende el proceso del panel; el
    primer argumento "" después de `start` es el título de la ventana
    -- hace falta explícito porque la ruta entre comillas, si no,
    `start` la interpreta a ELLA como el título."""
    lanzador = ruta / _NOMBRE_LANZADOR
    if not lanzador.exists():
        raise MejoraWsNoEncontradoError(
            f"No se encontró '{lanzador}'. ¿Se movió o renombró la carpeta de MejoraWS? "
            "Ajustá mejoraws.ruta en config.yaml si es así."
        )
    subprocess.Popen(["cmd.exe", "/c", "start", "", str(lanzador)], cwd=str(ruta))
