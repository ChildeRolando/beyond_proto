#!/usr/bin/env bash
# Deploy combat-engine to cloud server via SCP.
# Usage: ./deploy.sh [--assets] [--full]
#   (no flag)  Push only deployable files changed since last deploy.
#   --assets   Also push assets/ (art/skill-icons/portraits).
#   --full     Push all deployable files, ignoring the deploy marker.
#
# The server-side .deploy-marker stores the last deployed commit hash. Delta mode
# combines committed changes since that marker with local staged/unstaged changes
# and untracked files, preserving the old "deploy current working tree" behavior.

set -euo pipefail

SERVER="${DEPLOY_SERVER:-Administrator@120.77.178.15}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-C:/Users/Administrator/Desktop/combat-engine}"
MARKER_FILE="$REMOTE_DIR/.deploy-marker"

SSH_BIN="${DEPLOY_SSH_BIN:-ssh}"
SCP_BIN="${DEPLOY_SCP_BIN:-scp}"
DEPLOY_DRY_RUN="${DEPLOY_DRY_RUN:-false}"
DEPLOY_SKIP_RESTART="${DEPLOY_SKIP_RESTART:-false}"
DEPLOY_LAST_HASH="${DEPLOY_LAST_HASH:-}"

SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes)

PUSH_ASSETS=false
FORCE_FULL=false

usage() {
  echo "Usage: ./deploy.sh [--assets] [--full]"
  echo "  Push changed files to server via git diff + scp."
  echo "  --assets  also push assets/ (art, skill icons, portraits)"
  echo "  --full    force full deploy (ignore deploy marker)"
}

die() {
  echo "Error: $*" >&2
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --assets) PUSH_ASSETS=true ;;
    --full) FORCE_FULL=true ;;
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

