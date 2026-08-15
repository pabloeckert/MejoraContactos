<#
.SYNOPSIS
    Genera un reporte de traspaso (handoff) para pasar el trabajo de una
    cuenta de Claude a la siguiente. Commitea el trabajo pendiente en el
    repo local de codigo, corre los tests, junta el log de git desde el
    ultimo handoff, y arma un archivo .md con todo -- mas un backup del
    repo de Data/.

.DESCRIPTION
    1. Commitea cualquier cambio sin commitear en motor-contactos/.git.
    2. Detecta si App\MotorContactos.exe quedo desactualizado (hay codigo
       en ui/src, src/motor o assets mas nuevo que el ultimo build) y lo
       reconstruye solo si hace falta -- build_exe.ps1 existia pero nada
       recordaba correrlo, asi que el .exe podia quedar viejo en silencio.
    3. Corre pytest y captura el resultado.
    4. Junta los commits nuevos desde el ultimo tag "handoff-*".
    5. Lee las ultimas entradas de DECISIONES.md y el estado de
       PENDIENTES.md.
    6. Arma motor-contactos/handoffs/handoff-<timestamp>.md con todo, y lo
       imprime en pantalla.
    7. Tagea el commit actual como handoff-<timestamp> (marca el punto de
       corte para la proxima corrida).
    8. De paso, respalda Data/ (mismo mecanismo que setup_project.ps1).

.NOTES
    Correr esto ANTES de que se corte la sesion por limite de cuota, no
    despues -- si ya se cerro la sesion sin correrlo, el ultimo handoff
    guardado en handoffs/ sigue siendo valido como punto de partida, solo
    que un poco desactualizado.
#>

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 lee texto con el codepage del sistema por default,
# no UTF-8 -- sin esto, cualquier tilde/eñe de DECISIONES.md/PENDIENTES.md
# se corrompe al leerla (y de nuevo al re-escribirla en el reporte).
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = $PSScriptRoot
$MotorDir = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $MotorDir
$DataDir = Join-Path $RepoRoot "Data"
$HandoffsDir = Join-Path $MotorDir "handoffs"

