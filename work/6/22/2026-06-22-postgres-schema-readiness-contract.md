# 2026-06-22 PostgreSQL schema readiness contract

## 변경 파일
- `prisma/schema.postgres.prisma`
- `tests/planning/auth/postgresSchemaContract.test.ts`
- `work/6/22/2026-06-22-postgres-schema-readiness-contract.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록을 기준으로 이번 라운드를 Auth/DB readiness 구현 라운드로 분류했습니다.
- `planning-gate-selector`: 스키마/계약 테스트 변경에 맞춰 Prisma validate, auth 게이트, lint, build, 전체 test를 선택했습니다.
- `work-log-closeout`: 변경 파일, 실제 실행 검증, 남은 migration 리스크를 종료 기록으로 남겼습니다.

## 변경 이유
- 목표 문서의 PostgreSQL target schema 계약은 `prisma/schema.postgres.prisma`를 기준으로 하지만, 현재 트리에는 해당 파일이 없었습니다.
- SQLite 런타임 스키마를 그대로 두면서 PostgreSQL 전환 후보 스키마를 별도 파일로 복원하고, 다시 누락되지 않도록 계약 테스트를 추가했습니다.
- 금액은 `BigInt`, 금리/비율은 `Decimal`, Auth.js `Account`와 금융 `FinancialAccount`는 별도 모델로 유지하는 목표 계약을 고정했습니다.

## 핵심 변경
- `prisma/schema.postgres.prisma`를 PostgreSQL provider와 별도 client output을 가진 28개 모델 target schema로 복원했습니다.
- `tests/planning/auth/postgresSchemaContract.test.ts`를 추가해 SQLite 14개 모델과 PostgreSQL 28개 모델 분리를 검증합니다.
- Auth.js `Account`와 재무 계좌 `FinancialAccount` 분리, `providerAccountId`/`balanceKrw` 혼입 방지, 금액/비율 타입 계약을 테스트로 고정했습니다.
- active `prisma/schema.prisma`는 SQLite provider/runtime schema로 유지했습니다.

## 검증
- PASS: `corepack pnpm prisma validate --schema prisma/schema.postgres.prisma`
- PASS: `corepack pnpm vitest run tests/planning/auth/postgresSchemaContract.test.ts tests/planning/auth/authConfigContract.test.ts`
- PASS: `corepack pnpm planning:auth:check` (23 files, 157 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm test` (696 files, 2228 tests)
- PASS: `git diff --check`

## 남은 리스크
- [미완료] PostgreSQL 실제 DB에 migrate/apply 하지 않았습니다. 이번 라운드는 target schema 복원과 contract test에 한정했습니다.
- [미완료] SQLite `.data/planning` export, dry-run apply, checksum compare, confirmed apply 게이트는 아직 별도 구현이 필요합니다.
- [검증 필요] PostgreSQL target schema와 현재 file-store DTO 사이의 mapper/roundtrip 검증은 후속 migration readiness 라운드에서 추가해야 합니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
