# 2026-06-23 products candidates route user scope

## 변경 파일
- `src/app/api/products/candidates/route.ts`
- `src/app/api/ops/assumptions/history/route.ts`
- `src/app/api/ops/assumptions/history/[id]/route.ts`
- `src/app/api/ops/assumptions/latest/route.ts`
- `src/app/api/ops/assumptions/refresh/route.ts`
- `src/app/api/ops/assumptions/set-latest/route.ts`
- `src/app/api/ops/assumptions/sync/route.ts`
- `tests/planning-v2-api/products-candidates-route.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `tests/planning/ops/assumptions-refresh-route.test.ts`

## 사용 skill
- `finance-skill-routing`: Finance Project 조건부 skill 범위 확인.
- `planning-gate-selector`: route/auth 변경에 맞는 최소 검증 세트 선정.
- `work-log-closeout`: `/work` 종료 기록 형식 확인.

## 변경 이유
- `/api/products/candidates`는 `runId` 기반으로 planning run/profile 데이터를 읽지만, 기존에는 routeAuth 계층이 아니라 store를 직접 호출했습니다.
- Auth/User Scope 표준화 계획에 맞춰 planning-adjacent API도 `requirePlanningRouteUser` 경계와 current-user repository를 사용하도록 정리했습니다.
- Spark 정적 탐색에서 ops user-owned route 판별 패턴 일부가 빠져 있음을 확인해 coverage 테스트를 보강했습니다.
- 새 coverage가 ops assumptions 성공 응답의 user meta 누락을 드러내 6개 route의 success meta를 표준 helper로 맞췄습니다.

## 핵심 변경
- `products/candidates` GET은 same-origin guard 뒤 `requirePlanningRouteUser`를 통과해야 하며, run/profile 조회는 current-user repository만 사용합니다.
- `products/candidates` 성공/부분 응답 meta에 `userId`, `authSource`가 일관되게 포함됩니다.
- `planningRouteUserScopeCoverage`가 products candidates와 ops actions/assumptions/backup/security/support 계열 user-owned route 패턴을 더 넓게 감시합니다.
- ops assumptions history/latest/refresh/set-latest/sync route는 success meta를 `assumptionsUserMeta`로 통일했습니다.
- assumptions refresh route 테스트는 namespace meta까지 포함되는 현재 계약에 맞춰 갱신했습니다.

## 검증
- PASS: `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning-v2-api/products-candidates-route.test.ts tests/planning/auth/routeAuth.test.ts`
- PASS: `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS: `corepack pnpm test tests/planning-assumptions-ops-route.test.ts tests/planning/ops/assumptions-refresh-route.test.ts tests/planning/ops/ops-assumptions-history-route-service-boundary.test.ts tests/planning/ops/ops-assumptions-latest-route-service-boundary.test.ts tests/planning/ops/ops-assumptions-refresh-route-service-boundary.test.ts tests/planning/ops/ops-assumptions-set-latest-route-service-boundary.test.ts tests/planning/ops/ops-assumptions-sync-route-service-boundary.test.ts tests/planning-v2-api/products-candidates-route.test.ts tests/planning/auth/routeAuth.test.ts`
- PASS: `corepack pnpm planning:auth:check`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm test`
- PASS: `corepack pnpm build`
- PASS: `git diff --check`

## 확인된 실패와 조치
- 관련 테스트 묶음 첫 실행에서 `tests/planning/ops/assumptions-refresh-route.test.ts`가 exact meta 비교로 실패했습니다.
- 실제 응답에는 `planningNamespaceEnabled: true`가 추가로 포함되는 것이 현재 계약이므로, 테스트를 `toMatchObject`와 명시 optional 타입으로 조정했습니다.

## 남은 리스크
- `ops/metrics/summary`는 shared metrics route 오분류를 피하려고 `readOpsMetricsSummaryPage` 구체 패턴으로만 감시합니다.
- `pnpm verify`는 이번 라운드에서 실행하지 않았습니다. 이 변경은 route/auth와 좁은 테스트 계약에 한정했고, 최종 게이트는 `pnpm test`, `pnpm build`, `planning:auth:check`, `sec:check`로 확인했습니다.
- `docs/current-screens.md`와 사용자 경로는 바뀌지 않았습니다.

## 다음 라운드 우선순위
- Planning API route의 남은 current-user scope blind spot을 coverage 기준으로 다시 좁혀 확인합니다.
- PostgreSQL migration readiness는 SQLite export/dry-run/checksum gate 설계부터 분리합니다.
- `pnpm verify`는 릴리스 후보 묶음에서 실행하고, 이번 PR의 좁은 auth 변경 게이트와 분리해 판단합니다.
