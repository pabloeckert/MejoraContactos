@echo off
cd /d "%~dp0"
title Motor de Contactos

if not exist "App\MotorContactos.exe" (
    echo No se encontro App\MotorContactos.exe
    echo Corre "scripts\build_exe.ps1" para generarlo, o usa "Iniciar Panel.bat" mientras tanto.
    pause
    exit /b 1
)

echo Abriendo Motor de Contactos...
echo (la ventana tarda unos segundos en aparecer, no cierres esto todavia)
start "" "App\MotorContactos.exe" escritorio

timeout /t 4 /nobreak >nul

tasklist /fi "imagename eq MotorContactos.exe" 2>nul | find /i "MotorContactos.exe" >nul
if errorlevel 1 (
    echo.
    echo No se pudo abrir la app. Puede que Windows la haya bloqueado por
    echo ser un ejecutable sin firma digital ^(SmartScreen/antivirus^).
    echo Proba: clic derecho en App\MotorContactos.exe -^> Propiedades -^>
    echo si dice "Se bloqueo este archivo", tildá "Desbloquear" y aceptá.
    pause
) else (
    echo Listo, ya deberia estar abierta.
    timeout /t 2 /nobreak >nul
)
