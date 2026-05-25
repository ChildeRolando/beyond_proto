@echo off
echo === Deploying combat-engine to cloud server ===
echo.

REM Upload files
scp -i "%USERPROFILE%\.ssh\id_ed25519" -o IdentitiesOnly=yes -r engine server index.html package.json Administrator@120.77.178.15:"C:/Users/Administrator/Desktop/combat-engine/"

REM Schedule restart via Task Scheduler (survives SSH disconnect)
ssh -i "%USERPROFILE%\.ssh\id_ed25519" -o IdentitiesOnly=yes Administrator@120.77.178.15 "powershell -Command \"$t = (Get-Date).AddMinutes(1); schtasks /create /tn CombatDeploy /tr 'powershell -ExecutionPolicy Bypass -File C:\Users\Administrator\Desktop\combat-engine\server\start-servers.ps1' /sc ONCE /st $t.ToString('HH:mm') /sd $t.ToString('yyyy/MM/dd') /f\""

echo.
echo === Deploy complete ===
echo Servers will restart in ~1 minute via scheduled task.
echo Game: http://120.77.178.15:3000
echo Signaling: ws://120.77.178.15:8088
pause
