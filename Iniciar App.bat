@echo off
cd /d "%~dp0"

if not exist "App\MotorContactos.exe" (
    echo No se encontro App\MotorContactos.exe
    echo Corre "scripts\build_exe.ps1" para generarlo, o usa "Iniciar Panel.bat" mientras tanto.
    pause
    exit /b 1
)

start "" "App\MotorContactos.exe" escritorio
