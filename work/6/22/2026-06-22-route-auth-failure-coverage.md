# 2026-06-22 route auth failure coverage 보강

## 변경 파일
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/22/2026-06-22-route-auth-failure-coverage.md`

## 사용 skill
- `finance-skill-routing`: auth/user scope 라운드에서 필요한 skill 범위를 좁혔습니다.
- `planning-gate-selector`: routeAuth 실패 계약 보강에 맞춰 targeted auth test, `planning:auth:check`, `lint`를 선택했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 잔여 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- `withPlanningRouteUser` 직접 사용 route는 이미 `routeAuth` 경계에 있었지만, callback형 helper에서 발생한 auth error를 `planningAuthErrorResponse`로 변환하는 route-level 계약은 coverage에 명시되어 있지 않았습니다.
- 향후 callback형 routeAuth 사용 route가 401/403을 표준 오류 응답으로 변환하지 않아 500으로 새는 회귀를 막기 위해 테스트 계약을 추가했습니다.

## 핵심 변경
- `WITH_ROUTE_USER_AUTH_ERROR_BRIDGE_PATTERNS`를 추가했습니다.
- `withPlanningRouteUser(`를 사용하는 planning route 파일이 `planningAuthErrorResponse`, `toAuthErrorResponse(error)`, `if (authError) return authError` 패턴을 모두 유지하는지 검사합니다.
- runtime route 코드는 변경하지 않았습니다.

## 검증
- PASS `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/auth/routeAuth.test.ts`
  - 2 files, 36 tests passed
- PASS `corepack pnpm planning:auth:check`
  - 13 files, 110 tests passed
- PASS `corepack pnpm lint`

## 남은 리스크
- 이 라운드는 실패 응답 변환 coverage 보강만 수행했고 route runtime은 변경하지 않았습니다.
- `meta.userId/authSource` 전면 일관성은 기존 성공 응답 coverage가 일부 보호하지만, 더 넓은 route별 응답 shape audit는 후속 라운드로 남아 있습니다.
- `pnpm build`는 runtime 코드 변경이 없어 실행하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
