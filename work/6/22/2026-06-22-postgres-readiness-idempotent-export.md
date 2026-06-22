# 2026-06-22 PostgreSQL readiness idempotent export

## 변경 파일
- `scripts/planning_postgres_readiness.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-idempotent-export.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록 이후 이번 라운드를 Auth 확인 후 PostgreSQL migration readiness 보강으로 분류했습니다.
- `planning-gate-selector`: script/test 변경에 맞춰 syntax check, targeted vitest, auth gate, lint, full test, build를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 DB apply 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- Auth/User Scope 표준화 후보를 먼저 확인했지만, `src/app/api`의 `withCurrentPlanningUser` 직접 사용과 주요 planning auth bypass 패턴은 검색과 coverage test에서 남아 있지 않았습니다.
- 직전 PostgreSQL readiness 라운드의 남은 리스크 중 dry-run export가 같은 `--out-dir`에 반복 실행될 때 stale 관리 파일을 남길 수 있는 경계가 있었습니다.
- 실제 DB apply 전에도 export 산출물이 원본을 부분적으로 오염시키지 않고, 재실행 가능한 상태를 유지한다는 증거가 필요했습니다.

## 핵심 변경
- dry-run export를 `outDir/files`에 직접 쓰지 않고 `.files.tmp-*` staging 디렉터리에 완성한 뒤 교체하도록 변경했습니다.
- 실패 시 staging 파일과 임시 manifest를 정리해 partial export 산출물이 남지 않게 했습니다.
- 반복 dry-run에서 기존 `files` 관리 디렉터리를 교체해 stale 파일이 checksum compare를 깨지 않도록 했습니다.
- `--out-dir`이 `--data-dir` 내부인 경우 파일을 쓰기 전에 실패한다는 회귀 테스트를 추가했습니다.
- 같은 `--out-dir` 재실행, stale 파일 제거, checksum PASS, 임시 파일 부재를 테스트로 고정했습니다.

## 검증
- PASS: `node --check scripts/planning_postgres_readiness.mjs`
- PASS: `corepack pnpm vitest run tests/planning/auth/postgresReadinessScript.test.ts tests/planning/auth/postgresSchemaContract.test.ts` (2 files, 9 tests)
- PASS: `corepack pnpm vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/auth/routeAuth.test.ts tests/planning/auth/authConfigContract.test.ts` (3 files, 51 tests)
- PASS: `corepack pnpm --silent planning:postgres:readiness`
- PASS: `corepack pnpm planning:auth:check` (24 files, 162 tests)
- PASS: `node scripts/planning_postgres_readiness.mjs --dry-run --out-dir=/tmp/finance-postgres-readiness-export-current`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm test` (697 files, 2233 tests)
- PASS: `corepack pnpm build`
- PASS: `git diff --check`
- NOTE: WSL `bash -lc`로 `/tmp` export 결과를 요약하려던 1회 명령은 PowerShell 중첩 따옴표 문제로 실패했고, 같은 검증은 direct `node ... --out-dir=/tmp/finance-postgres-readiness-export-current`로 재실행해 PASS 확인했습니다.

## 남은 리스크
- [미완료] 실제 PostgreSQL DB apply, table roundtrip mapper, rollback/partial DB apply 검증은 아직 구현하지 않았습니다.
- [미완료] confirmed apply는 계속 의도적으로 차단되어 있으며, 향후 별도 라운드에서 manifest/export/apply/checksum/rollback 계약을 DB까지 확장해야 합니다.
- [검증 필요] PostgreSQL 목표 테이블로 옮긴 뒤 기존 API number 계약을 보존하는 mapper 테스트가 아직 필요합니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
