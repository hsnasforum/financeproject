#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-3100}"
export PLANNING_PACKAGED_MODE="1"
export PLANNING_RUNTIME_MODE="packaged"
export PLANNING_APP_NAME="${PLANNING_APP_NAME:-PlanningV2}"
node scripts/planning_v2_desktop_launch.mjs --runtime prod --port "$PORT" --path "/planning"
