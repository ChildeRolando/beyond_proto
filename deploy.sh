#!/usr/bin/env bash
# Deploy combat-engine to the Windows cloud server.
#
# Safer than the old git-diff + deploy-marker delta deploy:
# - does not rely on remote marker state
# - includes assets/ by default
# - stages files locally, uploads once, then publishes on the server
#
# Usage:
#   ./deploy.sh [--dry-run] [--skip-restart] [--pause] [--no-assets]
#
# Run from Git Bash on Windows. If cmd.exe resolves `bash` to WSL, use:
#   "C:\Program Files\Git\bin\bash.exe" -lc "cd /f/Beyond/combat-engine && ./deploy.sh"

set -euo pipefail

SERVER="${DEPLOY_SERVER:-Administrator@120.77.178.15}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-C:/Users/Administrator/Desktop/combat-engine}"

SSH_BIN="${DEPLOY_SSH_BIN:-ssh}"
SCP_BIN="${DEPLOY_SCP_BIN:-scp}"
DEPLOY_DRY_RUN="${DEPLOY_DRY_RUN:-false}"
DEPLOY_SKIP_RESTART="${DEPLOY_SKIP_RESTART:-false}"
DEPLOY_PAUSE_ON_EXIT="${DEPLOY_PAUSE_ON_EXIT:-false}"
INCLUDE_ASSETS=true

SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes)
STAGE_DIR=""
REMOTE_STAGE=""

usage() {
  cat <<'USAGE'
Usage: ./deploy.sh [--dry-run] [--skip-restart] [--pause] [--no-assets]

Options:
  --dry-run        Print what would be deployed; do not ssh/scp.
  --skip-restart   Upload files but do not schedule server restart.
  --pause          Wait for Enter before exiting.
  --no-assets      Exclude assets/. Not recommended when icons/portraits changed.

Backward-compatible flags:
  --assets         Accepted; assets are now included by default.
  --full           Accepted; deploy is always manifest-based full publish.
USAGE
}

die() {
  echo "Error: $*" >&2
  exit 1
}

on_exit() {
  local code=$?
  if [ -n "${STAGE_DIR:-}" ] && [ -d "$STAGE_DIR" ]; then
    rm -rf "$STAGE_DIR"
  fi

  echo ""
  echo "=== deploy.sh exited with code $code ==="
  if [ "$code" -ne 0 ]; then
    echo "Deploy failed. Check the error above."
  fi

  if [ "$DEPLOY_PAUSE_ON_EXIT" = "true" ]; then
    read -r -p "Press Enter to close..." || true
  fi
}
trap on_exit EXIT

for arg in "$@"; do
  case "$arg" in
    --assets|--full)
      # Kept for old muscle memory. Assets are included by default; deploy is full-staged.
      ;;
    --no-assets)
      INCLUDE_ASSETS=false
      ;;
    --dry-run)
      DEPLOY_DRY_RUN=true
      ;;
    --skip-restart)
      DEPLOY_SKIP_RESTART=true
      ;;
    --pause)
      DEPLOY_PAUSE_ON_EXIT=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage
      die "unknown argument: $arg"
      ;;
  esac
done

ps_quote() {
  local escaped
  escaped=$(printf '%s' "$1" | sed "s/'/''/g")
  printf "'%s'" "$escaped"
}

run_ssh() {
  if [ "$DEPLOY_DRY_RUN" = "true" ]; then
    echo "[dry-run] ssh $SERVER $*"
    return 0
  fi
  "$SSH_BIN" "${SSH_OPTS[@]}" "$SERVER" "$@"
}

run_scp_recursive() {
  local local_path="$1"
  local remote_path="$2"

  if [ "$DEPLOY_DRY_RUN" = "true" ]; then
    echo "[dry-run] scp -r $local_path $SERVER:$remote_path"
    return 0
  fi

  "$SCP_BIN" "${SSH_OPTS[@]}" -r "$local_path" "$SERVER:$remote_path"
}

ps_encode() {
  command -v iconv >/dev/null 2>&1 || die "iconv is not available in PATH"
  command -v base64 >/dev/null 2>&1 || die "base64 is not available in PATH"
  printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\r\n'
}

remote_exec_ps() {
  local script="$1"
  local encoded
  encoded=$(ps_encode "\$ProgressPreference='SilentlyContinue'; $script")
  run_ssh "powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
}

schedule_restart() {
  if [ "$DEPLOY_SKIP_RESTART" = "true" ]; then
    echo "Restart scheduling skipped."
    return 0
  fi

  remote_exec_ps "\$t = (Get-Date).AddMinutes(1); schtasks /create /tn CombatDeploy /tr 'powershell -ExecutionPolicy Bypass -File $REMOTE_DIR\server\start-servers.ps1' /sc ONCE /st \$t.ToString('HH:mm') /sd \$t.ToString('yyyy/MM/dd') /f"
}

