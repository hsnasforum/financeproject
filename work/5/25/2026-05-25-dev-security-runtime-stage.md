# 2026-05-25 dev security runtime stage

## 변경 파일
- `scripts/security_check.mjs`
- `scripts/security_route_guard_scan.mjs`
- `src/lib/dev/devGuards.ts`
- `src/app/api/dev/*/route.ts` 관련 23개 dev route
- `tests/artifacts-route.test.ts`
- `tests/daily-brief-route.test.ts`
- `tests/dev-guards.test.ts`
- `tests/dev-unlock-auth.test.ts`
- `tests/disclosure-alerts-route.test.ts`
- `tests/news-brief-route.test.ts`
- `work/5/25/2026-05-25-dev-security-runtime-stage.md`

## 사용 skill
- `route-ssot-check`: `/api/dev/*`, `/dev/*`, `/debug/*`, `/dashboard/artifacts`의 production 비노출 계약을 route scan과 smoke 기준으로 확인했습니다.
- `planning-gate-selector`: dev route guard/helper 변경에 맞춰 diff, syntax, lint, unit, security scan, 기존 build 근거를 선택했습니다.
- `work-log-closeout`: 실제 검증 결과와 실패 후 보정 내용을 기록했습니다.

## 변경 이유
- dev/debug API는 production 비노출뿐 아니라 non-production에서도 local-only 접근과 mutation guard를 일관되게 가져야 합니다.
- 각 route마다 `onlyDev`, local host, same-origin, CSRF 처리가 흩어져 있어 공통 guard helper로 좁히는 편이 안전합니다.
- 기존 security check가 report/CSP/style 회귀를 포괄하지 못했고, route scan은 dev/debug page production guard까지 보지 못했습니다.

