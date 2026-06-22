# 2026-06-22 Ops Security Vault Settings Reset Service Boundary

## 요약
- `/api/ops/security/reset` route에서 CSRF 검증, confirm phrase 검증, vault/planning reset, status 조회, 감사 로그 기록을 server route service로 분리했습니다.
- reset route는 인증, 입력 파싱, service 호출, 응답 매핑만 담당하도록 축소했습니다.
- reset route boundary 테스트를 추가해 route가 `vaultCsrf`, `vaultReset`, `vaultState`, `securityAuditLog`를 직접 가져오지 못하도록 고정했습니다.
- current-user namespace reset 동작과 `keepAudit=true` 감사 로그 보존/성공 이벤트 기록을 회귀 테스트로 추가했습니다.
- manager 분해와 Spark 정적 탐색 결과를 반영해 keepAudit 성공 경로 coverage를 보강했습니다.

## 사용 skill
- finance-skill-routing: Finance Project 작업에 필요한 조건부 skill 범위 확인.
- planning-gate-selector: route/service/test 변경에 맞는 검증 세트 선정.
- work-log-closeout: 종료 기록 형식과 다음 라운드 인계 항목 정리.

## 변경 파일
- `src/app/api/ops/security/reset/route.ts`
- `src/lib/planning/server/security/opsSecurityResetRouteService.ts`
- `tests/planning/ops/ops-security-reset-route-service-boundary.test.ts`
- `tests/planning/ops/security-reset-route.test.ts`
- `work/6/22/2026-06-22-ops-security-vault-settings-reset-service-boundary.md`

## 검증
- PASS: `rg -n 'lib/planning/security/vault(Csrf|Reset|State)|lib/ops/securityAuditLog|consumeVaultCsrfOrThrow|resetVaultAndPlanningData|getVaultStatus|appendOpsAuditEvent|toClientError' src/app/api/ops/security/reset/route.ts || true`
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-security-reset-route-service-boundary.test.ts tests/planning/ops/security-reset-route.test.ts`
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-security-status-route-service-boundary.test.ts tests/planning/ops/ops-security-lock-unlock-route-service-boundary.test.ts tests/planning/ops/ops-security-auto-lock-route-service-boundary.test.ts tests/planning/ops/ops-security-configure-route-service-boundary.test.ts tests/planning/ops/ops-security-change-passphrase-route-service-boundary.test.ts tests/planning/ops/ops-security-reset-route-service-boundary.test.ts tests/planning/ops/security-reset-route.test.ts`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `git diff --check`
- PASS: `corepack pnpm build`
- PASS: `git diff --check --cached`
- PASS: `corepack pnpm multi-agent:guard`

## 남은 리스크
- reset route의 service boundary는 고정했지만 전체 Finance Project 목표의 repository/data ownership 정리는 아직 진행 중입니다.
- reset 화면 셀렉터나 사용자 UX는 바꾸지 않아 e2e는 로컬에서 별도 실행하지 않았고, PR CI의 e2e 결과로 보강합니다.
- `.data/ops/jobs` 파일 큐와 PostgreSQL job table 승격 여부는 이번 범위 밖입니다.

## 다음 라운드
- ops security direct security import 정리 이후 남은 route handler의 파일/DB 직접 접근을 static scan으로 분류합니다.
- repository/data ownership 단계에서는 route가 인증, 입력 검증, 응답 매핑만 담당하도록 작은 PR 단위로 계속 분리합니다.
- broad e2e 실패 모드는 UI/RSC 단계에서 별도 회귀 테스트로 고정합니다.
