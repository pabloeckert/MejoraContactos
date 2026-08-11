@echo off
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo No se encontro el entorno virtual en .venv
    echo Corre primero "Instalar (primera vez).bat"
    pause
    exit /b 1
)

set PYTHONPATH=src
echo Iniciando el panel de motor-contactos...
echo Se va a abrir solo en el navegador. Para cerrar el panel, cerra esta ventana.
".venv\Scripts\python.exe" -m motor.cli panel

pause