if (-not (Test-Path $HandoffsDir)) {
    New-Item -ItemType Directory -Path $HandoffsDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$tagNuevo = "handoff-$timestamp"

Push-Location $MotorDir
try {
    # 1. Commitear trabajo pendiente
    $cambios = git status --porcelain
    if ($cambios) {
        git add -A
        git commit -m "wip: snapshot antes de handoff ($timestamp)" | Out-Null
        $seCommiteo = $true
    } else {
        $seCommiteo = $false
    }

    # 2. Auto-build del .exe si quedo desactualizado -- antes dependia de
    # que alguien se acordara de correr build_exe.ps1 a mano despues de
    # tocar ui/src o el backend; si se olvidaba, el .exe quedaba viejo sin
    # que nada lo avisara.
    $ExePath = Join-Path $MotorDir "App\MotorContactos.exe"
    $CarpetasFuenteExe = @(
        (Join-Path $MotorDir "ui\src"),
        (Join-Path $MotorDir "src\motor"),
        (Join-Path $MotorDir "assets")
    ) | Where-Object { Test-Path $_ }

    $ultimaModificacionFuente = $CarpetasFuenteExe |
        ForEach-Object { Get-ChildItem -Path $_ -Recurse -File -ErrorAction SilentlyContinue } |
        Measure-Object -Property LastWriteTime -Maximum |
        Select-Object -ExpandProperty Maximum

    if (-not (Test-Path $ExePath)) {
        $exeDesactualizado = $true
        $motivoExe = "App\MotorContactos.exe todavia no existe"
    } elseif ($ultimaModificacionFuente -and $ultimaModificacionFuente -gt (Get-Item $ExePath).LastWriteTime) {
        $exeDesactualizado = $true
        $motivoExe = "hay codigo mas nuevo ($ultimaModificacionFuente) que el ultimo build ($((Get-Item $ExePath).LastWriteTime))"
    } else {
        $exeDesactualizado = $false
        $motivoExe = "sin cambios en ui/src, src/motor o assets desde el ultimo build"
    }

    if ($exeDesactualizado) {
        Write-Host "==> App\MotorContactos.exe desactualizado ($motivoExe) -- reconstruyendo..." -ForegroundColor Yellow
        try {
            & (Join-Path $ScriptDir "build_exe.ps1")
            $resultadoExe = "Reconstruido automaticamente ($motivoExe)."
            Write-Host "==> $resultadoExe" -ForegroundColor Green
        } catch {
            $resultadoExe = "FALLO la reconstruccion automatica ($motivoExe): $($_.Exception.Message)"
            Write-Host "==> $resultadoExe" -ForegroundColor Red
        }
    } else {
        $resultadoExe = "Al dia -- $motivoExe."
        Write-Host "==> App\MotorContactos.exe $resultadoExe" -ForegroundColor Cyan
    }

    # 3. Tests
    $venvPython = Join-Path $MotorDir ".venv\Scripts\python.exe"
    $env:PYTHONPATH = Join-Path $MotorDir "src"
    $salidaTests = & $venvPython -m pytest -q 2>&1 | Out-String
    $testsOk = $LASTEXITCODE -eq 0
    $resumenTests = ($salidaTests -split "`n" | Select-Object -Last 5) -join "`n"

    # 4. Commits desde el ultimo handoff
    $ultimoTag = git tag --list "handoff-*" --sort=-creatordate | Select-Object -First 1
    if ($ultimoTag) {
        $rangoLog = "$ultimoTag..HEAD"
        $commitsNuevos = git log $rangoLog --oneline
        $diffStat = git diff --stat $rangoLog
    } else {
        $commitsNuevos = git log --oneline
        $diffStat = "(primer handoff -- no hay punto de comparacion previo)"
    }

    # 5. DECISIONES.md (ultimas entradas) y PENDIENTES.md completo
    $decisionesPath = Join-Path $MotorDir "DECISIONES.md"
    $pendientesPath = Join-Path $MotorDir "PENDIENTES.md"
    $ultimasDecisiones = ""
    if (Test-Path $decisionesPath) {
        $contenido = Get-Content $decisionesPath -Raw -Encoding UTF8
        $bloques = $contenido -split "`n---`n"
        $ultimasDecisiones = ($bloques | Select-Object -Last 2) -join "`n---`n"
    }
    $pendientes = if (Test-Path $pendientesPath) { Get-Content $pendientesPath -Raw -Encoding UTF8 } else { "(no existe PENDIENTES.md)" }

    # 6. Armar el reporte
    $reporte = @"
# Handoff -- $timestamp

## Ejecutable (App\MotorContactos.exe)

$resultadoExe

## Tests

``````
$resumenTests
``````

Estado: $(if ($testsOk) { "OK -- todos pasan" } else { "HAY FALLAS -- revisar antes de seguir" })

## Commits desde el handoff anterior ($(if ($ultimoTag) { $ultimoTag } else { "primer handoff" }))

``````
$commitsNuevos
``````

### Archivos modificados

``````
$diffStat
``````

## Decisiones/hallazgos recientes (DECISIONES.md)

$ultimasDecisiones

## Pendientes (PENDIENTES.md completo)

$pendientes
"@

    $archivoReporte = Join-Path $HandoffsDir "handoff-$timestamp.md"
    Set-Content -Path $archivoReporte -Value $reporte -Encoding UTF8

    # 7. Tag del punto de corte
    git tag $tagNuevo | Out-Null

    Write-Host ""
    Write-Host "==> Handoff generado: $archivoReporte" -ForegroundColor Cyan
    Write-Host ""
    Write-Host $reporte
} finally {
    Pop-Location
}

# 8. Backup de Data/ tambien, mismo criterio que setup_project.ps1
if (Test-Path (Join-Path $DataDir ".git")) {
    Push-Location $DataDir
    try {
        $cambiosData = git status --porcelain
        if ($cambiosData) {
            git add -A
            git commit -m "backup: snapshot de datos ($timestamp)" | Out-Null
            Write-Host "==> Data/ respaldada en su repo local." -ForegroundColor Cyan
        }
    } finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "Pegale el contenido de arriba (o el archivo handoffs\handoff-$timestamp.md) a la proxima cuenta de Claude junto con PROMPT_CONTINUACION.md." -ForegroundColor Green
