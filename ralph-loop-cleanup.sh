#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONCE_SCRIPT="$ROOT_DIR/tasks/ralph-once-cleanup.sh"
STATE_DIR="$ROOT_DIR/.ralph"
LAST_MSG_FILE="$STATE_DIR/cleanup-last-message.txt"
MAX_PASSES="${MAX_PASSES:-50}"

mkdir -p "$STATE_DIR"

if [[ ! -x "$ONCE_SCRIPT" ]]; then
  echo "Expected executable script at: $ONCE_SCRIPT" >&2
  exit 1
fi

for ((pass = 1; pass <= MAX_PASSES; pass += 1)); do
  echo "[ralph-loop] Pass $pass/$MAX_PASSES"
  "$ONCE_SCRIPT"

  if [[ -f "$LAST_MSG_FILE" ]] && grep -Fq "No further action needed at this time." "$LAST_MSG_FILE"; then
    echo "[ralph-loop] Cleanup backlog complete."
    exit 0
  fi

  echo "[ralph-loop] Pass $pass complete. Continuing..."
done

echo "[ralph-loop] Reached MAX_PASSES=$MAX_PASSES without completion signal."
exit 1
