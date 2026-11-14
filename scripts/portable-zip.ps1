# Fabrique la version portable d'Aqueli à partir de l'exécutable compilé par « tauri build » :
# un fichier .zip qui contient le dossier « Aqueli » (Aqueli.exe et portable.txt). Le fichier
# portable.txt garde toutes les données à côté de l'exécutable (src-tauri/src/portable.rs).
# Utilisé par la fabrication GitHub (.github/workflows/release.yml) ; affiche le chemin du .zip.
param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = "Stop"

$racine = Split-Path -Parent $PSScriptRoot
$release = Join-Path $racine "src-tauri\target\release"
$sortie = Join-Path $release "bundle\portable"
$dossier = Join-Path $sortie "Aqueli"

if (Test-Path $sortie) { Remove-Item $sortie -Recurse -Force }
New-Item -ItemType Directory -Path $dossier -Force | Out-Null
Copy-Item (Join-Path $release "aqueli.exe") (Join-Path $dossier "Aqueli.exe")
Copy-Item (Join-Path $racine "src-tauri\portable\portable.txt") (Join-Path $dossier "portable.txt")

$zip = Join-Path $sortie "Aqueli_${Version}_x64-portable.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($dossier, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
Write-Output $zip
