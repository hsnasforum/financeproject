# 2026-06-22 PostgreSQL readiness connection check

## 변경 파일
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-connection-check.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 작업 라우팅과 Spark 조건부 지침 확인.
- `planning-gate-selector`: PostgreSQL readiness 변경에 맞는 최소 검증 세트 선정.
- `work-log-closeout`: `/work` 종료 기록 형식 확인.

## 변경 이유
- confirmed apply는 아직 의도적으로 막혀 있지만, disposable PostgreSQL 대상에서 연결 가능성만 확인하는 preflight 증거가 필요했습니다.
- 기본 apply 경로는 외부 DB에 접속하지 않도록 유지하고, 명시적인 `--check-db-connection` 옵션에서만 `SELECT 1` 연결 확인을 수행하도록 분리했습니다.
- DB URL 원문, 비밀번호, query 포함 URL이 출력에 섞이지 않도록 redaction 계약을 테스트로 고정했습니다.
- AGENTS.md의 Spark 조건부 모델 지침은 확인했으며, 이번 라운드는 즉시 막는 핵심 경로 구현과 최종 검증이라 메인 에이전트가 단일 소유자로 진행했습니다.

## 핵심 변경
- `--check-db-connection` apply 옵션을 추가했습니다.
- 옵션이 없으면 `confirmedApply.databaseConnection`은 `SKIPPED/check_not_requested`로 남깁니다.
- 옵션이 있으면 Prisma `db execute --stdin`으로 `SELECT 1`을 실행하고 PASS/FAIL, exitCode, timeoutMs, redacted message를 기록합니다.
- PostgreSQL target preflight 실패 시 연결 확인은 `SKIPPED/database_target_failed`로 둡니다.
- 테스트는 기본 skip, PostgreSQL URL redaction, 가짜 PostgreSQL 포트 실패 증거를 검증합니다.

## 검증
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts` (13 tests)
- PASS(expected exit 1): `node scripts/planning_postgres_readiness.mjs --apply "--confirm=APPLY POSTGRES READINESS"`; local `.env.local`의 `file:` target으로 `databaseTarget.status=FAIL`, `databaseConnection.status=SKIPPED`.
- PASS(expected exit 1): `DATABASE_URL=postgresql://finance_user:super-secret@127.0.0.1:1/finance_test node scripts/planning_postgres_readiness.mjs --apply --check-db-connection "--confirm=APPLY POSTGRES READINESS"`; `databaseTarget.status=PASS`, `databaseConnection.status=FAIL`, 비밀번호 미노출.
- PASS: `corepack pnpm planning:postgres:readiness`
- PASS: `corepack pnpm planning:auth:check` (25 files, 175 tests)
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm lint`
- PASS: `git diff --check`

## 남은 리스크
- 실제 PostgreSQL schema apply, transaction rollback, partial apply, idempotent upsert의 DB 실적용은 아직 구현 전입니다.
- 이번 연결 확인은 명시 옵션에서만 수행되며, disposable PostgreSQL fixture를 자동 기동하지 않습니다.
- 정상 PostgreSQL 서버에 대한 PASS smoke는 별도 `DATABASE_URL`이 준비된 환경에서 추가 확인이 필요합니다.

## 다음 라운드 우선순위
- disposable PostgreSQL fixture 또는 CI 전용 ephemeral DB를 붙여 connection PASS smoke를 자동화합니다.
- 이후 confirmed apply 구현 전 단계로 schema apply dry-run, rollback transaction, checksum compare의 실제 DB 경로를 분리합니다.
