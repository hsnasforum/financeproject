#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env.local ] && [ -f .env.local.example ]; then
  cp .env.local.example .env.local
fi
pnpm install --frozen-lockfile
printf "[planning:v2:desktop] install complete\n"
