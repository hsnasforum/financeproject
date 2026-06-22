# 2026-06-22 PostgreSQL readiness apply simulation

## 변경 파일
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-apply-simulation.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드를 PostgreSQL migration readiness 보강으로 분류하고, AGENTS.md의 Spark 조건부 모델 지침을 확인했습니다. 명시적 subagent 요청이 없어 메인 에이전트에서 진행했습니다.
- `planning-gate-selector`: script/test/migration readiness 변경에 맞춰 syntax check, targeted vitest, auth gate, lint, typecheck, full test, build를 선택했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 DB apply 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- 기존 readiness dry-run은 manifest/export/checksum은 확인했지만 target table 적용, partial failure rollback, idempotent upsert 증거가 부족했습니다.
- confirmed PostgreSQL apply를 열기 전에 `.data/planning` 파일 저장소를 안전하게 읽어 staged apply로 검증하는 중간 계약이 필요했습니다.
- 실제 target operation이 없는 no-op 상태는 rollback 성공처럼 보이지 않도록 `rollbackProbe: SKIPPED`와 `rollbackOnFailure: false`로 분리해야 했습니다.

## 핵심 변경
- dry-run apply가 `planning-v3/accounts.json`과 `opening-balances.json`을 PostgreSQL 목표 row shape의 in-memory operation으로 변환합니다.
- 같은 operation을 두 번 적용해 idempotent upsert digest가 유지되는지 확인합니다.
- 첫 operation 뒤 의도적 실패를 주입해 staged state가 rollback되는지 검증합니다.
- public number API 계약을 넘는 금액은 readiness 단계에서 실패하도록 테스트로 고정했습니다.
- 실제 `.data/planning`에 target 파일이 없으면 no-op apply는 PASS하되 rollback probe는 `SKIPPED`로 노출합니다.

## 검증
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `corepack pnpm vitest run tests/planning/auth/postgresReadinessScript.test.ts tests/planning/auth/postgresMapperContract.test.ts tests/planning/auth/postgresSchemaContract.test.ts` (3 files, 16 tests)
- PASS: `node scripts/planning_postgres_readiness.mjs --dry-run > /tmp/planning-postgres-readiness-apply-simulation.json`
- PASS: parsed actual dry-run `dry-run-apply` step showed `targetedFiles=0`, `operations=0`, `rollbackOnFailure=false`, `rollbackProbe.status=SKIPPED`
- PASS: `corepack pnpm planning:auth:check` (25 files, 169 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm test` (698 files, 2240 tests)
- PASS: `corepack pnpm build`
- NOTE: one earlier `pnpm build` tool call timed out at 244s while the process kept running; no leftover process remained, and the build was rerun with a longer timeout to a clean PASS.

## 남은 리스크
- [미완료] 실제 PostgreSQL DB apply는 여전히 구현되지 않았고 `--apply`는 의도적으로 차단된 상태입니다.
- [미완료] transaction batch table roundtrip과 실제 DB rollback/partial apply 검증은 다음 migration readiness 라운드 범위입니다.
- [검증 필요] 실제 사용자 데이터에 `planning-v3/accounts.json` 또는 `opening-balances.json`가 생기면 dry-run apply가 target operation과 rollback probe를 실행하는지 live fixture로 다시 확인해야 합니다.

## 다음 라운드
- confirmed apply를 열기 전에 manifest/export/apply/checksum/rollback 계약을 실제 PostgreSQL transaction dry-run 또는 disposable DB fixture까지 확장합니다.
