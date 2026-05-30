#!/bin/bash
# Deploy combat-engine to cloud server via SCP
# Usage: ./deploy.sh [--assets] [--all]
#   (no flag)  Push code only (fast — skips images)
#   --assets    Also push assets/skill-icons/
#   --all       Push everything including assets/

SERVER="Administrator@120.77.178.15"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_OPTS="-i $SSH_KEY -o IdentitiesOnly=yes"
REMOTE_DIR="C:/Users/Administrator/Desktop/combat-engine"

PUSH_ASSETS=false

for arg in "$@"; do
  case "$arg" in
    --assets|--all) PUSH_ASSETS=true ;;
    --help|-h) echo "Usage: ./deploy.sh [--assets] [--all]"; echo "  --assets  also push images"; exit 0 ;;
  esac
done

echo "=== Deploying combat-engine to $SERVER ==="
echo "Code files: engine/ server/ ui/ session/ index.html package.json main.js styles/"
if $PUSH_ASSETS; then
  echo "Assets:     assets/ (included)"
else
  echo "Assets:     skipped (use --assets to include)"
fi

# Always push code files (small, change frequently)
scp $SSH_OPTS -r engine server ui session index.html package.json main.js styles "$SERVER:$REMOTE_DIR/" 2>&1

# Assets are large images that rarely change — only push when asked
if $PUSH_ASSETS; then
  scp $SSH_OPTS -r assets "$SERVER:$REMOTE_DIR/" 2>&1
fi

# Schedule restart via Task Scheduler (survives SSH disconnect)
ssh $SSH_OPTS $SERVER "powershell -Command \"\$t = (Get-Date).AddMinutes(1); schtasks /create /tn CombatDeploy /tr 'powershell -ExecutionPolicy Bypass -File $REMOTE_DIR\server\start-servers.ps1' /sc ONCE /st \$t.ToString('HH:mm') /sd \$t.ToString('yyyy/MM/dd') /f\"" 2>&1

echo "=== Deploy complete ==="
echo "Servers will restart in ~1 minute via scheduled task."
echo "Game: http://120.77.178.15:3000"
echo "Signaling: ws://120.77.178.15:8088"
