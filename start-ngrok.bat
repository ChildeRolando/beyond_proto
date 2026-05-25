@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Combat Engine - Internet Mode

echo ==========================================
echo   Combat Engine - Internet Play (ngrok)
echo ==========================================
echo.

:: Clean up any leftover processes from previous runs
echo Cleaning up old processes...
taskkill /fi "WINDOWTITLE eq CombatEngine-Signaling" /f 2>nul
taskkill /fi "WINDOWTITLE eq ngrok-Tunnel" /f 2>nul
taskkill /fi "WINDOWTITLE eq CombatEngine-GameServer" /f 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort 8088 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }" 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }" 2>nul
timeout /t 1 >nul
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check ngrok
if not exist "%~dp0ngrok.exe" (
    echo [ERROR] ngrok.exe not found.
    echo Download from https://ngrok.com/download
    echo Place ngrok.exe in: %~dp0
    pause
    exit /b 1
)

:: Verify ngrok auth token
"%~dp0ngrok.exe" config check >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo ==========================================
    echo   First-time setup - ngrok authtoken
    echo.
    echo   1. Open https://dashboard.ngrok.com/signup
    echo   2. Sign up with GitHub / Google
    echo   3. Go to https://dashboard.ngrok.com/get-started/your-authtoken
    echo   4. Copy your authtoken and paste it below
    echo ==========================================
    echo.
    set /p NGROK_TOKEN_INPUT="Your authtoken: "
    "%~dp0ngrok.exe" config add-authtoken !NGROK_TOKEN_INPUT!
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Failed to set authtoken. Please try again.
        pause
        exit /b 1
    )
    echo Success!
    echo.
)

:: Get LAN IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do set LAN_IP=%%a
set LAN_IP=%LAN_IP: =%

:: Start combined server (signaling + static on port 8088, for ngrok)
echo [1/3] Starting server (signaling + game on port 8088)...
start "CombatEngine-Signaling" /min cmd /c "node server/signaling.js 8088"
timeout /t 1 >nul

:: Start local static server (for host on port 3000)
echo [2/3] Starting local game server (port 3000)...
start "CombatEngine-GameServer" /min cmd /c "node server/static.js 3000"
timeout /t 1 >nul

:: Start ngrok in visible window
echo [3/3] Starting ngrok tunnel...
echo.
echo ==========================================
echo   ngrok window opened
echo   Once connected, look for a line like:
echo   Forwarding  https://xxxx-xx-xxx.ngrok-free.app -^> http://localhost:8088
echo.
echo   Copy that https://xxxx-xx-xxx.ngrok-free.app
echo   and send it to your opponent!
echo ==========================================
echo.
start "ngrok-Tunnel" cmd /c ""%~dp0ngrok.exe" http 8088"
timeout /t 3 >nul

:: Try to fetch ngrok URL via API
echo Fetching public URL from ngrok API...
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 3; $t = $r.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1; if ($t) { Write-Host ''; Write-Host '=========================================='; Write-Host '  Public URL (send to opponent):'; Write-Host ('  ' + $t.public_url); Write-Host '=========================================='; Write-Host '' } } catch { Write-Host '  (waiting for ngrok to connect...)' }" 2>nul

echo.
echo ==========================================
echo   All services running
echo.
echo   Host (you):
echo     Open http://localhost:3000
if not "%LAN_IP%"=="" echo     or http://%LAN_IP%:3000
echo     Signaling address: localhost:8088
echo     Create room, share the room code.
echo.
echo   Guest (remote player):
echo     Open the ngrok URL in browser:
echo       https://XXXX.ngrok-free.dev
echo     Click "Visit Site" on the ngrok interstitial page.
echo     Game auto-configures signaling address.
echo     Enter the room code, join, and play!
echo.
echo   Close this window to stop all services.
echo ==========================================
pause >nul

:: Cleanup
taskkill /fi "WINDOWTITLE eq CombatEngine-Signaling" /f 2>nul
taskkill /fi "WINDOWTITLE eq ngrok-Tunnel" /f 2>nul
taskkill /fi "WINDOWTITLE eq CombatEngine-GameServer" /f 2>nul
