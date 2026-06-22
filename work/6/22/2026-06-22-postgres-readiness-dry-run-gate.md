# 2026-06-22 PostgreSQL readiness dry-run gate

## 변경 파일
- `package.json`
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-dry-run-gate.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드를 PostgreSQL migration readiness 구현/검증 라운드로 분류하고 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: schema, ops/script, migration readiness 변경에 맞춰 script syntax, targeted test, auth gate, lint, build, full test를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 migration 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- PostgreSQL target schema contract는 복원됐지만, SQLite `.data/planning` 파일 저장소를 manifest/export/dry-run apply/checksum compare 순서로 검증하는 게이트가 없었습니다.
- 실제 DB apply 전 단계에서 원본 데이터가 변하지 않는지, export 결과가 manifest checksum과 일치하는지 확인하는 실행 가능한 readiness 증거가 필요했습니다.
- confirmed apply는 아직 구현하지 않은 상태이므로 `--apply`가 실수로 통과하지 않게 명시적으로 차단해야 했습니다.

## 핵심 변경
- `scripts/planning_postgres_readiness.mjs`를 추가해 SQLite/PostgreSQL schema 요약, `.data/planning` manifest, 선택적 export, checksum compare를 dry-run으로 실행합니다.
- `--out-dir` export는 repo 내부/상위/동일 경로를 거부하고, 기본 실행은 원본 `.data/planning`을 변경하지 않습니다.
- `--apply`는 `--confirm="APPLY POSTGRES READINESS"`가 있어도 현재는 미구현 오류로 중단되게 했습니다.
- `package.json`에 `planning:postgres:readiness` 스크립트를 추가했습니다.
- `tests/planning/auth/postgresReadinessScript.test.ts`로 fixture export/checksum/source non-mutation, apply 차단, package script wiring을 검증했습니다.
- 실제 repository `.data/planning` 기준 `/tmp` export dry-run에서 `manifest/export/dry-run-apply/checksum-compare`가 모두 PASS였습니다.

## 검증
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `corepack pnpm vitest run tests/planning/auth/postgresReadinessScript.test.ts tests/planning/auth/postgresSchemaContract.test.ts` (2 files, 7 tests)
- PASS: `node scripts/planning_postgres_readiness.mjs --dry-run > /tmp/planning-postgres-readiness.json`
- PASS: `corepack pnpm --silent planning:postgres:readiness > /tmp/planning-postgres-readiness-pnpm.json`
- PASS: `node scripts/planning_postgres_readiness.mjs --dry-run --out-dir="$(mktemp -d /tmp/finance-postgres-readiness-export.XXXXXX)" > /tmp/planning-postgres-readiness-export.json`
- PASS: `corepack pnpm planning:auth:check` (24 files, 160 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm test` (697 files, 2231 tests)
- PASS: `git diff --check`

## 남은 리스크
- [미완료] 실제 PostgreSQL DB apply와 table roundtrip mapper는 아직 구현하지 않았습니다.
- [미완료] confirmed apply는 의도적으로 차단되어 있으며, 향후 별도 라운드에서 manifest/export/apply/checksum/rollback 계약을 확장해야 합니다.
- [검증 필요] file-store DTO를 PostgreSQL 목표 테이블로 옮긴 뒤 기존 API number 계약을 보존하는 mapper 검증은 다음 migration readiness 라운드에서 추가해야 합니다.

## 다음 라운드
- PostgreSQL table roundtrip mapper를 실제 목표 table shape와 연결하고 API number 계약을 보존하는 검증을 확장합니다.
- confirmed apply는 manifest/export/apply/checksum/rollback 계약을 먼저 좁힌 뒤 별도 라운드에서 해제합니다.
