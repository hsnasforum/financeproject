# 2026-05-25 WSL localhost bridge skip 처리

## 변경 파일
- `scripts/next_dev_safe.mjs`
- `tests/next-dev-safe-bridge-status.test.ts`
- `docs/windows.md`
- `docs/planning-v2-setup-playbook.md`
- `docs/dart-rules-quality-report.md`
- `docs/data-freshness-report.md`
- `docs/schema-drift-report.md`
- `work/5/25/2026-05-25-wsl-localhost-bridge-skip.md`

## 사용 skill
- `planning-gate-selector`: Next dev launcher 변경에 필요한 `node --check`, focused test, lint, typecheck, smoke, verify, build 게이트를 고르는 데 사용했습니다.
- `work-log-closeout`: 실제 실행한 명령과 결과만 기준으로 이번 라운드 종료 기록을 남기는 데 사용했습니다.

## 변경 이유
- WSL 환경에서 `powershell.exe`가 PATH에 없으면 Windows localhost bridge 실행 전에 `spawn powershell.exe ENOENT` 경고가 반복될 수 있었습니다.
- 이 경우 앱 자체는 `0.0.0.0`으로 정상 실행되므로, 실패성 경고 대신 bridge skip 상태와 `Open (LAN)` 대안을 명확히 보여주는 쪽이 운영자에게 안전합니다.
- Windows interop PATH가 복구된 환경에서는 기존 localhost bridge 동작을 유지해야 합니다.

## 핵심 변경
- `scripts/next_dev_safe.mjs`에 `isWindowsPowerShellAvailable()`을 추가해 bridge spawn 전에 `powershell.exe` 실행 가능 여부를 확인합니다.
- `powershell.exe`가 없으면 bridge를 `skipped` 상태로 처리하고, 앱 실행은 유지하면서 `Open (LAN)` URL 사용 안내를 출력합니다.
- 실제 bridge 실패는 기존처럼 `disabled` 경고로 남겨 skip과 실패를 구분했습니다.
- PowerShell 감지 테스트를 추가해 정상 실행, ENOENT, 비정상 종료 상태를 검증했습니다.
- Windows/Planning v2 실행 문서에 bridge skip 시 `Open (LAN)` URL을 사용하라는 안내를 추가했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 node --check scripts/next_dev_safe.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/next-dev-safe-bridge-status.test.ts` 통과: 1 file, 4 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/next_dev_safe.mjs tests/next-dev-safe-bridge-status.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec tsc --noEmit` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 sh -lc 'timeout 18s node scripts/next_dev_safe.mjs --host 0.0.0.0 --port 3199 --strict-port'` 확인: dev server ready 이후 timeout으로 종료, `Windows localhost bridge skipped: powershell.exe not found; use Open (LAN) URL or restore Windows interop PATH` 출력, `spawn powershell.exe ENOENT` 경고 없음
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm verify` 통과: 661 files, 2028 tests, schema drift 0, freshness 8/8 fresh, route guard scan PASS
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과: 254 static pages 생성

## 남은 리스크
- Windows localhost bridge 자체가 필요한 사용자는 WSL에서 `powershell.exe`가 보이도록 Windows interop PATH를 복구해야 합니다. 복구 전에는 `Open (LAN)` URL 사용이 현실적인 대안입니다.
- 작업트리에는 이전 라운드 변경이 많이 남아 있어 stage 또는 PR은 기능 단위로 나누는 것이 안전합니다.
- MOLIT 상세 매매 API의 외부 권한 문제는 이번 라운드 범위 밖이며, 현재는 일반 매매 API fallback으로 완화된 상태입니다.

## 다음 라운드
- dirty worktree를 기능 단위 candidate bundle로 다시 나누고 stage/PR 순서를 정리합니다.
- MOLIT 상세 매매 API 권한 이슈를 문서화하거나 상세 전용 필드가 필요한 기능을 별도 범위로 분리합니다.
- Windows interop PATH가 복구된 환경에서 localhost bridge ready 경로를 추가 smoke로 확인합니다.
