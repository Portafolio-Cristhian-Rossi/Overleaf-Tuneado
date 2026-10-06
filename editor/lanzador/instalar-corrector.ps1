# Descarga LanguageTool (el corrector) dentro de editor/languagetool. Para Windows PowerShell 5.1.
# Son unos 250 MB, de languagetool.org. El corrector corre en esta máquina: el texto no sale de acá.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # sin esto, Invoke-WebRequest tarda varias veces más

$destino = Join-Path (Split-Path -Parent $PSScriptRoot) 'languagetool'
$instalado = Get-ChildItem -Path $destino -Filter 'LanguageTool-*' -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'languagetool-server.jar') }
if ($instalado) {
    Write-Output "LanguageTool ya está instalado en $($instalado[0].FullName)"
    exit 0
}

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Output 'Aviso: no se encontró Java. El corrector lo necesita; los pasos están en INSTALACION.md.'
}

New-Item -ItemType Directory -Force -Path $destino | Out-Null
$zip = Join-Path $destino 'LanguageTool-stable.zip'
Write-Output 'Descargando LanguageTool (unos 250 MB)...'
Invoke-WebRequest -Uri 'https://languagetool.org/download/LanguageTool-stable.zip' -OutFile $zip
Write-Output 'Descomprimiendo...'
Expand-Archive -Path $zip -DestinationPath $destino -Force
Remove-Item -Path $zip -Confirm:$false
Write-Output 'Listo. El corrector se activa la próxima vez que abras el editor.'