## 핵심 변경
- `guardDevReadRequest`, `guardDevMutationRequest`를 추가해 dev route의 production 차단, local-only, same-origin, CSRF 검사를 공통화했습니다.
- `/api/dev/*` route 23개를 공통 guard helper로 전환했습니다.
- `security_check.mjs`에 inline print script, PDF dynamic loader, external font stylesheet, insecure KDB endpoint, inline style/style mutation, framer-motion, next/image 회귀 검사를 추가했습니다.
- `security_route_guard_scan.mjs`를 추가해 dev/ops API route guard, public mutation allowlist, production-hidden page guard를 정적으로 확인합니다.
- 병렬 테스트 중 news artifact 파일이 다시 생성될 수 있어 `artifacts-route`의 news key 테스트를 “키 허용” 검증으로 조정했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/worktree_scope.mjs scripts/security_check.mjs scripts/security_route_guard_scan.mjs src/lib/dev/devGuards.ts src/app/api/dev/artifacts/route.ts src/app/api/dev/audit/recent/route.ts src/app/api/dev/backup/export/route.ts src/app/api/dev/backup/import/route.ts src/app/api/dev/backup/restore-point/rollback/route.ts src/app/api/dev/backup/restore-point/route.ts src/app/api/dev/benefits/export/route.ts src/app/api/dev/benefits/probe/route.ts src/app/api/dev/benefits/snapshot/refresh/route.ts src/app/api/dev/daily-refresh/status/route.ts src/app/api/dev/dart/alerts/route.ts src/app/api/dev/dart/brief/route.ts src/app/api/dev/data-sources/health/route.ts src/app/api/dev/data-sources/ping/route.ts src/app/api/dev/doctor/fix/history/route.ts src/app/api/dev/doctor/summary/route.ts src/app/api/dev/errors/recent/route.ts src/app/api/dev/finlife/schema-report/route.ts src/app/api/dev/git/route.ts src/app/api/dev/news/brief/route.ts src/app/api/dev/public-apis/sample/route.ts src/app/api/dev/public-apis/status/route.ts tests/artifacts-route.test.ts tests/daily-brief-route.test.ts tests/dev-guards.test.ts tests/dev-unlock-auth.test.ts tests/disclosure-alerts-route.test.ts tests/news-brief-route.test.ts` 통과: 전체 변경 164, 범위 내 31, 범위 밖 133
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- scripts/security_check.mjs scripts/security_route_guard_scan.mjs src/lib/dev/devGuards.ts src/app/api/dev/artifacts/route.ts src/app/api/dev/audit/recent/route.ts src/app/api/dev/backup/export/route.ts src/app/api/dev/backup/import/route.ts src/app/api/dev/backup/restore-point/rollback/route.ts src/app/api/dev/backup/restore-point/route.ts src/app/api/dev/benefits/export/route.ts src/app/api/dev/benefits/probe/route.ts src/app/api/dev/benefits/snapshot/refresh/route.ts src/app/api/dev/daily-refresh/status/route.ts src/app/api/dev/dart/alerts/route.ts src/app/api/dev/dart/brief/route.ts src/app/api/dev/data-sources/health/route.ts src/app/api/dev/data-sources/ping/route.ts src/app/api/dev/doctor/fix/history/route.ts src/app/api/dev/doctor/summary/route.ts src/app/api/dev/errors/recent/route.ts src/app/api/dev/finlife/schema-report/route.ts src/app/api/dev/git/route.ts src/app/api/dev/news/brief/route.ts src/app/api/dev/public-apis/sample/route.ts src/app/api/dev/public-apis/status/route.ts tests/artifacts-route.test.ts tests/daily-brief-route.test.ts tests/dev-guards.test.ts tests/dev-unlock-auth.test.ts tests/disclosure-alerts-route.test.ts tests/news-brief-route.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- sh -lc 'node --check scripts/security_check.mjs && node --check scripts/security_route_guard_scan.mjs'` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/security_check.mjs scripts/security_route_guard_scan.mjs src/lib/dev/devGuards.ts src/app/api/dev/artifacts/route.ts src/app/api/dev/audit/recent/route.ts src/app/api/dev/backup/export/route.ts src/app/api/dev/backup/import/route.ts src/app/api/dev/backup/restore-point/rollback/route.ts src/app/api/dev/backup/restore-point/route.ts src/app/api/dev/benefits/export/route.ts src/app/api/dev/benefits/probe/route.ts src/app/api/dev/benefits/snapshot/refresh/route.ts src/app/api/dev/daily-refresh/status/route.ts src/app/api/dev/dart/alerts/route.ts src/app/api/dev/dart/brief/route.ts src/app/api/dev/data-sources/health/route.ts src/app/api/dev/data-sources/ping/route.ts src/app/api/dev/doctor/fix/history/route.ts src/app/api/dev/doctor/summary/route.ts src/app/api/dev/errors/recent/route.ts src/app/api/dev/finlife/schema-report/route.ts src/app/api/dev/git/route.ts src/app/api/dev/news/brief/route.ts src/app/api/dev/public-apis/sample/route.ts src/app/api/dev/public-apis/status/route.ts tests/artifacts-route.test.ts tests/daily-brief-route.test.ts tests/dev-guards.test.ts tests/dev-unlock-auth.test.ts tests/disclosure-alerts-route.test.ts tests/news-brief-route.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/dev-guards.test.ts tests/dev-unlock-auth.test.ts tests/artifacts-route.test.ts tests/daily-brief-route.test.ts tests/disclosure-alerts-route.test.ts tests/news-brief-route.test.ts` 첫 실행 실패: `tests/artifacts-route.test.ts`의 news artifact missing 기대가 병렬 news test의 파일 재생성과 충돌했습니다.
- 위 테스트를 news key 허용 검증으로 조정한 뒤 같은 명령 재실행 통과: 6 files, 25 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 node scripts/security_check.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 node scripts/security_route_guard_scan.mjs` 통과: `devRoutes=38 opsRoutes=38 prodHiddenPages=7 publicMutationAllowlist=7 opsActions=3`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 현재 worktree 기준 재실행 통과: 254 pages 생성. 이 라운드 전 같은 worktree에서 통과한 build 근거입니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --cached --check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard` 통과: `latestWorkNote=work/5/25/2026-05-25-dev-security-runtime-stage.md`

## 남은 리스크
- `package.json`의 `sec:scan:routes` script 연결은 의존성/lock 변경과 섞여 있어 이번 stage에서 제외했습니다. 이번 라운드에서는 `node scripts/security_route_guard_scan.mjs`로 직접 검증했습니다.
- `/api/dev/*` 외 ops route helper 적용은 route scan으로 확인했지만, 이번 stage의 직접 코드 변경 대상은 dev route 중심입니다.
- 현재 worktree에는 범위 밖 변경 133개가 남아 있습니다.

## 다음 라운드
- package/lock/tooling 변경을 별도 후보로 분리해 `sec:scan:routes`, `verify`, 의존성 업데이트를 검증합니다.
- planning workspace refactor 또는 planning v3 route 후보를 다음 pathspec 묶음으로 이어갑니다.
