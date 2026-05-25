# Start combat-engine servers detached from current session
$nodePath = "C:\Program Files\nodejs\node.exe"
$workDir = "C:\Users\Administrator\Desktop\combat-engine"

# Kill any existing node processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force

# Start servers
Start-Process -FilePath $nodePath -ArgumentList "server/signaling.js","8088" -WorkingDirectory $workDir
Start-Process -FilePath $nodePath -ArgumentList "server/static.js","3000" -WorkingDirectory $workDir

Write-Host "Servers started."
