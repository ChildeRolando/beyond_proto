#!/bin/bash
# Deploy combat-engine to cloud server via SCP
SERVER="Administrator@120.77.178.15"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_OPTS="-i $SSH_KEY -o IdentitiesOnly=yes"
REMOTE_DIR="C:/Users/Administrator/Desktop/combat-engine"

echo "=== Deploying combat-engine to $SERVER ==="

# Kill running servers
ssh $SSH_OPTS $SERVER 'taskkill /f /im node.exe 2>&1' || true

# Upload files
scp $SSH_OPTS -r engine server index.html package.json "$SERVER:$REMOTE_DIR/" 2>&1

# Start servers (Start-Process detaches from SSH session)
ssh $SSH_OPTS $SERVER "powershell -Command \"Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'server/signaling.js','8088' -WorkingDirectory '$REMOTE_DIR'\" && powershell -Command \"Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'server/static.js','3000' -WorkingDirectory '$REMOTE_DIR'\"" 2>&1

echo "=== Deploy complete ==="
echo "Game: http://120.77.178.15:3000"
echo "Signaling: ws://120.77.178.15:8088"
