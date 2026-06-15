# 2026-05-25 dev security runtime page guard scan

## 변경 파일
- `scripts/security_route_guard_scan.mjs`
- `work/5/25/2026-05-25-dev-security-runtime-page-guard-scan.md`

## 사용 skill
- `route-ssot-check`: `/api/dev/*`, `/dev/*`, `/debug/*`, `/dashboard/artifacts`의 production 비노출 기준을 실제 route와 `docs/current-screens.md` 기준으로 대조했습니다.
- `planning-gate-selector`: route/security scan 변경에 맞춰 `sec:scan:routes`, `sec:check`, `planning:current-screens:guard`, script syntax/lint를 검증 범위로 정했습니다.
- `work-log-closeout`: dev-security-runtime 점검 결과와 실행한 검증을 `/work`에 기록했습니다.

## 변경 이유
- 기존 `sec:scan:routes`는 `/api/dev/*`와 `/api/ops/*` route handler guard를 확인했지만, dev/debug page의 production 404 guard는 정적으로 확인하지 않았습니다.
- `docs/current-screens.md`는 `/dev/*`, `/debug/*`, `/dashboard/artifacts`를 production 404로 분류하므로, 새 dev/debug page가 생길 때 guard 누락을 CI에서 잡을 필요가 있습니다.

## 핵심 변경
- `scripts/security_route_guard_scan.mjs`가 `src/app/**/page.tsx`도 수집하도록 확장했습니다.
- `/dev/*`와 `/dashboard/artifacts` page는 `notFound()`와 production guard를 요구하도록 했습니다.
- `/debug/*` page는 `notFound()`와 `isDebugPageAccessible()` guard를 요구하도록 했습니다.
- `sec:scan:routes` PASS 로그에 `prodHiddenPages` 집계를 추가했습니다.

## 검증
- 변경 전 `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm sec:scan:routes` 통과: `devRoutes=38`, `opsRoutes=38`, `publicMutationAllowlist=7`, `opsActions=3`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm security:check` 실행 실패: package script 없음, `pnpm sec:check`가 실제 스크립트
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm sec:check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:current-screens:guard` 통과: 5 files / 9 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- scripts/security_route_guard_scan.mjs` 통과
- Node trailing whitespace scan 실행: `scripts/security_route_guard_scan.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node --check scripts/security_route_guard_scan.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/security_route_guard_scan.mjs` 통과
- 변경 후 `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm sec:scan:routes` 통과: `devRoutes=38`, `opsRoutes=38`, `prodHiddenPages=7`, `publicMutationAllowlist=7`, `opsActions=3`
- 변경 후 `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm sec:check` 통과
- 변경 후 `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:current-screens:guard` 통과: 5 files / 9 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node scripts/worktree_scope.mjs scripts/security_route_guard_scan.mjs` 실행: total 210 / in-scope 1 / out-of-scope 209

## 남은 리스크
- `scripts/security_route_guard_scan.mjs`는 이번 작업 전부터 untracked 파일이라, stage 시 새 파일로 포함됩니다. 이 라운드만 분리하려면 해당 스크립트와 이 `/work` 기록만 선별해야 합니다.
- production runtime에서 실제 404 응답을 브라우저로 재확인하는 e2e는 이번 라운드에서 추가 실행하지 않았습니다. 정적 route guard와 current-screens guard 중심으로 확인했습니다.
- `/ops/*` page는 문서상 사용자 헤더/홈 노출 대상이 아니지만 production 404 전체 차단 대상은 아니라서 이번 page guard scan 대상에는 포함하지 않았습니다.

## 다음 라운드
- 범위 밖 변경이 많은 상태이므로, 다음 라운드는 candidate bundle 단위로 stage 가능한 변경 묶음을 다시 나눕니다.
- 우선순위는 `dev-security-runtime`에 남은 middleware/test 변경과 이미 통과한 runtime launcher 변경의 PR 포함 경계를 확인하는 것입니다.
- 최종 PR 전에는 선택된 묶음 기준으로 `pnpm lint`, `pnpm test`, `pnpm build`, 필요한 e2e를 다시 단일 소유로 실행합니다.
