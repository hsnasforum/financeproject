# 2026-06-22 Ops security auto-lock service boundary

## 변경 파일
- `src/app/api/ops/security/auto-lock/route.ts`
- `src/lib/planning/server/security/opsSecurityAutoLockRouteService.ts`
- `tests/planning/ops/ops-security-auto-lock-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-ops-security-vault-settings-auto-lock-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록을 기준으로 기본 skill 조합과 조건부 skill 필요 여부를 정했습니다.
- `planning-gate-selector`: App Router API route와 server service 변경에 맞춰 targeted vitest, auth coverage, `sec:check`, lint, typecheck, build, diff check를 선택했습니다.
- `work-log-closeout`: 실제 변경 범위와 검증 결과를 종료 기록으로 남깁니다.

## 변경 이유
- `/api/ops/security/auto-lock`은 current-user routeAuth 뒤에서 vault 자동 잠금 설정을 변경하는 보안 route입니다.
- route handler가 `vaultCsrf`, `vaultState`, audit helper를 직접 import하면 route/service 경계가 흐려집니다.
- route는 dev/local guard, auth, body parsing, public response mapping만 담당하고 CSRF 검증, vault 설정 변경, audit 기록은 server service에 모으도록 좁힙니다.

## 핵심 변경
- `opsSecurityAutoLockRouteService`를 추가해 auto-lock CSRF 검증, vault auto-lock 변경, audit 기록을 service 계층으로 이동했습니다.
- `auto-lock` route에서 직접 `vaultCsrf`, `vaultState`, `securityAuditLog` import를 제거했습니다.
- route가 service import를 사용하고 직접 보안 helper를 import하지 않는 정적 가드를 추가했습니다.
- `alice` current-user namespace에서 auto-lock minutes 변경 후 meta와 vault CSRF cookie가 유지되는 동작 테스트를 추가했습니다.
- manager 분해 결과는 자격 증명 생명주기 기준으로 `configure -> change-passphrase -> reset` 후속 순서를 권고했으며, 이번 라운드는 최신 `/work`의 명시적 다음 후보인 `auto-lock` 단일 PR로 완료합니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-security-auto-lock-route-service-boundary.test.ts` (1 file, 2 tests)
- PASS: `rg -n 'lib/planning/security/vault(Csrf|State)|lib/ops/securityAuditLog|consumeVaultCsrfOrThrow|updateVaultAutoLockMinutes|appendOpsAuditEvent' src/app/api/ops/security/auto-lock/route.ts || true` (no matches)
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts` (1 file, 32 tests)
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-security-status-route-service-boundary.test.ts tests/planning/ops/ops-security-lock-unlock-route-service-boundary.test.ts tests/planning/ops/ops-security-auto-lock-route-service-boundary.test.ts` (3 files, 6 tests)
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `git diff --check`
- PASS: `git diff --check --cached`
- PASS: `corepack pnpm multi-agent:guard`

## 남은 리스크
- 이번 라운드는 auto-lock route만 service boundary로 이동했습니다.
- `configure`, `change-passphrase`, `reset` route의 직접 security/audit import 정리는 후속 라운드로 남아 있습니다.
- `configure`와 `change-passphrase`는 lock screen 사용자 흐름과 passphrase 오류 contract 영향이 있어 다음 PR에서 별도 targeted test가 필요합니다.

## 다음 라운드
- manager 권고에 맞춰 `configure` route를 다음 service boundary PR로 진행합니다.
- 이후 `change-passphrase`를 분리하고, `reset`은 파괴적 동작과 audit 보존 옵션 때문에 마지막 단독 PR로 처리합니다.
