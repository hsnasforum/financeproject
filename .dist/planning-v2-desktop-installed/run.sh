#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-3100}"
HOST="127.0.0.1"
pnpm dev -- --host "$HOST" --port "$PORT"