exclude_path() {
  case "$1" in
    docs/*|docs_for_human/*|documents/*|pics/*|test-results/*|.git/*|.claude/*|node_modules/*|ngrok.exe)
      return 0
      ;;
    assets/*)
      if ! $PUSH_ASSETS; then
        return 0
      fi
      ;;
  esac
  return 1
}

filter_paths() {
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if ! exclude_path "$path"; then
      printf '%s\n' "$path"
    fi
  done
}

unique_paths() {
  filter_paths | awk '!seen[$0]++'
}

line_count() {
  local text="$1"
  if [ -z "$text" ]; then
    echo 0
  else
    printf '%s\n' "$text" | wc -l | tr -d ' '
  fi
}

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

run_scp() {
  local local_path="$1"
  local remote_path="$2"

  if [ "$DEPLOY_DRY_RUN" = "true" ]; then
    echo "[dry-run] scp $local_path $SERVER:$remote_path"
    return 0
  fi
  "$SCP_BIN" "${SSH_OPTS[@]}" "$local_path" "$SERVER:$remote_path"
}

read_deploy_marker() {
  if [ -n "$DEPLOY_LAST_HASH" ]; then
    printf '%s\n' "$DEPLOY_LAST_HASH"
    return 0
  fi

  "$SSH_BIN" "${SSH_OPTS[@]}" "$SERVER" "type \"$MARKER_FILE\" 2>nul" 2>/dev/null | head -1
}

remote_mkdir() {
  local path="$1"
  local quoted
  quoted=$(ps_quote "$path")
  run_ssh "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -LiteralPath $quoted | Out-Null\""
}

remote_rm() {
  local path="$1"
  local quoted
  quoted=$(ps_quote "$path")
  run_ssh "powershell -NoProfile -Command \"Remove-Item -Force -LiteralPath $quoted -ErrorAction SilentlyContinue\""
}

remote_set_marker() {
  local quoted
  quoted=$(ps_quote "$MARKER_FILE")
  run_ssh "powershell -NoProfile -Command \"Set-Content -LiteralPath $quoted -Value '$CURRENT_HASH' -NoNewline\""
}

schedule_restart() {
  if [ "$DEPLOY_SKIP_RESTART" = "true" ]; then
    echo "Restart scheduling skipped."
    return 0
  fi

  run_ssh "powershell -NoProfile -Command \"\$t = (Get-Date).AddMinutes(1); schtasks /create /tn CombatDeploy /tr 'powershell -ExecutionPolicy Bypass -File $REMOTE_DIR\server\start-servers.ps1' /sc ONCE /st \$t.ToString('HH:mm') /sd \$t.ToString('yyyy/MM/dd') /f\""
}

git_paths() {
  git "$@"
}

diff_uploads() {
  git_paths diff -M --name-only --diff-filter=ACMRTUXB "$@"
}

diff_deletes() {
  git_paths diff -M --name-only --diff-filter=D "$@"
  git_paths diff -M --name-status --diff-filter=R "$@" | awk -F '\t' '{ print $2 }'
}

echo "=== Deploying combat-engine to $SERVER ==="

command -v git >/dev/null 2>&1 || die "git is not available in PATH"
command -v awk >/dev/null 2>&1 || die "awk is not available in PATH"

CURRENT_HASH=$(git rev-parse HEAD 2>/dev/null) || die "not a git repository or no commits"

if $FORCE_FULL; then
  echo "Mode: FULL (--full flag)"
  UPLOAD_FILES=$(git_paths ls-files --cached --others --exclude-standard | unique_paths)
  DELETE_FILES=""
  LAST_HASH=""
else
  RAW_LAST_HASH=$(read_deploy_marker | tr -d '\r' || true)
  LAST_HASH=$(printf '%s\n' "$RAW_LAST_HASH" | grep -E '^[0-9a-f]{7,40}$' | head -1 || true)

  if [ -n "$LAST_HASH" ] && git cat-file -e "$LAST_HASH" 2>/dev/null; then
    echo "Last deployed: ${LAST_HASH:0:7}"
    echo "Current HEAD:  ${CURRENT_HASH:0:7}"

    COMMITTED_UPLOADS=$(diff_uploads "$LAST_HASH" HEAD)
    COMMITTED_DELETES=$(diff_deletes "$LAST_HASH" HEAD)
  else
    echo "Mode: FULL (no deploy marker or marker invalid)"
    COMMITTED_UPLOADS=$(git_paths ls-files --cached)
    COMMITTED_DELETES=""
    LAST_HASH=""
  fi

  WORKTREE_UPLOADS=$(
    {
      diff_uploads HEAD
      diff_uploads --cached HEAD
      git_paths ls-files --others --exclude-standard
    } | unique_paths
  )
  WORKTREE_DELETES=$(
    {
      diff_deletes HEAD
      diff_deletes --cached HEAD
    } | unique_paths
  )

  UPLOAD_FILES=$(
    {
      printf '%s\n' "$COMMITTED_UPLOADS"
      printf '%s\n' "$WORKTREE_UPLOADS"
    } | unique_paths
  )
  DELETE_FILES=$(
    {
      printf '%s\n' "$COMMITTED_DELETES"
      printf '%s\n' "$WORKTREE_DELETES"
    } | unique_paths
  )
fi

UPLOAD_COUNT=$(line_count "$UPLOAD_FILES")
DELETE_COUNT=$(line_count "$DELETE_FILES")

if [ "$UPLOAD_COUNT" -eq 0 ] && [ "$DELETE_COUNT" -eq 0 ]; then
  echo "No deployable file changes."
  if [ -n "${LAST_HASH:-}" ] && [ "$LAST_HASH" != "$CURRENT_HASH" ]; then
    echo "Updating deploy marker to ${CURRENT_HASH:0:7}."
    remote_set_marker || die "failed to update deploy marker"
  fi
  exit 0
fi

echo "Files to push: $UPLOAD_COUNT"
if [ "$UPLOAD_COUNT" -gt 0 ]; then
  printf '%s\n' "$UPLOAD_FILES" | while IFS= read -r path; do
    [ -n "$path" ] && echo "  $path"
  done
fi

if [ "$DELETE_COUNT" -gt 0 ]; then
  echo "Files to remove: $DELETE_COUNT"
  printf '%s\n' "$DELETE_FILES" | while IFS= read -r path; do
    [ -n "$path" ] && echo "  $path"
  done
fi

while IFS= read -r path; do
  [ -n "$path" ] || continue
  if [ ! -f "$path" ]; then
    die "upload candidate is missing locally: $path"
  fi

  parent=$(dirname "$path")
  if [ "$parent" = "." ]; then
    remote_parent="$REMOTE_DIR"
  else
    remote_parent="$REMOTE_DIR/$parent"
  fi

  remote_mkdir "$remote_parent" || die "failed to create remote directory: $remote_parent"
  echo "  upload: $path"
  run_scp "$path" "$REMOTE_DIR/$path" || die "failed to upload: $path"
done <<< "$UPLOAD_FILES"

while IFS= read -r path; do
  [ -n "$path" ] || continue
  echo "  remove: $path"
  remote_rm "$REMOTE_DIR/$path" || die "failed to remove remote file: $path"
done <<< "$DELETE_FILES"

schedule_restart || die "failed to schedule server restart"
remote_set_marker || die "failed to update deploy marker"

echo ""
echo "=== Deploy complete ($UPLOAD_COUNT uploaded, $DELETE_COUNT removed) ==="
echo "Servers will restart in ~1 minute."
echo "Game:      http://120.77.178.15:3000"
echo "Signaling: ws://120.77.178.15:8088"
echo ""
echo "窗口将在5秒后关闭..."
sleep 5
