#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROMPT_DIR="$ROOT_DIR/scripts/prompts/multi-agent"
TMP_BASE="$ROOT_DIR/tmp/codex-multi-agent"
LEAD_MODEL="${CODEX_LEAD_MODEL:-gpt-6-astra}"
DEMANDING_MODEL="${CODEX_DEMANDING_MODEL:-gpt-6.1-sol}"
READ_HEAVY_MODEL="${CODEX_READ_HEAVY_MODEL:-gpt-6.1-sol}"

usage() {
  cat <<'EOF'
Usage:
  scripts/run_codex_multi_agent.sh "task summary"
  scripts/run_codex_multi_agent.sh --task "task summary" --session finance-multi
  scripts/run_codex_multi_agent.sh --role-set core "task summary"

Behavior:
  - role-set `full` (explicit only): creates 7 prompt files for lead, planner, researcher, implementer, reviewer, validator, documenter
  - role-set `core` (default): creates 3 prompt files for lead, implementer, validator
  - native mapping: lead=manager, implementer=developer, validator=tester; other names match
  - lead: Astra Ultra
  - implementer/planner/researcher/reviewer/validator/documenter: Sol 6.1 Max
  - subagents are spawned only when independent work justifies the handoff cost
  - planner/researcher/reviewer/documenter keep their native names; analyzer has no CLI role
  - tmux runs independent sessions, not a native subagent tree; nested agents are disabled
  - override model groups with CODEX_LEAD_MODEL, CODEX_DEMANDING_MODEL, CODEX_READ_HEAVY_MODEL
  - optional CODEX_LEAD_EFFORT, CODEX_DEMANDING_EFFORT, CODEX_READ_HEAVY_EFFORT override role efforts
  - If tmux is available, opens a multi-window tmux session with interactive codex runs
  - If tmux is unavailable, prints the codex commands to run manually
EOF
}

TASK=""
SESSION_NAME="finance-multi"
ROLE_SET="core"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)
      TASK="${2:-}"
      shift 2
      ;;
    --session)
      SESSION_NAME="${2:-}"
      shift 2
      ;;
    --role-set)
      ROLE_SET="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$TASK" ]]; then
        TASK="$1"
        shift
      else
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$TASK" ]]; then
  echo "Task summary is required." >&2
  usage >&2
  exit 1
fi

case "$ROLE_SET" in
  full|core)
    ;;
  *)
    echo "Unknown role set: $ROLE_SET" >&2
    echo "Expected one of: full, core" >&2
    exit 1
    ;;
esac

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found in PATH." >&2
  exit 1
fi

mkdir -p "$TMP_BASE"
RUN_DIR="$(mktemp -d "$TMP_BASE/$(date +%Y%m%d-%H%M%S)-XXXXXX")"

build_prompt() {
  local role_file="$1"
  local out_file="$2"

  if [[ ! -f "$role_file" ]]; then
    echo "Prompt file not found: $role_file" >&2
    exit 1
  fi

  {
    cat "$PROMPT_DIR/common.md"
    printf '\n'
    cat "$role_file"
    printf '\n# 이번 작업\n\n'
    printf -- '- 작업 요약: %s\n' "$TASK"
    printf -- '- 작업 디렉터리: %s\n' "$ROOT_DIR"
    printf -- '- 응답은 한국어로 작성한다.\n'
    printf -- '- 현재 작업 범위를 벗어나는 변경은 총괄 기준 또는 사용자 요청 없이는 확정하지 않는다.\n'
  } >"$out_file"
}

CORE_ROLES=(lead implementer validator)
SUPPORT_ROLES=(planner researcher reviewer documenter)
ROLES=("${CORE_ROLES[@]}")

if [[ "$ROLE_SET" == "full" ]]; then
  ROLES+=("${SUPPORT_ROLES[@]}")
fi

for role in "${ROLES[@]}"; do
  build_prompt "$PROMPT_DIR/$role.md" "$RUN_DIR/$role.md"
