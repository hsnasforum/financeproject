# 2026-06-22 PostgreSQL readiness schema validate

## 변경 파일
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-schema-validate.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`와 현재 목표를 기준으로 PostgreSQL migration readiness 라운드로 범위를 좁혔습니다.
- `planning-gate-selector`: script/test/schema gate 변경에 맞춰 syntax check, targeted vitest, readiness/auth gate, lint, typecheck를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 DB apply 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- 기존 readiness dry-run은 `schema.postgres.prisma`의 provider/model count와 checksum을 확인했지만, Prisma 자체 schema validation 실패를 별도 게이트로 드러내지는 않았습니다.
- schema.prisma 승격 전 검증 게이트를 강화하려면 PostgreSQL 목표 스키마가 Prisma CLI 기준으로 유효한지도 manifest/export/apply/checksum 흐름 안에서 확인해야 합니다.

## 핵심 변경
- `planning_postgres_readiness.mjs`에 `schema-validate` step을 추가했습니다.
- 로컬 `node_modules/.bin/prisma validate --schema <postgres schema>`를 호출해 PostgreSQL 목표 스키마의 Prisma validation 결과를 JSON readiness 출력에 포함합니다.
- schema provider/model count가 맞지 않거나 Prisma validation이 실패하면 dry-run gate가 실패합니다.
- invalid PostgreSQL schema fixture 테스트를 추가해 `schema-validate` FAIL 경로를 고정했습니다.
- confirmed apply 요청은 계속 차단하되, manifest/export/schema/apply/checksum preflight evidence를 JSON으로 출력하도록 했습니다.

## 검증
- PASS: `corepack pnpm exec prisma validate --schema prisma/schema.postgres.prisma`
- PASS: `corepack pnpm exec prisma validate --schema prisma/schema.prisma`
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts` (11 tests)
- PASS: `corepack pnpm planning:postgres:readiness`
- PASS: `corepack pnpm planning:auth:check` (25 files, 173 tests)
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm lint`

## 남은 리스크
- 실제 PostgreSQL 연결 기반 confirmed apply는 아직 구현하지 않았고, `--apply`는 계속 의도적으로 차단되어 있습니다.
- confirmed apply preflight는 증거 출력만 수행하며 source data mutation과 실제 DB write는 하지 않습니다.
- Prisma validation은 schema 문법/관계 유효성 게이트이며, disposable PostgreSQL DB에서의 transaction rollback, partial apply, idempotent upsert 증거를 대체하지 않습니다.
- `schema-validate` step 추가로 readiness script 테스트 시간이 늘었습니다. 현재 targeted test는 약 15초, `planning:auth:check`는 약 20초로 통과했습니다.

## 다음 라운드
- disposable PostgreSQL 환경 또는 명시적 DB URL 계약을 추가하기 전에, confirmed apply 입력 조건과 rollback fixture 요구사항을 문서/스크립트 계약으로 더 좁힙니다.
