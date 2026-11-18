# Fayez Home HQ - one-time setup for Windows (PowerShell 5.1+).
# Downloads the app, installs Node.js if missing, asks for the printer + WhatsApp settings,
# and makes the bridge start automatically with Windows. Safe to run again to update.
$ErrorActionPreference = 'Stop'
$Repo   = 'Fayezkhalid/faiz-quran-demo'
$Branch = 'claude/nifty-fermi-l36c2l'
$Dest   = Join-Path $env:USERPROFILE 'fayez-home-hq'

function Plain($sec) { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)) }

Write-Host "`n[1/5] Node.js" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
node --version

Write-Host "`n[2/5] Downloading Fayez Home HQ" -ForegroundColor Cyan
$zip = Join-Path $env:TEMP 'fayez-hq.zip'
$tmp = Join-Path $env:TEMP 'fayez-hq-src'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile $zip -UseBasicParsing
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive $zip $tmp
$src = Join-Path (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName 'fayez-home-hq'
New-Item -ItemType Directory -Force $Dest | Out-Null
Copy-Item (Join-Path $src '*') $Dest -Recurse -Force   # .env and data\ are not in the zip, so they are kept
Remove-Item $zip, $tmp -Recurse -Force
Write-Host "Installed in $Dest"

Write-Host "`n[3/5] Installing the bridge" -ForegroundColor Cyan
Push-Location (Join-Path $Dest 'bridge')
npm install --omit=dev --no-audit --no-fund
Pop-Location

Write-Host "`n[4/5] Settings (typed here only, never sent anywhere)" -ForegroundColor Cyan
$envFile = Join-Path $Dest 'bridge\.env'
$ask = $true
if (Test-Path $envFile) { $ask = ((Read-Host 'Settings already saved. Enter them again? (y/N)') -eq 'y') }
if ($ask) {
  $ip     = Read-Host 'Printer IP address (printer screen: Settings > Network), e.g. 192.168.1.50'
  $serial = Read-Host 'Printer serial number (Bambu Studio > Device, or printer Settings)'
  $code   = Plain (Read-Host 'Printer access code (printer screen: Settings > Network)' -AsSecureString)
  $phone  = (Read-Host 'Your WhatsApp number, international without + (e.g. 9665XXXXXXXX)') -replace '[^\d]',''
  $key    = Plain (Read-Host 'CallMeBot apikey (press Enter to skip WhatsApp for now)' -AsSecureString)
  $tg     = Plain (Read-Host 'Telegram bot token from @BotFather (press Enter to skip)' -AsSecureString)
  $guser  = Read-Host 'Gmail address for the email manager (press Enter to skip)'
  $gpass  = ''
  if ($guser) { $gpass = (Plain (Read-Host 'Gmail App Password, 16 letters (myaccount.google.com/apppasswords)' -AsSecureString)) -replace '\s','' }
  $remind = Read-Host 'Daily MBA reminder time HH:MM (Enter = 20:00)'
  if (-not $remind) { $remind = '20:00' }
  $lines = @(
    'PORT=8787', 'HOST=127.0.0.1',
    "PRINTER_IP=$ip", "PRINTER_SERIAL=$serial", "PRINTER_ACCESS_CODE=$code", 'PRINTER_MODEL=A2L Combo',
    "CALLMEBOT_PHONE=$phone", "CALLMEBOT_APIKEY=$key", "TELEGRAM_BOT_TOKEN=$tg", "GMAIL_USER=$guser", "GMAIL_APP_PASSWORD=$gpass",
    'MONTHLY_BUDGET=9000', "MASTERS_REMINDER_TIME=$remind"
  )
  Set-Content -Path $envFile -Value $lines -Encoding ASCII
  Write-Host "Saved to $envFile"
}

Write-Host "`n[5/5] Auto-start with Windows + start now" -ForegroundColor Cyan
$startCmd = Join-Path $Dest 'start-hq.cmd'
Set-Content $startCmd -Encoding ASCII -Value @(
  '@echo off',
  "cd /d `"$Dest\bridge`"",
  'node server.js >> "%~dp0hq.log" 2>&1'
)
$lnkPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Fayez Home HQ.lnk'
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath); $lnk.TargetPath = $startCmd; $lnk.WorkingDirectory = $Dest; $lnk.WindowStyle = 7; $lnk.Save()
Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }   # stop an older copy
Start-Process $startCmd -WindowStyle Minimized
Start-Sleep -Seconds 4
Start-Process 'http://localhost:8787'

Write-Host "`nDone. Fayez Home HQ: http://localhost:8787" -ForegroundColor Green
Write-Host "Log file: $Dest\hq.log"
Write-Host "It starts by itself every time Windows starts."
