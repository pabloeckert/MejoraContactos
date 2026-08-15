@echo off
cd /d "%~dp0"

echo Creando entorno virtual en .venv...
python -m venv .venv
if errorlevel 1 (
    echo No se pudo crear el entorno virtual. ^Esta Python instalado y en el PATH?
    pause
    exit /b 1
)

echo Instalando dependencias (puede tardar unos minutos la primera vez)...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt

echo.
echo Listo. Ahora usa "Iniciar Panel.bat" para abrir la aplicacion.
pause
