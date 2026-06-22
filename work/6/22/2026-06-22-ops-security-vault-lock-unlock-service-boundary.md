# 2026-06-22 Ops security lock/unlock service boundary

## 변경 파일
- `src/app/api/ops/security/lock/route.ts`
- `src/app/api/ops/security/unlock/route.ts`
- `src/lib/planning/server/security/opsSecurityLockRouteService.ts`
- `tests/planning/ops/ops-security-lock-unlock-route-service-boundary.test.ts`
- `scripts/security_route_guard_scan.mjs`
- `work/6/22/2026-06-22-ops-security-vault-lock-unlock-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록을 기준으로 기본 skill 조합과 조건부 skill 필요 여부를 정했습니다.
- `planning-gate-selector`: App Router API route와 server service 변경에 맞춰 targeted vitest, auth coverage, lint, typecheck, build, diff check를 선택했습니다.
- `work-log-closeout`: 실제 변경 범위와 검증 결과를 종료 기록으로 남깁니다.

## 변경 이유
- `/api/ops/security/lock`과 `/api/ops/security/unlock`은 current-user routeAuth 뒤에서 vault 상태 변경, CSRF 검증, audit/metric 기록을 수행하는 보안 route입니다.
- route handler가 `vaultCsrf`, `vaultState`, audit/metric helper를 직접 import하면 route/service 경계가 흐려집니다.
- route는 dev/local guard, auth, body parsing, public response mapping만 담당하고 보안 상태 변경과 기록은 server service에 모으도록 좁힙니다.

## 핵심 변경
- `opsSecurityLockRouteService`를 추가해 lock/unlock의 CSRF 검증, vault 상태 변경, audit/metric 기록을 service 계층으로 이동했습니다.
- `lock` route에서 직접 `vaultCsrf`, `vaultState`, `securityAuditLog` import를 제거했습니다.
- `unlock` route에서 직접 `vaultCsrf`, `vaultState`, `securityAuditLog`, `metricsLog` import를 제거했습니다.
- lock/unlock route가 service import를 사용하고 직접 보안 helper를 import하지 않는 정적 가드를 추가했습니다.
- `alice` current-user namespace에서 lock 후 unlock까지 meta와 vault CSRF cookie가 유지되는 동작 테스트를 추가했습니다.
- release gate의 route guard scanner가 service-boundary CSRF assertion을 mutation guard로 인식하도록 보강했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-security-lock-unlock-route-service-boundary.test.ts` (1 file, 2 tests)
- PASS: `rg -n 'lib/planning/security/vault(Csrf|State)|lib/ops/securityAuditLog|lib/ops/metricsLog|consumeVaultCsrfOrThrow|lockVault|unlockVault|appendOpsAuditEvent|appendOpsMetricEvent' src/app/api/ops/security/lock/route.ts src/app/api/ops/security/unlock/route.ts || true` (no matches)
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts` (1 file, 32 tests)
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-security-status-route-service-boundary.test.ts tests/planning/ops/ops-security-lock-unlock-route-service-boundary.test.ts` (2 files, 4 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `git diff --check`
- PASS: `git diff --check --cached`
- PASS: `corepack pnpm multi-agent:guard`
- FAIL: GitHub CI `Required Gate - Release Verify (test + complete + compat)` first run failed because `scripts/security_route_guard_scan.mjs` did not recognize `assertOpsSecurityVaultCsrf` as a mutation guard.
- PASS: `corepack pnpm sec:check`
- PASS: `node --check scripts/security_route_guard_scan.mjs`
- FAIL: `corepack pnpm release:verify` reached the final full test gate, then `tests/planning/auth/postgresReadinessScript.test.ts` hit 5s timeout failures under the local full-suite run.
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts --testTimeout=30000` (1 file, 14 tests)

## 남은 리스크
- 이번 라운드는 lock/unlock route만 service boundary로 이동했습니다.
- `auto-lock`, `configure`, `change-passphrase`, `reset` route의 직접 security/audit import 정리는 후속 라운드로 남아 있습니다.
- `reset`은 planning 데이터 삭제와 audit 보존 옵션이 얽혀 있어 별도 단독 PR로 분리하는 편이 안전합니다.

## 다음 라운드
- Spark explorer가 가장 작은 단일 후보로 지목한 `auto-lock` route를 service boundary로 이동합니다.
- 이후 `configure` + `change-passphrase`를 설정 변경 계열로 묶고, `reset`은 단독 PR로 분리합니다.