exclude_path() {
  local path="$1"
  case "$path" in
    .git/*|.github/*|.claude/*|.agents/*|node_modules/*|test-results/*|playwright-report/*)
      return 0
      ;;
    docs/*|docs_for_human/*|documents/*|pics/*)
      return 0
      ;;
    tests/*|*_out.txt|deploy.log|deploy-dry.log|ngrok.exe)
      return 0
      ;;
    assets/*)
      if [ "$INCLUDE_ASSETS" != "true" ]; then
        return 0
      fi
      ;;
  esac
  return 1
}

collect_manifest() {
  git ls-files --cached --others --exclude-standard | while IFS= read -r path; do
    [ -n "$path" ] || continue
    if ! exclude_path "$path" && [ -f "$path" ]; then
      printf '%s\n' "$path"
    fi
  done | awk '!seen[$0]++'
}

copy_manifest_to_stage() {
  local manifest="$1"

  while IFS= read -r path; do
    [ -n "$path" ] || continue
    mkdir -p "$STAGE_DIR/$(dirname "$path")"
    cp -p "$path" "$STAGE_DIR/$path"
  done <<< "$manifest"
}

remote_prepare_stage() {
  local remote_stage_q remote_dir_q
  remote_stage_q=$(ps_quote "$REMOTE_STAGE")
  remote_dir_q=$(ps_quote "$REMOTE_DIR")

  remote_exec_ps "\
New-Item -ItemType Directory -Force -Path $remote_dir_q | ForEach-Object { \$null }; \
Remove-Item -Recurse -Force -Path $remote_stage_q -ErrorAction SilentlyContinue; \
New-Item -ItemType Directory -Force -Path $remote_stage_q | ForEach-Object { \$null }"
}

remote_publish_stage() {
  local remote_stage_q remote_dir_q
  remote_stage_q=$(ps_quote "$REMOTE_STAGE")
  remote_dir_q=$(ps_quote "$REMOTE_DIR")

  remote_exec_ps "\
\$remote = $remote_dir_q; \
\$stage = $remote_stage_q; \
\$dirs = @('app','assets','engine','network','server','session','styles','tutorial','ui'); \
foreach (\$d in \$dirs) { Remove-Item -Recurse -Force -Path (Join-Path \$remote \$d) -ErrorAction SilentlyContinue }; \
\$files = @('index.html','main.js','package.json','package-lock.json','playwright.config.js'); \
foreach (\$f in \$files) { Remove-Item -Force -Path (Join-Path \$remote \$f) -ErrorAction SilentlyContinue }; \
Get-ChildItem -Path \$stage -Force | Copy-Item -Destination \$remote -Recurse -Force; \
Remove-Item -Recurse -Force -Path \$stage -ErrorAction SilentlyContinue"
}

line_count() {
  local text="$1"
  if [ -z "$text" ]; then
    echo 0
  else
    printf '%s\n' "$text" | wc -l | tr -d ' '
  fi
}

require_tools() {
  command -v git >/dev/null 2>&1 || die "git is not available in PATH"
  command -v awk >/dev/null 2>&1 || die "awk is not available in PATH"
  command -v cp >/dev/null 2>&1 || die "cp is not available in PATH"
  command -v iconv >/dev/null 2>&1 || die "iconv is not available in PATH"
  command -v base64 >/dev/null 2>&1 || die "base64 is not available in PATH"
  command -v "$SSH_BIN" >/dev/null 2>&1 || die "$SSH_BIN is not available in PATH"
  command -v "$SCP_BIN" >/dev/null 2>&1 || die "$SCP_BIN is not available in PATH"
  [ -f "$SSH_KEY" ] || die "SSH key not found: $SSH_KEY"
}

echo "=== Deploying combat-engine to $SERVER ==="
echo "Mode: staged manifest sync"
echo "Remote dir: $REMOTE_DIR"
echo "Dry run: $DEPLOY_DRY_RUN"
echo "Include assets: $INCLUDE_ASSETS"
echo "Skip restart: $DEPLOY_SKIP_RESTART"
echo "SSH key: $SSH_KEY"
echo ""

require_tools

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not a git repository"
CURRENT_HASH=$(git rev-parse HEAD 2>/dev/null) || die "no commits found"
echo "Current HEAD: ${CURRENT_HASH:0:7}"

MANIFEST=$(collect_manifest)
COUNT=$(line_count "$MANIFEST")
[ "$COUNT" -gt 0 ] || die "deploy manifest is empty"

echo "Files to publish: $COUNT"
printf '%s\n' "$MANIFEST" | sed 's/^/  /'
echo ""

if [ "$INCLUDE_ASSETS" != "true" ]; then
  ASSET_CHANGES=$(git ls-files --cached --others --exclude-standard assets 2>/dev/null || true)
  if [ -n "$ASSET_CHANGES" ]; then
    echo "Warning: assets/ is excluded by --no-assets. Runtime icons/portraits may be stale."
  fi
fi

if [ "$DEPLOY_DRY_RUN" = "true" ]; then
  echo "Dry run complete; no files uploaded."
  exit 0
fi

STAGE_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t combat-deploy)
REMOTE_STAGE="${REMOTE_DIR}.__incoming_${CURRENT_HASH:0:7}_$(date +%Y%m%d%H%M%S)"

echo "Building local stage: $STAGE_DIR"
copy_manifest_to_stage "$MANIFEST"

echo "Preparing remote stage: $REMOTE_STAGE"
remote_prepare_stage

upload_stage_contents() {
  local item
  local uploaded=false

  for item in "$STAGE_DIR"/* "$STAGE_DIR"/.[!.]* "$STAGE_DIR"/..?*; do
    [ -e "$item" ] || continue
    uploaded=true
    echo "  upload: $(basename "$item")"
    run_scp_recursive "$item" "$REMOTE_STAGE/" || die "failed to upload staged item: $item"
  done

  if [ "$uploaded" != "true" ]; then
    die "local stage is empty: $STAGE_DIR"
  fi
}
echo "Uploading staged bundle..."
upload_stage_contents

echo "Publishing staged bundle..."
remote_publish_stage || die "failed to publish staged bundle"

echo "Scheduling restart..."
schedule_restart || die "failed to schedule server restart"

echo ""
echo "=== Deploy complete ($COUNT files published) ==="
echo "Servers will restart in ~1 minute."
echo "Game:      http://120.77.178.15:3000"
echo "Signaling: ws://120.77.178.15:8088"
echo ""
sleep 3