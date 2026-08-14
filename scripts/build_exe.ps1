<#
.SYNOPSIS
    Reconstruye App/MotorContactos.exe (la app de escritorio empaquetada)
    desde cero: compila la UI React y corre PyInstaller.

.NOTES
    scripts/handoff.ps1 ya llama a este script automáticamente cuando
    detecta código más nuevo en ui/src, src/motor o assets que el último
    build de App/MotorContactos.exe -- no hace falta acordarse de correrlo
    a mano después de cada cambio. Sigue sirviendo para correrlo manual
    durante desarrollo iterativo (probar el .exe sin esperar al cierre de
    la ronda). App/ es un artefacto generado, no se versiona en git (ver
    .gitignore), así que sin este mecanismo no se actualiza solo.

    config.yaml, .env, Data/ NO se empaquetan a propósito -- el .exe los
    busca en tiempo de ejecución subiendo desde su propia carpeta (ver
    cli.py:_ruta_config_real) para no arriesgarse a operar contra una
    copia vieja o vacía en vez de los datos reales del usuario.
#>

$ErrorActionPreference = "Stop"
$MotorDir = Split-Path -Parent $PSScriptRoot
Push-Location $MotorDir
try {
    Write-Host "==> Compilando la UI (npm run build)..." -ForegroundColor Cyan
    Push-Location "ui"
    npm run build
    Pop-Location

    Write-Host "==> Empaquetando con PyInstaller..." -ForegroundColor Cyan
    if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
    if (Test-Path "App") { Remove-Item -Recurse -Force "App" }

    & ".venv\Scripts\pyinstaller.exe" --noconfirm --windowed --onedir `
        --name "MotorContactos" `
        --icon "assets/icono.ico" `
        --paths src `
        --add-data "ui/dist;ui/dist" `
        --add-data "assets;assets" `
        --collect-all googleapiclient `
        --collect-all google_auth_oauthlib `
        --collect-all google_auth_httplib2 `
        --hidden-import motor.desktop_app `
        --hidden-import motor.api `
        --hidden-import motor.reviewer_app `
        "src/motor/cli.py"

    if (Test-Path "dist/MotorContactos") {
        Move-Item "dist/MotorContactos" "App"
    }
    if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
    if (Test-Path "MotorContactos.spec") { Remove-Item -Force "MotorContactos.spec" }
    if (Test-Path "build") { Remove-Item -Recurse -Force "build" }

    Write-Host ""
    Write-Host "==> Listo: App\MotorContactos.exe" -ForegroundColor Green
    Write-Host "Probalo con 'Iniciar App.bat' o 'App\MotorContactos.exe escritorio'."
} finally {
    Pop-Location
}
