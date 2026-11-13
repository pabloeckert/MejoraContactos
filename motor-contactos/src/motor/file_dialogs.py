"""Diálogos nativos de Windows para elegir carpeta/archivo desde el panel
web -- sin agregar tkinter ni ninguna dependencia nueva a pyproject: se
invoca powershell.exe con System.Windows.Forms (.NET, viene con Windows),
mismo criterio que ya usa este proyecto para todo lo Windows-específico
(ver token_crypto.py, DPAPI vía ctypes puro).

Por qué no un <input type="file"> HTML común: un input de archivo en el
navegador da bytes/nombres, nunca la ruta absoluta real en disco -- y acá
Flask corre en la MISMA máquina que el usuario, así que lo que hace falta
es la ruta real para caminarla/leerla server-side (carpetas enteras,
recursivo), no subir el contenido por HTTP.

Bloqueante a propósito: un solo usuario local, el panel ya bloquea en
otras acciones similares (correr el pipeline, etc. -- ver
reviewer_app.py)."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

_TIMEOUT_SEGUNDOS = 120  # 2 minutos para elegir


def elegir_carpeta(titulo: str = "Elegí una carpeta para importar") -> Path | None:
    """Devuelve la carpeta elegida, o None si el usuario canceló el diálogo."""
    # 1. Intentar diálogo nativo rápido con Tkinter en subproceso limpio
    script_tk = (
        "import os, sys, tkinter as tk\n"
        "from tkinter import filedialog\n"
        "try:\n"
        "    root = tk.Tk()\n"
        "    root.withdraw()\n"
        "    root.attributes('-topmost', True)\n"
        "    root.focus_force()\n"
        f"    ruta = filedialog.askdirectory(title={repr(titulo)})\n"
        "    root.destroy()\n"
        "    if ruta and str(ruta).strip():\n"
        "        sys.stdout.write(os.path.normpath(os.path.abspath(ruta.strip())))\n"
        "except Exception:\n"
        "    pass\n"
    )
    try:
        res = subprocess.run(
            [sys.executable, "-c", script_tk],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SEGUNDOS,
        )
        ruta = res.stdout.strip()
        if ruta:
            return Path(ruta).resolve()
    except Exception as exc:
        logger.debug("Fallo tkinter para carpeta: %s", exc)

    # 2. Fallback PowerShell interactivo (sin -NonInteractive para permitir GUI)
    script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialogo = New-Object System.Windows.Forms.FolderBrowserDialog
$dialogo.Description = "{_escapar(titulo)}"
if ($dialogo.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialogo.SelectedPath
}}
"""
    ruta = _ejecutar_dialogo(script)
    return Path(ruta).resolve() if ruta else None


def elegir_archivo(titulo: str = "Elegí un archivo para importar") -> Path | None:
    """Devuelve el archivo elegido, o None si el usuario canceló."""
    # 1. Intentar diálogo nativo rápido con Tkinter en subproceso limpio
    script_tk = (
        "import os, sys, tkinter as tk\n"
        "from tkinter import filedialog\n"
        "try:\n"
        "    root = tk.Tk()\n"
        "    root.withdraw()\n"
        "    root.attributes('-topmost', True)\n"
        "    root.focus_force()\n"
        f"    ruta = filedialog.askopenfilename(title={repr(titulo)})\n"
        "    root.destroy()\n"
        "    if ruta and str(ruta).strip():\n"
        "        sys.stdout.write(os.path.normpath(os.path.abspath(ruta.strip())))\n"
        "except Exception:\n"
        "    pass\n"
    )
    try:
        res = subprocess.run(
            [sys.executable, "-c", script_tk],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SEGUNDOS,
        )
        ruta = res.stdout.strip()
        if ruta:
            return Path(ruta).resolve()
    except Exception as exc:
        logger.debug("Fallo tkinter para archivo: %s", exc)

    # 2. Fallback PowerShell interactivo (sin -NonInteractive para permitir GUI)
    script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialogo = New-Object System.Windows.Forms.OpenFileDialog
$dialogo.Title = "{_escapar(titulo)}"
$dialogo.Filter = "Todos los archivos (*.*)|*.*"
$dialogo.Multiselect = $false
if ($dialogo.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialogo.FileName
}}
"""
    ruta = _ejecutar_dialogo(script)
    return Path(ruta).resolve() if ruta else None


def _escapar(texto: str) -> str:
    return texto.replace('"', '`"')


def _ejecutar_dialogo(script: str) -> str:
    try:
        resultado = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Sta", "-Command", script],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SEGUNDOS,
        )
        return resultado.stdout.strip()
    except Exception as exc:
        logger.warning("Error ejecutando diálogo powershell: %s", exc)
        return ""
