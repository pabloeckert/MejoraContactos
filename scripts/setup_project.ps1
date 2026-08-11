<#
.SYNOPSIS
    Deja motor-contactos listo para trabajar, sin importar que cuenta de
    Claude (o que maquina) lo corra. Idempotente -- se puede correr las
    veces que haga falta, no rompe nada si ya esta todo armado.

.DESCRIPTION
    1. Crea la estructura de carpetas de Data/ si falta (Crudos, Salida).
    2. Inicializa DOS repos git LOCALES, SIN REMOTO (nunca a GitHub):
       - motor-contactos/.git  -> versiona el codigo fuente
       - Data/.git             -> versiona los datos reales (red de
         seguridad contra un borrado accidental como el que ya paso una
         vez)
       Ninguno de los dos se pushea nunca a ningun lado.
    3. Verifica/crea el entorno virtual de Python e instala dependencias.
    4. Corre la suite de tests y reporta el resultado.
    5. Imprime un resumen de estado.

.NOTES
    No toca Data/Crudos ni borra nada existente -- todo es creacion
    idempotente (mkdir -Force, git init si no existe, pip install).
#>

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$MotorDir = Split-Path -Parent $ScriptDir           # motor-contactos/
$RepoRoot = Split-Path -Parent $MotorDir            # MejoraContactos/
$DataDir = Join-Path $RepoRoot "Data"

function Write-Paso($texto) {
    Write-Host ""
    Write-Host "==> $texto" -ForegroundColor Cyan
}

function Write-Ok($texto) {
    Write-Host "    OK: $texto" -ForegroundColor Green
}

function Write-Advertencia($texto) {
    Write-Host "    AVISO: $texto" -ForegroundColor Yellow
}

# 1. Estructura de carpetas de Data/
Write-Paso "Verificando estructura de Data/"
$carpetasData = @(
    (Join-Path $DataDir "Crudos"),
    (Join-Path $DataDir "Salida")
)
foreach ($carpeta in $carpetasData) {
    if (-not (Test-Path $carpeta)) {
        New-Item -ItemType Directory -Path $carpeta -Force | Out-Null
        Write-Ok "Creada: $carpeta"
    } else {
        Write-Ok "Ya existe: $carpeta"
    }
}
$tieneArchivos = (Get-ChildItem (Join-Path $DataDir "Crudos") -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0
if (-not $tieneArchivos) {
    Write-Advertencia "Data/Crudos/ esta vacia -- no hay CSV/Excel/VCF fuente todavia. Ver PENDIENTES.md."
}

# 2a. Repo git local para motor-contactos/ (codigo)
Write-Paso "Repo git local de motor-contactos/ (codigo, sin remoto)"
Push-Location $MotorDir
try {
    if (-not (Test-Path ".git")) {
        git init | Out-Null
        git add -A
        git commit -m "chore: snapshot inicial del codigo (setup_project.ps1)" | Out-Null
        Write-Ok "Repo inicializado y snapshot inicial commiteado."
    } else {
        Write-Ok "Repo ya existe."
    }
    $remotos = git remote
    if ($remotos) {
        Write-Advertencia "Este repo tiene remotos configurados ($remotos) -- se esperaba que fuera 100% local. Revisar a mano."
    }
} finally {
    Pop-Location
}

# 2b. Repo git local para Data/ (backup de datos reales)
Write-Paso "Repo git local de Data/ (datos reales, backup, sin remoto)"
Push-Location $DataDir
try {
    if (-not (Test-Path ".git")) {
        git init | Out-Null
        Write-Ok "Repo inicializado."
    } else {
        Write-Ok "Repo ya existe."
    }
    $cambios = git status --porcelain
    if ($cambios) {
        git add -A
        $fecha = Get-Date -Format "yyyy-MM-dd HH:mm"
        git commit -m "backup: snapshot de datos ($fecha)" | Out-Null
        Write-Ok "Snapshot de datos commiteado (esto es lo que te salva la proxima vez que algo se borre solo)."
    } else {
        Write-Ok "Sin cambios para respaldar."
    }
} finally {
    Pop-Location
}

# 3. Entorno virtual de Python
Write-Paso "Entorno virtual de Python"
$venvPython = Join-Path $MotorDir ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "    Creando .venv..."
    python -m venv (Join-Path $MotorDir ".venv")
    Write-Ok "Entorno virtual creado."
}
Write-Host "    Instalando dependencias (requirements.txt)..."
& $venvPython -m pip install -q --disable-pip-version-check -r (Join-Path $MotorDir "requirements.txt")
Write-Ok "Dependencias instaladas/verificadas."

# 4. Tests
Write-Paso "Corriendo la suite de tests"
Push-Location $MotorDir
try {
    $env:PYTHONPATH = Join-Path $MotorDir "src"
    & $venvPython -m pytest -q
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Todos los tests pasan."
    } else {
        Write-Advertencia "Hay tests fallando -- revisar salida arriba antes de seguir."
    }
} finally {
    Pop-Location
}

# 5. Resumen
Write-Paso "Resumen"
Write-Host "    Codigo:         $MotorDir"
Write-Host "    Datos:          $DataDir"
Write-Host "    Especificacion: $(Join-Path $MotorDir 'ESPECIFICACION.md')"
Write-Host "    Pendientes:     $(Join-Path $MotorDir 'PENDIENTES.md')"
Write-Host ""
Write-Host "Listo. Para generar un reporte de traspaso: scripts\handoff.ps1" -ForegroundColor Cyan
