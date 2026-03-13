#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${REPO_DIR}/.data/planning/ops/logs"
SCHEDULER_EVENT_LOG="${LOG_DIR}/scheduler.ndjson"

mkdir -p "${LOG_DIR}"
touch "${SCHEDULER_EVENT_LOG}"

NODE_BIN_DIR_DEFAULT="${HOME}/.nvm/versions/node/v22.22.0/bin"
NODE_BIN_DIR="${NODE_BIN_DIR:-${NODE_BIN_DIR_DEFAULT}}"
export PATH="${NODE_BIN_DIR}:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

PNPM_BIN="${PNPM_BIN:-pnpm}"
MODE="${1:-weekly}"

run_cmd() {
  local cmd="$1"
  bash -lc "cd '${REPO_DIR}' && ${cmd}"
}

iso_now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

json_escape() {
  local raw="$1"
  raw="${raw//\\/\\\\}"
  raw="${raw//\"/\\\"}"
  raw="${raw//$'\n'/\\n}"
  raw="${raw//$'\r'/\\r}"
  raw="${raw//$'\t'/\\t}"
  printf '%s' "${raw}"
}

append_scheduler_event() {
  local mode="$1"
  local ok="$2"
  local exit_code="$3"
  local started_at="$4"
  local ended_at="$5"
  local message="$6"
  local host_name
  host_name="$(hostname 2>/dev/null || echo "unknown")"
  printf '{"ts":"%s","mode":"%s","ok":%s,"exitCode":%s,"startedAt":"%s","endedAt":"%s","host":"%s","message":"%s"}\n' \
    "$(iso_now_utc)" \
    "$(json_escape "${mode}")" \
    "${ok}" \
    "${exit_code}" \
    "$(json_escape "${started_at}")" \
    "$(json_escape "${ended_at}")" \
    "$(json_escape "${host_name}")" \
    "$(json_escape "${message}")" \
    >> "${SCHEDULER_EVENT_LOG}"
}

run_mode() {
  case "${MODE}" in
    weekly)
      run_cmd "${PNPM_BIN} planning:v2:ops:safety:weekly" >> "${LOG_DIR}/ops.log" 2>> "${LOG_DIR}/ops.err"
      ;;
    regress)
      run_cmd "${PNPM_BIN} planning:v2:ops:safety:regress" >> "${LOG_DIR}/ops.log" 2>> "${LOG_DIR}/ops.err"
      ;;
    monthly)
      run_cmd "${PNPM_BIN} ops:refresh-assumptions" >> "${LOG_DIR}/monthly.log" 2>> "${LOG_DIR}/monthly.err"
      run_cmd "${PNPM_BIN} planning:run:monthly" >> "${LOG_DIR}/monthly.log" 2>> "${LOG_DIR}/monthly.err"
      ;;
    prune)
      run_cmd "${PNPM_BIN} planning:v2:ops:prune --keep=50" >> "${LOG_DIR}/ops.log" 2>> "${LOG_DIR}/ops.err"
      ;;
    *)
      echo "unknown mode: ${MODE}" >&2
      echo "supported: weekly | regress | monthly | prune" >&2
      return 2
      ;;
  esac
}

run_health_guard() {
  run_cmd "${PNPM_BIN} planning:v2:ops:scheduler:health" >> "${LOG_DIR}/scheduler.log" 2>> "${LOG_DIR}/scheduler.err"
}

STARTED_AT="$(iso_now_utc)"
EXIT_CODE=0
MESSAGE="completed"
if ! run_mode; then
  EXIT_CODE=$?
  MESSAGE="failed"
fi
ENDED_AT="$(iso_now_utc)"

if [ "${EXIT_CODE}" -eq 0 ]; then
  append_scheduler_event "${MODE}" true "${EXIT_CODE}" "${STARTED_AT}" "${ENDED_AT}" "${MESSAGE}"
  run_health_guard || true
  exit 0
fi

append_scheduler_event "${MODE}" false "${EXIT_CODE}" "${STARTED_AT}" "${ENDED_AT}" "${MESSAGE}"
run_health_guard || true
if command -v notify-send >/dev/null 2>&1; then
  notify-send "MMD OPS Scheduler 실패" "mode=${MODE} exit=${EXIT_CODE}" >/dev/null 2>&1 || true
fi
exit "${EXIT_CODE}"
