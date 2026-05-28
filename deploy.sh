#!/bin/bash
# Deploy combat-engine to cloud server via SCP
SERVER="Administrator@120.77.178.15"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_OPTS="-i $SSH_KEY -o IdentitiesOnly=yes"
REMOTE_DIR="C:/Users/Administrator/Desktop/combat-engine"

echo "=== Deploying combat-engine to $SERVER ==="

# Upload files
scp $SSH_OPTS -r engine server assets index.html package.json "$SERVER:$REMOTE_DIR/" 2>&1

# Schedule restart via Task Scheduler (survives SSH disconnect)
ssh $SSH_OPTS $SERVER "powershell -Command \"\$t = (Get-Date).AddMinutes(1); schtasks /create /tn CombatDeploy /tr 'powershell -ExecutionPolicy Bypass -File $REMOTE_DIR\server\start-servers.ps1' /sc ONCE /st \$t.ToString('HH:mm') /sd \$t.ToString('yyyy/MM/dd') /f\"" 2>&1

echo "=== Deploy complete ==="
echo "Servers will restart in ~1 minute via scheduled task."
echo "Game: http://120.77.178.15:3000"
echo "Signaling: ws://120.77.178.15:8088"
