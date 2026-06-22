# 2026-06-22 PostgreSQL readiness database target

## 변경 파일
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-database-target.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`와 현재 목표를 기준으로 PostgreSQL migration readiness 라운드를 이어갔습니다.
- `planning-gate-selector`: readiness script/test 변경에 맞춰 syntax check, targeted vitest, readiness/auth gate, typecheck, lint를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 DB apply 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- confirmed apply는 아직 실제 DB write를 열지 않지만, operator preflight에서 `DATABASE_URL`이 PostgreSQL target인지 확인하지 않으면 SQLite/local URL로도 apply 전 단계가 지나간 것처럼 보일 수 있습니다.
- `DATABASE_URL`에는 사용자명/비밀번호가 포함될 수 있으므로 readiness JSON에는 raw URL을 노출하지 않아야 합니다.

## 핵심 변경
- confirmed apply preflight에 `databaseTarget` 검사를 추가했습니다.
- `DATABASE_URL`은 `process.env`, `.env.local`, `env.local`, `.env` 순서로 읽고, `postgresql://` 또는 `postgres://`만 PASS로 인정합니다.
- SQLite/file URL, 누락, invalid URL은 `confirmedApply.preflightStatus=FAIL`로 노출합니다.
- PostgreSQL URL은 host/database/redactedUrl만 출력하고 password/query string은 출력하지 않습니다.
- 테스트에서 non-PostgreSQL target 실패와 PostgreSQL target redaction 성공을 각각 고정했습니다.

## 검증
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts` (12 tests)
- PASS: `node scripts/planning_postgres_readiness.mjs --apply "--confirm=APPLY POSTGRES READINESS"` expected exit 1, `databaseTarget.status=FAIL`, `protocol=file`, raw secret 없음
- PASS: `corepack pnpm planning:postgres:readiness`
- PASS: `corepack pnpm planning:auth:check` (25 files, 174 tests)
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm lint`

## 남은 리스크
- 실제 PostgreSQL 연결 기반 confirmed apply는 아직 구현하지 않았고, `--apply`는 계속 `BLOCKED`입니다.
- 이번 검사는 DB target URL의 provider와 redaction 계약만 검증하며, 실제 네트워크 연결, schema apply, transaction rollback, partial apply, idempotent upsert 검증은 아직 없습니다.
- 현재 로컬 `.env.local`의 `DATABASE_URL`은 `file:` URL이라 confirmed apply preflight는 의도적으로 FAIL입니다.

## 다음 라운드
- disposable PostgreSQL fixture 또는 명시적 `DATABASE_URL` smoke 환경에서 실제 연결 전용 check를 분리해 추가합니다.
