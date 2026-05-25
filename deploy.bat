@echo off
echo === Deploying combat-engine to cloud server ===
echo.

REM Kill running servers
ssh -i "%USERPROFILE%\.ssh\id_ed25519" -o IdentitiesOnly=yes Administrator@120.77.178.15 "taskkill /f /im node.exe" 2>nul

REM Upload files
scp -i "%USERPROFILE%\.ssh\id_ed25519" -o IdentitiesOnly=yes -r engine server index.html package.json Administrator@120.77.178.15:"C:/Users/Administrator/Desktop/combat-engine/"

REM Start servers (Start-Process detaches from SSH session)
ssh -i "%USERPROFILE%\.ssh\id_ed25519" -o IdentitiesOnly=yes Administrator@120.77.178.15 "powershell -Command ""Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'server/signaling.js','8088' -WorkingDirectory 'C:\Users\Administrator\Desktop\combat-engine'"" && powershell -Command ""Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'server/static.js','3000' -WorkingDirectory 'C:\Users\Administrator\Desktop\combat-engine'"""

echo.
echo === Deploy complete ===
echo Game: http://120.77.178.15:3000
echo Signaling: ws://120.77.178.15:8088
pause
