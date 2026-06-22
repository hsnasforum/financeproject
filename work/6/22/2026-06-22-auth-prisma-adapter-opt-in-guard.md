# 2026-06-22 Auth Prisma adapter opt-in guard

## 변경 파일
- `tests/planning/auth/authConfigContract.test.ts`
- `work/6/22/2026-06-22-auth-prisma-adapter-opt-in-guard.md`

## 사용 skill
- `finance-skill-routing`: Auth/User Scope 표준화의 다음 라운드로 `/api/auth/*` 운영 계약을 점검했습니다.
- `planning-gate-selector`: Auth.js config 계약 테스트 변경에 맞춰 targeted vitest, `planning:auth:check`, lint, typecheck, guard, diff check를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일과 검증 결과를 종료 기록으로 남깁니다.

## 변경 이유
- `/api/auth/*`는 현재 GitHub/Google OAuth 우선 phase이며, Credentials/Email provider는 후속 phase로 남아 있습니다.
- Auth.js Prisma adapter는 Auth.js 테이블 마이그레이션 이후에만 `AUTH_PRISMA_ADAPTER_ENABLED=true`로 켜야 합니다.
- 기존 계약은 source string 검사가 중심이라, adapter 없이 env만 켰을 때 런타임에서 닫히는지 직접 증거가 약했습니다.

## 핵심 변경
- `AUTH_PRISMA_ADAPTER_ENABLED=true`인데 adapter가 없으면 `buildAuthConfig`가 즉시 throw하는 동작 테스트를 추가했습니다.
- adapter가 명시 주입된 경우에만 database session strategy와 adapter 설정이 활성화되는지 확인했습니다.
- 기본 production config는 계속 JWT session과 provider/env 기반 OAuth 구성을 유지합니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/authConfigContract.test.ts` (1 file, 9 tests)
- PASS: `corepack pnpm planning:auth:check` (25 files, 180 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm multi-agent:guard`
- PASS: `git diff --check`

## 남은 리스크
- 실제 GitHub/Google OAuth 로그인 e2e는 provider secret과 callback URL이 필요한 운영 환경 검증으로 남아 있습니다.
- 이번 라운드는 Auth.js adapter opt-in guard이며, 사용자 로그인 UI나 Auth.js callback 흐름은 변경하지 않았습니다.

## 다음 라운드
- planning-adjacent route의 401/403 payload shape coverage를 더 넓게 고정합니다.
- 이후 DB 전환 readiness에서 Auth.js Account와 FinancialAccount 분리 계약을 계속 유지합니다.
