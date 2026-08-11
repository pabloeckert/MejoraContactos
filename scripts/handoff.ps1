<#
.SYNOPSIS
    Genera un reporte de traspaso (handoff) para pasar el trabajo de una
    cuenta de Claude a la siguiente. Commitea el trabajo pendiente en el
    repo local de codigo, corre los tests, junta el log de git desde el
    ultimo handoff, y arma un archivo .md con todo -- mas un backup del
    repo de Data/.

.DESCRIPTION
    1. Commitea cualquier cambio sin commitear en motor-contactos/.git.
    2. Corre pytest y captura el resultado.
    3. Junta los commits nuevos desde el ultimo tag "handoff-*".
    4. Lee las ultimas entradas de DECISIONES.md y el estado de
       PENDIENTES.md.
    5. Arma motor-contactos/handoffs/handoff-<timestamp>.md con todo, y lo
       imprime en pantalla.
    6. Tagea el commit actual como handoff-<timestamp> (marca el punto de
       corte para la proxima corrida).
    7. De paso, respalda Data/ (mismo mecanismo que setup_project.ps1).

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

    # 2. Tests
    $venvPython = Join-Path $MotorDir ".venv\Scripts\python.exe"
    $env:PYTHONPATH = Join-Path $MotorDir "src"
    $salidaTests = & $venvPython -m pytest -q 2>&1 | Out-String
    $testsOk = $LASTEXITCODE -eq 0
    $resumenTests = ($salidaTests -split "`n" | Select-Object -Last 5) -join "`n"

    # 3. Commits desde el ultimo handoff
    $ultimoTag = git tag --list "handoff-*" --sort=-creatordate | Select-Object -First 1
    if ($ultimoTag) {
        $rangoLog = "$ultimoTag..HEAD"
        $commitsNuevos = git log $rangoLog --oneline
        $diffStat = git diff --stat $rangoLog
    } else {
        $commitsNuevos = git log --oneline
        $diffStat = "(primer handoff -- no hay punto de comparacion previo)"
    }

    # 4. DECISIONES.md (ultimas entradas) y PENDIENTES.md completo
    $decisionesPath = Join-Path $MotorDir "DECISIONES.md"
    $pendientesPath = Join-Path $MotorDir "PENDIENTES.md"
    $ultimasDecisiones = ""
    if (Test-Path $decisionesPath) {
        $contenido = Get-Content $decisionesPath -Raw -Encoding UTF8
        $bloques = $contenido -split "`n---`n"
        $ultimasDecisiones = ($bloques | Select-Object -Last 2) -join "`n---`n"
    }
    $pendientes = if (Test-Path $pendientesPath) { Get-Content $pendientesPath -Raw -Encoding UTF8 } else { "(no existe PENDIENTES.md)" }

    # 5. Armar el reporte
    $reporte = @"
# Handoff -- $timestamp

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

    # 6. Tag del punto de corte
    git tag $tagNuevo | Out-Null

    Write-Host ""
    Write-Host "==> Handoff generado: $archivoReporte" -ForegroundColor Cyan
    Write-Host ""
    Write-Host $reporte
} finally {
    Pop-Location
}

# 7. Backup de Data/ tambien, mismo criterio que setup_project.ps1
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
