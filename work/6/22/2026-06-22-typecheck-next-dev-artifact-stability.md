# 2026-06-22 Typecheck next dev artifact stability

## 변경 파일
- `tsconfig.json`
- `work/6/22/2026-06-22-typecheck-next-dev-artifact-stability.md`

## 사용 skill
- `finance-skill-routing`: 최신 PostgreSQL readiness 기록 이후 이번 라운드를 DB mapper/typecheck 안정화 라운드로 분류했습니다.
- `planning-gate-selector`: 타입 설정과 migration readiness contract 검증에 맞춰 targeted vitest, auth gate, lint, typecheck, build를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 PostgreSQL DB apply 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- PostgreSQL readiness mapper contract 확인 중 `pnpm typecheck`가 repo 소스가 아닌 stale `.next/dev/types/validator.ts`의 dev 생성물 참조에 실패했습니다.
- Next build는 `.next/dev/types/**/*.ts` include 항목을 기대해 자동으로 되돌리므로 include는 유지해야 했습니다.
- `tsc --noEmit` 기본 게이트는 stale dev artifact에 흔들리지 않아야 하므로 `.next/dev/**`를 exclude에 명시해 baseline typecheck를 안정화했습니다.

## 핵심 변경
- `tsconfig.json`의 include에는 Next가 요구하는 `.next/dev/types/**/*.ts` 항목을 유지했습니다.
- `exclude`에 `.next/dev/**`를 추가해 stale dev 생성물이 `pnpm typecheck`를 깨지 않게 했습니다.
- mapper contract의 BigInt literal 호환성은 현재 브랜치의 `7791c438 Align postgres mapper test compatibility`에 이미 반영된 상태임을 확인했습니다.
- `tests/playwright-install-chromium.test.ts`의 env fixture 타입 보강도 현재 브랜치 기준에 반영된 상태임을 확인했습니다.

## 검증
- PASS: `corepack pnpm vitest run tests/planning/auth/postgresMapperContract.test.ts tests/planning/auth/postgresSchemaContract.test.ts` (2 files, 9 tests)
- PASS: `corepack pnpm vitest run tests/playwright-install-chromium.test.ts tests/planning/auth/postgresMapperContract.test.ts` (2 files, 7 tests)
- PASS: `corepack pnpm vitest run tests/playwright-install-chromium.test.ts tests/planning/auth/postgresMapperContract.test.ts tests/planning/auth/postgresSchemaContract.test.ts` (3 files, 11 tests)
- PASS: `corepack pnpm planning:auth:check` (25 files, 167 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm test` (698 files, 2238 tests)
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `git diff --check`
- NOTE: `corepack pnpm lint -- --quiet`는 저장소 lint script와 맞지 않아 `--quiet`를 파일 패턴으로 해석해 실패했습니다. 같은 lint 검증은 `corepack pnpm lint`로 재실행해 PASS 확인했습니다.
- NOTE: `corepack pnpm typecheck` 최초 실행은 mapper 테스트의 BigInt literal, stale `.next/dev/types`, 기존 playwright env fixture 타입 때문에 실패했습니다. mapper/playwright 항목은 현재 브랜치 커밋에 반영됐고, stale `.next/dev/types` 항목은 이번 `tsconfig.json` 변경으로 PASS 전환했습니다.

## 남은 리스크
- [미완료] 실제 PostgreSQL DB apply, table roundtrip persistence, rollback/partial DB apply 검증은 아직 구현하지 않았습니다.
- [미완료] confirmed apply는 계속 의도적으로 차단된 상태이며, 다음 라운드에서 실제 DB apply 전용 격리 fixture와 rollback 계약이 필요합니다.
- [주의] `pnpm build`는 Next가 `tsconfig.json` include에 `.next/dev/types/**/*.ts`가 없으면 자동으로 다시 추가합니다. 이번 변경은 include를 유지하고 exclude로 dev artifact 영향을 차단하는 방식입니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
