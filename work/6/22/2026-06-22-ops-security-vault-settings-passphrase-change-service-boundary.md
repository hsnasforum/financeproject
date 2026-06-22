# 2026-06-22 Ops security change-passphrase service boundary

## 변경 파일
- `src/app/api/ops/security/change-passphrase/route.ts`
- `src/lib/planning/server/security/opsSecurityChangePassphraseRouteService.ts`
- `tests/planning/ops/ops-security-change-passphrase-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-ops-security-vault-settings-passphrase-change-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록을 기준으로 이번 라운드에 필요한 기본 skill 조합을 정했습니다.
- `planning-gate-selector`: App Router API route와 server service 변경에 맞춰 targeted vitest, auth coverage, `sec:check`, lint, typecheck, build를 선택했습니다.
- `work-log-closeout`: 실제 변경 범위와 검증 결과를 종료 기록으로 남깁니다.

## 변경 이유
- `/api/ops/security/change-passphrase`는 vault 암호 변경과 감사 로그를 처리하는 보안 route입니다.
- route handler가 `vaultCsrf`, `vaultState`, audit helper, client error mapping을 직접 갖고 있으면 최근 `status`, `lock/unlock`, `auto-lock`, `configure`에서 고정한 service boundary와 맞지 않습니다.
- route는 dev/local guard, current-user route auth, 요청 body parsing, public response mapping에 집중하고, CSRF 검증과 vault 암호 변경, audit 기록은 server service로 이동합니다.

## 핵심 변경
- `opsSecurityChangePassphraseRouteService`를 추가해 change-passphrase CSRF 검증, vault 암호 변경, 성공/실패 audit 기록, 암호 변경 전용 client error mapping을 service 계층으로 이동했습니다.
- `change-passphrase` route에서 직접 `vaultCsrf`, `vaultState`, `securityAuditLog`, route-local `toClientError` 사용을 제거했습니다.
- `change-passphrase` route가 service import를 사용하고 직접 보안 helper를 import하지 않는 정적 boundary 테스트를 추가했습니다.
- `alice` current-user namespace에서 잠긴 vault의 기존 암호를 새 암호로 변경한 뒤 meta와 vault CSRF cookie가 유지되는 동작 테스트를 추가했습니다.
- manager 분해와 Spark 정적 탐색 결과를 반영해 이번 PR은 `change-passphrase` 단일 route로 제한했습니다.

## 검증
- PASS: `rg -n 'lib/planning/security/vault(Csrf|State)|lib/ops/securityAuditLog|consumeVaultCsrfOrThrow|changeVaultPassphrase|appendOpsAuditEvent|toClientError' src/app/api/ops/security/change-passphrase/route.ts || true` (no matches)
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-security-change-passphrase-route-service-boundary.test.ts` (1 file, 2 tests)
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts` (1 file, 32 tests)
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-security-status-route-service-boundary.test.ts tests/planning/ops/ops-security-lock-unlock-route-service-boundary.test.ts tests/planning/ops/ops-security-auto-lock-route-service-boundary.test.ts tests/planning/ops/ops-security-configure-route-service-boundary.test.ts tests/planning/ops/ops-security-change-passphrase-route-service-boundary.test.ts` (5 files, 10 tests)
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `git diff --check`
- PASS: `corepack pnpm build`
- PASS: `git diff --check --cached`
- PASS: `corepack pnpm multi-agent:guard`

## 남은 리스크
- 이번 라운드는 `change-passphrase` route만 service boundary로 이동했습니다.
- `reset` route의 직접 security/audit import 정리는 후속 라운드로 남아 있습니다.
- UI selector나 화면 흐름은 변경하지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드
- `reset` route를 다음 service boundary PR로 진행합니다.
- `reset` route는 planning data 삭제와 `keepAudit` 분기가 있어 기존 `security-reset-route` fixture를 함께 확인합니다.
