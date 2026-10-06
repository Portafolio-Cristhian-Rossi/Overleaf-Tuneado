# Abre el editor del informe: si ya está corriendo lo muestra; si no, lo inicia sin ventana de consola.
# Para Windows PowerShell 5.1. Este archivo se guarda en UTF-8 con BOM para que las tildes se lean bien.
param(
    # Solo inicia el servidor, sin abrir el navegador (para pruebas).
    [switch]$SinNavegador
)

$ErrorActionPreference = 'Stop'
$dirEditor = Split-Path -Parent $PSScriptRoot
$registro = Join-Path $env:TEMP 'editor-informe-arranque.log'

function Mostrar-Error([string]$texto) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($texto, 'Editor del informe', 'OK', 'Warning') | Out-Null
}

function Leer-Puerto {
    $archivo = 'config.json'
    if ($env:EDITOR_CONFIG) { $archivo = $env:EDITOR_CONFIG }
    $ruta = Join-Path $dirEditor $archivo
    if (Test-Path $ruta) {
        $config = Get-Content -Raw -Encoding UTF8 $ruta | ConvertFrom-Json
        if ($config.puerto) { return [int]$config.puerto }
    }
    return 4317
}

function Esta-Activo([int]$puerto) {
    try {
        $respuesta = Invoke-RestMethod -Uri "http://127.0.0.1:$puerto/api/salud" -TimeoutSec 2
        return $respuesta.app -eq 'editor-informe'
    } catch {
        return $false
    }
}

function Abrir-Navegador([string]$url) {
    if (-not $SinNavegador) { Start-Process $url }
}

$puerto = Leer-Puerto
$url = "http://127.0.0.1:$puerto/"

if (Esta-Activo $puerto) {
    Abrir-Navegador $url
    exit 0
}

$instalado = (Test-Path (Join-Path $dirEditor 'dist\index.html')) -and (Test-Path (Join-Path $dirEditor 'node_modules'))
if (-not $instalado) {
    Mostrar-Error 'El editor no está instalado. Seguí los pasos de INSTALACION.md.'
    exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Mostrar-Error 'El editor no pudo iniciar. No se encontró Node.'
    exit 1
}

Start-Process -FilePath $node.Source -ArgumentList '--import', 'tsx', 'servidor/index.ts' `
    -WorkingDirectory $dirEditor -WindowStyle Hidden -RedirectStandardError $registro

# Hasta 20 segundos para que el servidor responda.
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Esta-Activo $puerto) {
        Abrir-Navegador $url
        exit 0
    }
}

$motivo = ''
if (Test-Path $registro) { $motivo = (Get-Content -Raw -Encoding UTF8 $registro) }
if ($motivo) { $motivo = $motivo.Trim() }
if ($motivo.Length -gt 600) { $motivo = $motivo.Substring(0, 600) + '...' }
if ($motivo) {
    Mostrar-Error ("El editor no pudo iniciar.`n`n" + $motivo)
} else {
    Mostrar-Error 'El editor no pudo iniciar. Probá de nuevo; si sigue sin abrir, mirá la sección de problemas frecuentes de INSTALACION.md.'
}
exit 1
