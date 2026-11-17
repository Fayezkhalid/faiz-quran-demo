# Installs everything for the call-me skill on Windows.
# Run from the unzipped kit folder:
#   powershell -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = "Stop"
$kit = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "1/3 Installing Linphone, FFmpeg and Python (winget)..." -ForegroundColor Cyan
foreach ($id in "BelledonneCommunications.Linphone", "Gyan.FFmpeg", "Python.Python.3.12") {
    winget install --id $id -e --accept-source-agreements --accept-package-agreements
}

# Pick up the new programs without reopening PowerShell
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "2/3 Checking tools..." -ForegroundColor Cyan
python --version
ffmpeg -version | Select-Object -First 1
if (-not (Test-Path "C:\Program Files\Linphone\bin\liblinphone.dll")) {
    Write-Warning "Linphone was not found in C:\Program Files\Linphone. Reinstall it, or change LIN at the top of call_me.py."
}

Write-Host "3/3 Setting up the skill..." -ForegroundColor Cyan
python "$kit\setup_call_me.py"

Write-Host ""
Write-Host "Now test the call:" -ForegroundColor Green
Write-Host "  cd `"$env:USERPROFILE\.claude\skills\call-me`""
Write-Host "  python call_me.py"
Write-Host "  python call_me.py wrong.mp3"
