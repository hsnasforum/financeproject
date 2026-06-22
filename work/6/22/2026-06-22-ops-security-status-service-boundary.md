# 2026-06-22 Ops security status service boundary

## 변경 파일
- `src/app/api/ops/security/status/route.ts`
- `src/lib/planning/server/security/opsSecurityStatusRouteService.ts`
- `tests/planning/ops/ops-security-status-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-ops-security-status-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 사용자 소유 planning storage route의 service boundary 보강 라운드로 ops security status를 선택했습니다.
- `planning-gate-selector`: App Router API route와 server service 변경에 맞춰 targeted vitest, auth coverage, lint, typecheck, build, guard, diff check를 선택했습니다.
- `work-log-closeout`: 실제 변경 범위와 검증 결과를 종료 기록으로 남깁니다.

## 변경 이유
- `/api/ops/security/status`는 current-user routeAuth 뒤에서 vault status와 vault CSRF를 다루는 user-owned ops route입니다.
- route handler가 `vaultState`와 `vaultCsrf`를 직접 import하면 route/service/repository 경계가 흐려집니다.
- route는 dev/local guard, auth, response mapping만 담당하고 vault 상태와 CSRF 접근은 server service에 모으도록 좁힙니다.

## 핵심 변경
- `opsSecurityStatusRouteService`를 추가해 vault status 조회와 CSRF token/cookie 처리를 service 계층으로 이동했습니다.
- `/api/ops/security/status` route에서 직접 `vaultState`/`vaultCsrf` import를 제거했습니다.
- route가 service import를 사용하고 직접 vault storage helper를 import하지 않는 정적 가드를 추가했습니다.
- status 응답이 current-user meta와 vault CSRF cookie를 유지하는 동작 테스트를 추가했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-security-status-route-service-boundary.test.ts` (1 file, 2 tests)
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts` (1 file, 32 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- INFO: `corepack pnpm build` 첫 실행은 184초 도구 제한으로 결과 없이 timeout
- PASS: `corepack pnpm build` 재실행 (291.6s, Next build success)
- PASS: `corepack pnpm multi-agent:guard`
- PASS: `git diff --check`

## 남은 리스크
- 이번 라운드는 ops security status route만 service boundary로 이동했습니다.
- unlock, lock, configure, reset, backup 같은 다른 vault/backup ops route의 직접 security/audit import 정리는 후속 라운드로 남아 있습니다.

## 다음 라운드
- ops security action routes 중 하나를 같은 방식으로 service boundary로 이동합니다.
- backup/export/restore 계열은 영향 범위가 크므로 별도 작은 PR로 나눕니다.
