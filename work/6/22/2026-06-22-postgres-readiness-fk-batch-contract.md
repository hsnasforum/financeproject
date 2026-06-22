# 2026-06-22 PostgreSQL readiness FK batch contract

## 변경 파일
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-fk-batch-contract.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 기본/조건부 skill 적용 범위 확인.
- `planning-gate-selector`: PostgreSQL readiness 스크립트 변경에 맞는 최소 검증 세트 선택.
- `planning-v3-batch-contract-narrowing`: planning v3 batch 저장 계약과 raw/source id 경계 확인.
- `work-log-closeout`: 이번 라운드 종료 기록 형식 정리.

## 변경 이유
- PostgreSQL dry-run apply가 `Transaction.batchId`, `Transaction.financialAccountId`, `OpeningBalance.financialAccountId` 관계를 실제 DB 제약처럼 검증하지 못하면, confirmed apply 구현 전까지 외래키 실패를 뒤늦게 발견할 수 있습니다.
- planning v3 파일 저장소의 사용자별 source id는 PostgreSQL 전역 primary key와 다르므로, dry-run row id를 user-scoped deterministic id로 바꿔 사용자 소유권 경계를 명시했습니다.

## 핵심 변경
1. `batches/index.json`과 `.ndjson` 파일에서 `TransactionBatch` dry-run operation을 생성합니다.
2. 동일 batch는 synthetic row와 index row가 중복될 수 있어, 같은 table/key operation은 마지막 metadata로 합칩니다.
3. FinancialAccount, OpeningBalance, Transaction, TransactionBatch dry-run row id를 `userId + sourceId` 기반 deterministic id로 생성합니다.
4. dry-run apply 결과에 `referentialIntegrity`를 추가해 누락 account/batch와 cross-user 참조를 FAIL로 노출합니다.
5. accountId가 있지만 매칭 FinancialAccount row가 없는 transaction fixture를 실패 회귀 테스트로 추가했습니다.

## 검증
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts` (10 tests)
- PASS: `corepack pnpm planning:postgres:readiness`
- PASS: `corepack pnpm planning:auth:check` (25 files, 172 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`

## 남은 리스크
- 실제 PostgreSQL 연결을 사용한 confirmed apply는 아직 구현하지 않았고, `--apply`는 계속 차단 상태입니다.
- 현재 `.data/planning`에는 target planning-v3 account/batch 파일이 없어 live readiness의 apply operation 수는 0입니다. 실제 사용자 거래 데이터가 들어오면 referentialIntegrity 결과를 다시 확인해야 합니다.
- PostgreSQL disposable DB fixture, partial apply rollback, confirmed apply/idempotent upsert 검증은 다음 라운드에서 별도 구현이 필요합니다.

## 다음 라운드
- confirmed apply를 열기 전에 disposable PostgreSQL fixture로 transaction batch/account 외래키, partial apply rollback, idempotent upsert 계약을 검증합니다.
