# Downloads the large upstream sources that are NOT stored in git, then builds
# the browser-reader data. Run this once after cloning to assemble a complete
# drive folder under usb-root\.
#
#   powershell -ExecutionPolicy Bypass -File build\fetch_sources.ps1
#
# Versions are pinned in sources.json. Re-run to refresh to a newer snapshot.

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root     = Split-Path $PSScriptRoot -Parent
$usb      = Join-Path $root "usb-root"
$dl       = Join-Path $root "downloads"
New-Item -ItemType Directory -Force $dl | Out-Null

$OTZARIA_APP_URL = "https://github.com/Sivan22/otzaria/releases/download/v0.2.7-dev-110/otzaria-windows.zip"
$OTZARIA_LIB_URL = "https://github.com/Sivan22/otzaria-library/releases/download/latest/otzaria_latest.zip"

Write-Host "[1/4] Downloading Otzaria portable app..."
$appZip = Join-Path $dl "otzaria-windows.zip"
if (-not (Test-Path $appZip)) { curl.exe -sL --retry 3 -o $appZip $OTZARIA_APP_URL }
Expand-Archive -Path $appZip -DestinationPath (Join-Path $usb "Otzaria-Windows") -Force

Write-Host "[2/4] Downloading Otzaria library (~1.2 GB)..."
$libZip = Join-Path $dl "otzaria_latest.zip"
if (-not (Test-Path $libZip)) { curl.exe -sL --retry 3 -o $libZip $OTZARIA_LIB_URL }

Write-Host "[3/4] Extracting library (~5.5 GB)..."
$lib = Join-Path $usb "Library"
New-Item -ItemType Directory -Force $lib | Out-Null
tar.exe -xf $libZip -C $lib

Write-Host "[4/4] Building browser-reader data (~2.8 GB)..."
python (Join-Path $PSScriptRoot "convert_library.py") --src (Join-Path $lib "אוצריא") --out (Join-Path $usb "Library-Web")

Write-Host "Done. The complete drive folder is: $usb"
Write-Host "Copy its CONTENTS to the root of a USB drive (exFAT, 32 GB recommended)."