done

role_model() {
  case "$1" in
    lead) printf '%s' "$LEAD_MODEL" ;;
    researcher|validator|documenter) printf '%s' "$READ_HEAVY_MODEL" ;;
    *) printf '%s' "$DEMANDING_MODEL" ;;
  esac
}

role_effort() {
  case "$1" in
    lead) printf '%s' "${CODEX_LEAD_EFFORT:-ultra}" ;;
    researcher|validator|documenter) printf '%s' "${CODEX_READ_HEAVY_EFFORT:-max}" ;;
    *) printf '%s' "${CODEX_DEMANDING_EFFORT:-max}" ;;
  esac
}

make_cmd() {
  local role="$1"
  local prompt_file="$2"
  local model
  local effort
  model="$(role_model "$role")"
  effort="$(role_effort "$role")"
  printf "cd '%s' && codex -C '%s' --model '%s' -c 'model_reasoning_effort=\"%s\"' -c 'agents.enabled=false' --no-alt-screen \"\$(cat '%s')\"" "$ROOT_DIR" "$ROOT_DIR" "$model" "$effort" "$prompt_file"
}

lead_cmd="$(make_cmd lead "$RUN_DIR/lead.md")"
implementer_cmd="$(make_cmd implementer "$RUN_DIR/implementer.md")"
validator_cmd="$(make_cmd validator "$RUN_DIR/validator.md")"

echo "Prepared prompts:"
for role in "${ROLES[@]}"; do
  echo "  $RUN_DIR/$role.md"
done

if command -v tmux >/dev/null 2>&1; then
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "tmux session '$SESSION_NAME' already exists." >&2
    echo "Use --session with a different name or attach manually." >&2
    exit 1
  fi

  tmux new-session -d -s "$SESSION_NAME" -n core -c "$ROOT_DIR" "$lead_cmd"
  tmux split-window -h -t "$SESSION_NAME:core" -c "$ROOT_DIR" "$implementer_cmd"
  tmux split-window -v -t "$SESSION_NAME:core.1" -c "$ROOT_DIR" "$validator_cmd"
  tmux select-layout -t "$SESSION_NAME:core" tiled >/dev/null

  if [[ "$ROLE_SET" == "full" ]]; then
    planner_cmd="$(make_cmd planner "$RUN_DIR/planner.md")"
    researcher_cmd="$(make_cmd researcher "$RUN_DIR/researcher.md")"
    reviewer_cmd="$(make_cmd reviewer "$RUN_DIR/reviewer.md")"
    documenter_cmd="$(make_cmd documenter "$RUN_DIR/documenter.md")"

    tmux new-window -t "$SESSION_NAME" -n support -c "$ROOT_DIR" "$planner_cmd"
    tmux split-window -h -t "$SESSION_NAME:support" -c "$ROOT_DIR" "$researcher_cmd"
    tmux split-window -v -t "$SESSION_NAME:support.0" -c "$ROOT_DIR" "$reviewer_cmd"
    tmux split-window -v -t "$SESSION_NAME:support.1" -c "$ROOT_DIR" "$documenter_cmd"
    tmux select-layout -t "$SESSION_NAME:support" tiled >/dev/null
  fi

  tmux select-window -t "$SESSION_NAME:core"

  echo
  echo "tmux session created: $SESSION_NAME (role-set: $ROLE_SET)"
  echo "Attach with:"
  echo "  tmux attach -t $SESSION_NAME"
  if [[ "$ROLE_SET" == "full" ]]; then
    echo "Windows:"
    echo "  core: lead / implementer / validator"
    echo "  support: planner / researcher / reviewer / documenter"
  fi
  exit 0
fi

echo
echo "tmux not found. Run these commands manually:"
echo

for role in "${ROLES[@]}"; do
  echo "[$role]"
  echo "$(make_cmd "$role" "$RUN_DIR/$role.md")"
  echo
done
