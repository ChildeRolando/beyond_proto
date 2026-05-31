#!/bin/bash
# Deploy combat-engine to cloud server via SCP
# Usage: ./deploy.sh [--assets]
#   (no flag)  Push everything except docs, pics, and test artifacts
#   --assets   Also push assets/ (art/skill-icons/portraits)
#
# Blacklist approach: all code directories and root files are always pushed.
# Only docs, images, and test results are excluded by default.

SERVER="Administrator@120.77.178.15"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_OPTS="-i $SSH_KEY -o IdentitiesOnly=yes"
REMOTE_DIR="C:/Users/Administrator/Desktop/combat-engine"

PUSH_ASSETS=false

for arg in "$@"; do
  case "$arg" in
    --assets) PUSH_ASSETS=true ;;
    --help|-h)
      echo "Usage: ./deploy.sh [--assets]"
      echo "  Push all code to server. Excludes docs, images, and test artifacts."
      echo "  --assets  also push assets/ (art, skill icons, portraits)"
      exit 0
      ;;
  esac
done

# Directories to exclude from deployment
EXCLUDE_DIRS="docs docs_for_human documents pics test-results .git node_modules"
if ! $PUSH_ASSETS; then
  EXCLUDE_DIRS="$EXCLUDE_DIRS assets"
fi

echo "=== Deploying combat-engine to $SERVER ==="
echo "Excluded dirs: $EXCLUDE_DIRS"

# Push each top-level directory (blacklist: skip excluded)
for dir in */; do
  dirname="${dir%/}"
  skip=false
  for ex in $EXCLUDE_DIRS; do
    [ "$dirname" = "$ex" ] && skip=true && break
  done
  if $skip; then
    echo "  skip: $dirname/"
  else
    echo "  push: $dirname/"
    scp $SSH_OPTS -r "$dirname" "$SERVER:$REMOTE_DIR/" 2>&1
  fi
done

# Push all root-level files (*.js, *.json, *.html, *.sh, *.md)
echo "  push: root files"
for f in *; do
  [ -f "$f" ] && scp $SSH_OPTS "$f" "$SERVER:$REMOTE_DIR/" 2>&1
done

# Schedule restart via Task Scheduler (survives SSH disconnect)
ssh $SSH_OPTS $SERVER "powershell -Command \"\$t = (Get-Date).AddMinutes(1); schtasks /create /tn CombatDeploy /tr 'powershell -ExecutionPolicy Bypass -File $REMOTE_DIR\server\start-servers.ps1' /sc ONCE /st \$t.ToString('HH:mm') /sd \$t.ToString('yyyy/MM/dd') /f\"" 2>&1

echo "=== Deploy complete ==="
echo "Servers will restart in ~1 minute via scheduled task."
echo "Game: http://120.77.178.15:3000"
echo "Signaling: ws://120.77.178.15:8088"
