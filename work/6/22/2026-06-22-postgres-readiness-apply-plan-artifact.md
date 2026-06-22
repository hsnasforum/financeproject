# 2026-06-22 Postgres readiness apply plan artifact

## 변경 파일
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-apply-plan-artifact.md`

## 사용 skill
- `finance-skill-routing`: Auth/User Scope 잔여 확인 뒤 PostgreSQL Migration Readiness 라운드로 범위를 좁혔습니다.
- `planning-gate-selector`: script/test 변경에 맞춰 문법 확인, targeted vitest, readiness gate, lint, typecheck를 선택했습니다.
- `work-log-closeout`: 실행한 검증과 남은 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- 기존 readiness gate는 manifest/export/checksum, schema SQL dry-run, in-memory apply/rollback/idempotency 증거를 갖고 있었습니다.
- confirmed apply를 열기 전에는 실제 DB write 없이도 어떤 table/key가 적용 대상인지 검토 가능한 계획 산출물이 필요합니다.
- dry-run export가 있을 때만 별도 파일을 남기고, 기본 `planning:postgres:readiness` 실행은 source data와 export directory를 변경하지 않아야 합니다.

## 핵심 변경
- `--out-dir` dry-run에서 `apply-plan.json`을 원자적으로 기록하도록 추가했습니다.
- apply plan은 table, key, userId, source, row checksum, table counts, preflight checks, 전체 checksum을 담습니다.
- 계좌명과 금액 같은 원문 row 값은 `apply-plan.json`에 직접 복제하지 않도록 테스트로 고정했습니다.
- `--out-dir`이 없는 기본 readiness 실행은 `applyPlan.written=false`와 checksum만 JSON에 노출합니다.
- confirmed apply는 계속 `BLOCKED`이며 실제 DB write는 열지 않았습니다.

## 검증
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts` (13 tests)
- PASS: `corepack pnpm planning:postgres:readiness`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `git diff --check`

## 남은 리스크
- disposable PostgreSQL fixture와 실제 transaction rollback 검증은 아직 없습니다.
- confirmed apply는 여전히 구현되지 않았고, `--apply`는 의도적으로 차단 상태입니다.

## 다음 라운드
- disposable PostgreSQL target에서 generated SQL apply smoke 또는 DB transaction dry-run을 분리해 검증합니다.
