@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ========================================
echo Deploy combat-engine WITH assets
echo Working dir: %cd%
echo ========================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -Assets -Pause

echo.
pause