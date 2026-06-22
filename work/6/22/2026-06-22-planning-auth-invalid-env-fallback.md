# 2026-06-22 Planning auth invalid env fallback

## 변경 파일
- `tests/middleware-security.test.ts`
- `tests/planning/auth/currentUser.test.ts`
- `work/6/22/2026-06-22-planning-auth-invalid-env-fallback.md`

## 사용 skill
- `finance-skill-routing`: Auth/User Scope 운영 계약 강화 라운드로 분류했습니다.
- `planning-gate-selector`: helper와 middleware auth 계약 변경에 맞춰 targeted vitest, `planning:auth:check`, lint, typecheck를 선택했습니다.
- `work-log-closeout`: 실제 실행한 검증과 남은 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- `PLANNING_AUTH_REQUIRED=false`는 local/dev에서만 명시 fallback을 열 수 있고 production에서는 무시되는 계약이 이미 있었습니다.
- 값이 잘못 입력된 경우에도 fallback이 열리지 않아야 "명시 env에서만 허용"이라는 운영 계약이 안전하게 유지됩니다.
- helper와 middleware가 같은 기준으로 invalid env 값을 인증 필요 상태로 처리하는지 동작 테스트로 고정했습니다.

## 핵심 변경
- current-user helper 테스트에 `PLANNING_AUTH_REQUIRED=sometimes`가 `isPlanningAuthRequired() === true`와 401을 유지하는 케이스를 추가했습니다.
- middleware 테스트에 같은 invalid env 값이 `/api/planning/*` fallback을 열지 않고 401을 반환하는 케이스를 추가했습니다.
- production/runtime 구현 코드는 변경하지 않고, 기존 parseBoolean fallback 동작을 회귀 테스트로 고정했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/currentUser.test.ts tests/middleware-security.test.ts` (31 tests)
- PASS: `corepack pnpm planning:auth:check` (25 files, 178 tests)
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm lint`
- PASS: `git diff --check`

## 남은 리스크
- 이번 라운드는 auth env fallback 계약 테스트 강화이며 route 구현은 바꾸지 않았습니다.
- 다른 auth 관련 env가 추가되면 같은 방식으로 invalid 값의 실패 닫힘 동작을 별도 테스트해야 합니다.
