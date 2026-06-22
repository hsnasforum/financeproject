# 2026-06-22 PostgreSQL readiness transaction apply

## 변경 파일
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-transaction-apply.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`와 목표 우선순위를 기준으로 Auth/User Scope 확인 후 PostgreSQL migration readiness 보강으로 라운드를 좁혔습니다.
- `planning-gate-selector`: script/test/migration readiness 변경에 맞춰 syntax check, targeted vitest, readiness script, auth gate, lint, typecheck, full test, build를 선택했습니다.
- `planning-v3-batch-contract-narrowing`: batch `.ndjson` raw row를 읽되 account binding 같은 derived projection을 섞지 않는 계약을 확인했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 DB apply 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- Auth/User Scope 쪽은 `src/app/api`에서 `withCurrentPlanningUser` 직접 사용이 검색되지 않았고, coverage test가 routeAuth boundary를 고정하고 있었습니다.
- 직전 PostgreSQL readiness는 계좌와 초기잔액 dry-run apply까지만 검증했고, planning v3 batch `.ndjson` 거래 row는 PostgreSQL 목표 `Transaction` row로 투영하지 못했습니다.
- 실제 DB apply 전에도 저장된 raw transaction row가 BigInt 금액 계약, idempotent upsert, rollback probe 대상에 포함된다는 증거가 필요했습니다.

## 핵심 변경
- dry-run apply 대상에 `planning-v3/batches/*.ndjson`와 `users/{userId}/planning-v3/batches/*.ndjson`를 추가했습니다.
- 저장된 raw transaction row만 PostgreSQL `transactions` table operation으로 투영하고, batch index의 계좌 binding은 파생 보정으로 섞지 않았습니다.
- in-memory apply state와 checksum digest에 `transactions` table을 포함했습니다.
- transaction 금액도 public number API safe integer 계약을 넘으면 readiness 단계에서 실패하도록 했습니다.
- transaction-only fixture로 rollback probe, idempotent upsert, target table count를 테스트로 고정했습니다.

## 검증
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `corepack pnpm vitest run tests/planning/auth/postgresReadinessScript.test.ts tests/planning/auth/postgresMapperContract.test.ts tests/planning/auth/postgresSchemaContract.test.ts` (3 files, 18 tests)
- PASS: `node scripts/planning_postgres_readiness.mjs --dry-run > /tmp/planning-postgres-readiness-transaction-apply.json`
- PASS: parsed actual dry-run `dry-run-apply` step showed `targetedFiles=0`, `operations=0`, `targetTables.transactions=0`, `rollbackProbe.status=SKIPPED`
- PASS: `corepack pnpm --silent planning:postgres:readiness`
- PASS: `corepack pnpm planning:auth:check` (25 files, 171 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm test` (698 files, 2242 tests)
- PASS: `corepack pnpm build`

## 남은 리스크
- [미완료] 실제 PostgreSQL DB apply는 아직 구현되지 않았고 `--apply`는 계속 의도적으로 차단되어 있습니다.
- [미완료] disposable PostgreSQL transaction fixture, confirmed apply, 실제 DB rollback/partial apply 검증은 다음 migration readiness 라운드 범위입니다.
- [검증 필요] 실제 사용자 데이터에 batch `.ndjson`가 생기면 dry-run apply가 `targetTables.transactions`와 rollback probe를 실제 operation으로 실행하는지 다시 확인해야 합니다.
