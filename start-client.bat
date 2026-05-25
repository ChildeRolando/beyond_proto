@echo off
cd /d "%~dp0"
title Combat Engine - Client

echo ==========================================
echo   Combat Engine - Client
echo ==========================================
echo.
echo Opening game client in browser...
echo.

:: Open the game via localhost (server must be running)
start http://localhost:3000

echo If the page doesn't load, make sure the server is running first.
echo Run start-server.bat to start the server.
echo.
pause
