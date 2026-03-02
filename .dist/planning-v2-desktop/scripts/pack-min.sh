#!/usr/bin/env bash
set -euo pipefail

echo "안내: pack-min.sh는 호환용 래퍼입니다. pack-share.sh 사용을 권장합니다."
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pack-share.sh" --mode paths "$@"
