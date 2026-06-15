# 2026-05-25 production hidden surfaces e2e

## 변경 파일
- `tests/e2e/smoke.spec.ts`
- `work/5/25/2026-05-25-production-hidden-surfaces-e2e.md`

## 사용 skill
- `route-ssot-check`: `/api/dev/*`, `/dev/*`, `/debug/*`, `/dashboard/artifacts`가 `docs/current-screens.md` 기준 production 비노출 경로인지 대조했습니다.
- `planning-gate-selector`: e2e smoke 변경에 맞춰 smoke 파일 lint, diff check, production Playwright focused smoke를 검증 범위로 정했습니다.
- `work-log-closeout`: 실제 실행한 검증과 남은 리스크를 `/work`에 기록했습니다.

## 변경 이유
- 직전 라운드에서 `sec:scan:routes`가 dev/debug page의 production guard를 정적으로 확인하도록 보강됐지만, 실제 production runtime 404는 영구 e2e로 남아 있지 않았습니다.
- 문서 기준상 production 사용자 노출 금지인 `/api/dev/*`, `/dev/*`, `/debug/*`, `/dashboard/artifacts`가 production 서버에서 404로 닫히는지 smoke 단계에서 직접 확인해야 합니다.

## 핵심 변경
- `tests/e2e/smoke.spec.ts`에 `production hides dev and debug surfaces` 테스트를 추가했습니다.
- 새 테스트는 `E2E_WEB_SERVER_MODE=production`에서만 실행되고, 개발 runtime에서는 skip됩니다.
- production runtime에서 `/api/dev/errors/recent`, `/dev/data`, `/debug/unified`, `/dashboard/artifacts`가 모두 404인지 확인합니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- tests/e2e/smoke.spec.ts` 통과
- Node trailing whitespace scan 실행: `tests/e2e/smoke.spec.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint tests/e2e/smoke.spec.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 node scripts/playwright_with_webserver_debug.mjs --runtime=production --port=3201 test tests/e2e/smoke.spec.ts --grep "production hides dev and debug surfaces" --workers=1 --reporter=line` 통과: 1 passed
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 node scripts/playwright_with_webserver_debug.mjs --runtime=production --port=3201 test tests/e2e/smoke.spec.ts --grep "production (CSP routes hydrate without CSP console violations|hides dev and debug surfaces)" --workers=1 --reporter=line` 통과: 2 passed
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node scripts/worktree_scope.mjs tests/e2e/smoke.spec.ts` 실행: total 211 / in-scope 1 / out-of-scope 210
- `ss -ltnp` 기반 포트 확인: `3201`, `3211`, `3212` 점유 없음

## 남은 리스크
- `tests/e2e/smoke.spec.ts`에는 이전 CSP smoke 변경도 함께 들어 있어, 이 파일을 stage할 때 `csp-style-runtime`과 `dev-security-runtime` 후보가 겹칩니다.
- 이번 라운드는 production hidden surface smoke만 추가했고, 전체 `pnpm e2e:rc`는 실행하지 않았습니다.
- `pgrep -af next`는 다른 repo의 watcher 명령에 포함된 `NEXT_CONTROL_SEQ`까지 잡아 이 저장소 runtime 확인에는 부정확했습니다. 포트 확인으로 대체했습니다.

## 다음 라운드
- `tests/e2e/smoke.spec.ts`를 포함하는 후보 묶음을 `csp-style-runtime + dev-security-runtime`으로 합칠지, smoke 파일만 공통 검증 파일로 둘지 stage 경계를 정합니다.
- stage 후보를 확정하기 전 `worktree:scope`로 포함 파일을 다시 확인합니다.
- 최종 PR 전에는 선택 묶음 기준으로 `pnpm lint`, `pnpm test`, `pnpm build`, 필요한 production e2e를 단일 소유로 재실행합니다.
