@echo off
cd /d "%~dp0"
title Combat Engine - Server

echo ==========================================
echo   Combat Engine - Signaling + Game Server
echo ==========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Get LAN IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do set LAN_IP=%%a
set LAN_IP=%LAN_IP: =%

:: Start signaling server
echo [1/2] Starting signaling server (ws://localhost:8088)...
start "CombatEngine-Signaling" /min cmd /c "node server/signaling.js 8088"
timeout /t 1 >nul

:: Start static file server
echo [2/2] Starting game server (http://localhost:3000)...
start "CombatEngine-GameServer" /min cmd /c "node server/static.js 3000"
timeout /t 1 >nul

echo.
echo ==========================================
echo   Servers are running!
echo.
echo   Local:  http://localhost:3000
if not "%LAN_IP%"=="" echo   LAN:    http://%LAN_IP%:3000
echo.
echo   How to play:
echo   1. Host: open browser, go to the address above
echo      Click "P2P Host" and share the room code
echo   2. Guest: open browser, go to the same address
echo      Click "P2P Join" and enter the room code
echo.
echo   Close this window to stop all servers.
echo ==========================================
pause >nul

:: Cleanup on exit
taskkill /fi "WINDOWTITLE eq CombatEngine-Signaling" /f 2>nul
taskkill /fi "WINDOWTITLE eq CombatEngine-GameServer" /f 2>nul
