# 2026-06-22 Route auth production fallback guard

## 변경 파일
- `tests/planning/auth/routeAuth.test.ts`
- `work/6/22/2026-06-22-route-auth-production-fallback-guard.md`

## 사용 skill
- `finance-skill-routing`: Auth/User Scope 표준화의 다음 라운드로 운영 auth 계약을 선택했습니다.
- `planning-gate-selector`: routeAuth 테스트 변경에 맞춰 targeted vitest, `planning:auth:check`, lint, typecheck, guard, diff check를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 리스크를 종료 기록으로 남깁니다.

## 변경 이유
- `currentUser`와 middleware는 production에서 `PLANNING_AUTH_REQUIRED=0`이어도 auth를 요구하도록 이미 검증하고 있습니다.
- 실제 API route helper인 `requirePlanningRouteUser`도 같은 production fail-closed 계약과 표준 401/no-meta payload를 유지한다는 직접 증거가 필요했습니다.
- 인증 실패 응답은 공격자가 보낸 user id나 route user metadata를 노출하지 않아야 합니다.

## 핵심 변경
- 기존 401 routeAuth 테스트가 `meta`를 붙이지 않는다는 점을 명시했습니다.
- production에서 `PLANNING_AUTH_REQUIRED=0`이어도 `requirePlanningRouteUser`가 401을 반환하는 테스트를 추가했습니다.
- production 401 응답 body를 `{ ok: false, error: { code, message } }`로 고정하고 `meta` 부재를 확인했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/routeAuth.test.ts` (1 file, 14 tests)
- PASS: `corepack pnpm planning:auth:check` (25 files, 180 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm multi-agent:guard`
- PASS: `git diff --check`

## 남은 리스크
- 이번 라운드는 routeAuth helper의 production fallback 차단 계약을 테스트로 고정한 범위입니다.
- `/api/auth/*` OAuth provider 운영 설정과 실제 로그인 플로우 e2e는 별도 라운드로 남아 있습니다.

## 다음 라운드
- `/api/auth/*` GitHub/Google OAuth 우선 계약과 provider/env 설정 문서화를 더 좁게 점검합니다.
- 401/403 payload shape가 planning-adjacent route 전체에서 같은 helper를 통과하는지 coverage 테스트를 추가할 수 있습니다.
