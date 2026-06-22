# 2026-06-22 Planning adjacent route auth boundary

## 변경 파일
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/22/2026-06-22-planning-adjacent-route-auth-boundary.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드가 Auth/User Scope 표준화 구현·검증 라운드임을 확인했습니다.
- `planning-gate-selector`: API route auth boundary 테스트 변경에 맞춰 targeted vitest, `planning:auth:check`, lint, typecheck를 선택했습니다.
- `work-log-closeout`: 실제 실행 명령과 남은 리스크를 `/work` 종료 기록으로 정리했습니다.

## 변경 이유
- 현재 `src/app` route에서 `withCurrentPlanningUser` 직접 사용은 0건이지만, `/api/planner/compute`와 `/api/recommend`는 planning 인접 API이면서 기존 `src/app/api/planning` route inventory 밖에 있었습니다.
- 두 route도 `withPlanningRouteUser` 또는 `requirePlanningRouteUser` 표준 routeAuth boundary를 유지해야 하므로 정적 coverage에 포함했습니다.
- `/api/recommend`는 auth error를 `withTrace(authError)`로 감싸 반환하므로, 기존 raw `return authError` 문자열 검사 대신 routeAuth 변환 후 wrapper 반환을 허용하는 predicate로 조정했습니다.

## 핵심 변경
- `PLANNING_ADJACENT_AUTH_ROUTE_FILES`에 `/api/planner/compute`, `/api/recommend` route를 명시했습니다.
- `findPlanningAuthBoundaryRouteFiles()`로 planning route 95개와 planning 인접 route 2개를 함께 검사합니다.
- current-user scope, routeAuth import, direct current-user helper 금지, callback auth error bridge 검사를 planning 인접 route까지 확장했습니다.
- 응답 payload meta 검사 범위는 기존 planning route inventory에 유지해 trace wrapper 응답 구조와 섞지 않았습니다.

## 검증
- PASS: `rg -n "withCurrentPlanningUser" src/app src/lib tests scripts`; `src/app` route 직접 사용 0건, helper/test 참조만 확인.
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts` (30 tests)
- PASS: `corepack pnpm planning:auth:check` (25 files, 176 tests)
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm lint`
- PASS: `git diff --check`

## 남은 리스크
- 이번 라운드는 정적 coverage 강화이며 production route 구현은 바꾸지 않았습니다.
- planning 인접 route 목록은 현재 `/api/planner/compute`, `/api/recommend` 2개로 고정했습니다. 새 planning-adjacent API가 생기면 이 목록을 함께 갱신해야 합니다.
