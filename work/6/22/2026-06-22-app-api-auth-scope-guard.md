# 2026-06-22 App API auth scope guard

## 변경 파일
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/22/2026-06-22-app-api-auth-scope-guard.md`

## 사용 skill
- `finance-skill-routing`: Auth/User Scope 표준화 라운드를 최신 `/work` 이후 단계로 이어받았습니다.
- `planning-gate-selector`: route auth coverage 테스트 변경에 맞춰 targeted vitest, lint, typecheck, guard, diff check를 선택했습니다.
- `work-log-closeout`: 변경 범위, 검증 결과, 남은 리스크를 종료 기록으로 남깁니다.

## 변경 이유
- `src/app/api/**/route.ts` 213개 기준으로 direct current-user scope helper 사용은 0건입니다.
- 기존 coverage는 planning auth boundary와 ops route 중심으로 직접 scope 우회를 막고 있었지만, 새 App API route handler가 추가될 때 같은 규칙이 전체 API route 계층에 적용된다는 증거가 부족했습니다.
- route handler는 `withPlanningRouteUser` 또는 `requirePlanningRouteUser` 같은 `routeAuth` 경계를 통해 사용자 소유권을 확인해야 합니다.

## 핵심 변경
- route 파일 탐색 헬퍼를 공통화했습니다.
- direct current-user scope helper 탐지 로직을 재사용 가능한 헬퍼로 분리했습니다.
- `src/app/api/**/route.ts` 전체가 direct current-user scope helper와 store user-scope import를 쓰지 못하도록 회귀 테스트를 추가했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts` (1 file, 31 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm multi-agent:guard`
- PASS: `git diff --check`

## 남은 리스크
- 이번 라운드는 route handler 직접 우회 방지 테스트 보강이며, 모든 route를 `withPlanningRouteUser` 방식으로 재작성하는 기능 변경은 하지 않았습니다.
- `_lib.ts` 같은 route 보조 파일의 허용 import는 기존 ops metadata wrapper 계약을 따르며, route handler 직접 우회 금지 범위와 분리했습니다.

## 다음 라운드
- `PLANNING_AUTH_REQUIRED=true` 운영 계약과 local/dev fallback 조건을 문서와 테스트에서 더 명시적으로 고정합니다.
- `/api/auth/*` OAuth 우선 계약과 401/403 error shape 일관성 검증을 별도 PR로 분리합니다.
