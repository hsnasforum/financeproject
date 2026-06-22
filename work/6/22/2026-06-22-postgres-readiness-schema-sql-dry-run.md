# 2026-06-22 PostgreSQL readiness schema SQL dry-run

## 변경 파일
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-schema-sql-dry-run.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 작업 라우팅과 Spark 조건부 지침을 확인했습니다.
- `planning-gate-selector`: PostgreSQL readiness script/test 변경에 맞춰 syntax check, targeted vitest, readiness dry-run, auth/security 묶음, lint, typecheck를 선택했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 DB apply 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- Prisma schema validation만으로는 PostgreSQL DDL 출력에 핵심 table, BIGINT/DECIMAL/JSONB type, foreign key, SQLite marker 부재가 반영되는지 확인하기 어렵습니다.
- confirmed apply를 열기 전에 `prisma migrate diff --from-empty --to-schema <schema> --script` 출력이 PostgreSQL target shape를 유지하는지 readiness gate 안에서 증거로 남겨야 합니다.

## 핵심 변경
- readiness dry-run에 `schema-sql-dry-run` step을 추가했습니다.
- PostgreSQL schema의 generated SQL에서 주요 table, create table count, BIGINT/DECIMAL/JSONB type, foreign key, SQLite marker 부재를 점검합니다.
- SQL 출력은 byte size와 checksum만 노출하고 raw SQL 본문은 JSON 결과에 포함하지 않습니다.
- invalid schema fixture에서 `schema-validate`와 `schema-sql-dry-run`이 함께 FAIL로 노출되는 테스트를 추가했습니다.

## 검증
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts` (13 tests)
- PASS: `corepack pnpm planning:postgres:readiness`
- PASS: `corepack pnpm planning:auth:check` (25 files, 175 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `git diff --check`
- 환경 확인: `docker --version`은 `command not found`, `psql --version`은 `command not found`로 현재 로컬에서 disposable PostgreSQL PASS smoke를 직접 실행할 수 없었습니다.

## 남은 리스크
- `schema-sql-dry-run`은 generated SQL 정적 증거이며 disposable PostgreSQL DB에 실제 schema를 적용하지는 않습니다.
- 실제 DB connection PASS, transaction rollback, partial apply, idempotent upsert 실적용 검증은 아직 다음 라운드 범위입니다.

## 다음 라운드
- disposable PostgreSQL fixture에서 generated SQL apply, rollback transaction, checksum compare를 실제 DB 경로로 검증합니다.
