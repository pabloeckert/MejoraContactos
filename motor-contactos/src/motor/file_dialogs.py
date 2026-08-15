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

import subprocess
from pathlib import Path

_TIMEOUT_SEGUNDOS = 300  # 5 minutos para elegir -- no cuelga para siempre si el usuario se distrae


def elegir_carpeta(titulo: str = "Elegí una carpeta para importar") -> Path | None:
    """Devuelve la carpeta elegida, o None si el usuario canceló el diálogo."""
    script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialogo = New-Object System.Windows.Forms.FolderBrowserDialog
$dialogo.Description = "{_escapar(titulo)}"
if ($dialogo.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialogo.SelectedPath
}}
"""
    ruta = _ejecutar_dialogo(script)
    return Path(ruta) if ruta else None


def elegir_archivo(titulo: str = "Elegí un archivo para importar") -> Path | None:
    """Devuelve el archivo elegido (cualquier formato, sin filtrar por
    extensión acá -- extraer_archivo() en ingest.py es quien valida si hay
    un extractor disponible), o None si el usuario canceló."""
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
    return Path(ruta) if ruta else None


def _escapar(texto: str) -> str:
    return texto.replace('"', '`"')


def _ejecutar_dialogo(script: str) -> str:
    resultado = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Sta", "-Command", script],
        capture_output=True,
        text=True,
        timeout=_TIMEOUT_SEGUNDOS,
    )
    return resultado.stdout.strip()
