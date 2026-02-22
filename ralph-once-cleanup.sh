#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_FILE="$ROOT_DIR/tasks/cleanup.md"
STATE_DIR="$ROOT_DIR/.ralph"
LAST_MSG_FILE="$STATE_DIR/cleanup-last-message.txt"
AGENT_CMD="${AGENT_CMD:-co}"

mkdir -p "$STATE_DIR"

if [[ ! -f "$TASK_FILE" ]]; then
  echo "Task file not found: $TASK_FILE" >&2
  exit 1
fi

resolve_agent_cmd() {
  if command -v "$AGENT_CMD" >/dev/null 2>&1; then
    echo "$AGENT_CMD"
    return 0
  fi

  if [[ "$AGENT_CMD" == "co" ]] && command -v codex >/dev/null 2>&1; then
    echo "codex"
    return 0
  fi

  return 1
}

AGENT_BIN="$(resolve_agent_cmd || true)"
if [[ -z "$AGENT_BIN" ]]; then
  echo "Could not find agent command '$AGENT_CMD' (or fallback 'codex')." >&2
  exit 1
fi

PROMPT=$(cat <<'PROMPT_EOF'
You are Ralph, a focused implementation loop agent.

Primary objective:
- Work through tasks in tasks/cleanup.md until all tasks are DONE or BLOCKED.

Execution policy per run:
1. Read tasks/cleanup.md.
2. Select exactly one highest-priority task with status TODO (or resume one IN_PROGRESS task).
3. Understand the issue, avoid blindly beleive but rather research and find how to properly fix the pain.
4. Run targeted validation for changed code (typecheck/lint/tests only as needed for the slice).
5. Update tasks/cleanup.md:
   - Set chosen task to IN_PROGRESS when starting.
   - Set to DONE when acceptance criteria are met and commit changes.
   - Set to BLOCKED with a short blocker note if you cannot continue.
   - Add one short Progress Log entry with date and what changed.

Guardrails:
- Keep changes small and reversible.
- Follow repository instructions in AGENTS.md.
- Do not rewrite unrelated areas.

Stop condition:
- If no TODO or IN_PROGRESS tasks remain, respond with exactly:
No further action needed at this time.
PROMPT_EOF
)

printf '%s\n' "$PROMPT" | "$AGENT_BIN" exec \
  --cd "$ROOT_DIR" \
  --dangerously-bypass-approvals-and-sandbox \
  --output-last-message "$LAST_MSG_FILE" \
  -

echo "Saved final agent message to: $LAST_MSG_FILE"
