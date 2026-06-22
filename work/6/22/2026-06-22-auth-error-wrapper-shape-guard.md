# 2026-06-22 Auth error wrapper shape guard

## 변경 파일
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/22/2026-06-22-auth-error-wrapper-shape-guard.md`

## 사용 skill
- `finance-skill-routing`: Auth/User Scope 표준화의 다음 라운드로 401/403 payload shape coverage를 선택했습니다.
- `planning-gate-selector`: route auth coverage 테스트 변경에 맞춰 targeted vitest, `planning:auth:check`, lint, typecheck, guard, diff check를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일과 검증 결과를 종료 기록으로 남깁니다.

## 변경 이유
- planning-adjacent route는 `planningAuthErrorResponse`를 통해 표준 401/403 body를 유지해야 합니다.
- `withTrace(authError)`처럼 auth error response를 감싸 반환하는 route는 trace header만 붙이고 JSON body와 meta shape를 바꾸지 않아야 합니다.
- 기존 coverage는 auth error bridge 존재는 확인했지만, wrapper가 header-only인지까지는 고정하지 않았습니다.

## 핵심 변경
- `authError`를 감싸 반환하는 route-local wrapper를 정적으로 탐지하는 helper를 추가했습니다.
- auth error response wrapper는 `Response`를 받아 `setTraceHeader(response, traceId)`만 호출하는 header-only 형태로 제한했습니다.
- planning auth boundary route 전체에 대해 wrapper가 표준 401/403 payload를 훼손하지 않는다는 회귀 가드를 추가했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts` (1 file, 32 tests)
- PASS: `corepack pnpm planning:auth:check` (25 files, 181 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm multi-agent:guard`
- PASS: `git diff --check`

## 남은 리스크
- 이번 라운드는 auth error wrapper의 static coverage 보강입니다.
- 실제 provider secret을 이용한 GitHub/Google OAuth 로그인 e2e는 운영 환경 검증으로 남아 있습니다.

## 다음 라운드
- PostgreSQL migration readiness 또는 `.data/planning/users/{userId}` repository ownership 경계를 이어서 좁힙니다.
- Auth.js Account와 FinancialAccount 분리 계약은 DB readiness 라운드에서도 계속 유지합니다.
