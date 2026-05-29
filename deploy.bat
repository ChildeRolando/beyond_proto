@echo off
set PUSH_ASSETS=0

for %%a in (%*) do (
  if "%%a"=="--assets" set PUSH_ASSETS=1
  if "%%a"=="--all"   set PUSH_ASSETS=1
  if "%%a"=="--help"  goto :help
  if "%%a"=="-h"      goto :help
)

echo === Deploying combat-engine to cloud server ===
echo Code files: engine/ server/ index.html package.json
if %PUSH_ASSETS%==1 (echo Assets:     assets/ (included^)) else (echo Assets:     skipped (use --assets to include^))
echo.

:: Always push code files (small, change frequently)
scp -i "%USERPROFILE%\.ssh\id_ed25519" -o IdentitiesOnly=yes -r engine server index.html package.json Administrator@120.77.178.15:"C:/Users/Administrator/Desktop/combat-engine/"
if errorlevel 1 echo [WARN] scp code upload had errors

:: Assets are large images that rarely change 鈥?only push when asked
if %PUSH_ASSETS%==1 (
  scp -i "%USERPROFILE%\.ssh\id_ed25519" -o IdentitiesOnly=yes -r assets Administrator@120.77.178.15:"C:/Users/Administrator/Desktop/combat-engine/"
  if errorlevel 1 echo [WARN] scp assets upload had errors
)

:: Schedule restart via Task Scheduler (survives SSH disconnect)
ssh -i "%USERPROFILE%\.ssh\id_ed25519" -o IdentitiesOnly=yes Administrator@120.77.178.15 "powershell -Command \"$t = (Get-Date).AddMinutes(1); schtasks /create /tn CombatDeploy /tr 'powershell -ExecutionPolicy Bypass -File C:\Users\Administrator\Desktop\combat-engine\server\start-servers.ps1' /sc ONCE /st $t.ToString('HH:mm') /sd $t.ToString('yyyy/MM/dd') /f\""

echo.
echo === Deploy complete ===
echo Servers will restart in ~1 minute via scheduled task.
echo Game: http://120.77.178.15:3000
echo Signaling: ws://120.77.178.15:8088
pause
exit /b 0

:help
echo Usage: deploy.bat [--assets] [--all]
echo   --assets  also push images
echo   --all     same as --assets
pause
exit /b 0
