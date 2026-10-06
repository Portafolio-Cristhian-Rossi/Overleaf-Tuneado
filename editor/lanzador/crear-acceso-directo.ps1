# Crea (o reemplaza) el acceso directo "Editor del informe". Para Windows PowerShell 5.1.
param(
    # Carpeta donde crear el acceso directo. Por defecto, el escritorio.
    [string]$Carpeta = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
$dirEditor = Split-Path -Parent $PSScriptRoot
$lanzador = Join-Path $PSScriptRoot 'abrir.ps1'
$ruta = Join-Path $Carpeta 'Editor del informe.lnk'

$shell = New-Object -ComObject WScript.Shell
$acceso = $shell.CreateShortcut($ruta)
$acceso.TargetPath = (Get-Command powershell.exe).Source
$acceso.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$lanzador`""
$acceso.WorkingDirectory = $dirEditor
$acceso.WindowStyle = 7   # minimizada: la consola de PowerShell no llega a verse
$acceso.IconLocation = "$env:SystemRoot\System32\shell32.dll,1"
$acceso.Description = 'Abre el editor local del informe'
$acceso.Save()

Write-Output "Acceso directo creado: $ruta"
