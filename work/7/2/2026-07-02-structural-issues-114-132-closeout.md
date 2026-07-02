# 2026-07-02 구조 Issue #114-#132 구현 closeout

## 사용 skill
- `github:github`: 기존 Issue/PR 상태 확인, 신규 Issue URL 정리
- `dart-data-source-hardening`: FINLIFE/public data source 범위 확인
- `planning-gate-selector`: planning v2 route/core/store 변경 검증 세트 선정
- `work-log-closeout`: 변경, 검증, 잔여 리스크 기록
- `manager` subagent: 첨부 후보 12개를 5단계 실행 범위로 분해

## 등록/매핑 Issue
- 신규 등록: #128, #129, #130, #131, #132
- 기존 매핑: #114, #115, #116, #117, #119, #124

## 이번 라운드 구현
- #128: planning core service의 provider default 생성을 제거하고 server wrapper가 provider wiring을 담당하도록 분리했다.
- #129: production planning file-store topology guard를 `scripts/planning_storage_mode_guard.mjs`로 분리하고 테스트를 추가했다.
- #130: planning v2 mutation route의 same-origin/CSRF 확인을 `assertPlanningWriteGuard`로 통일하고 scanner contract를 갱신했다.
- #116: runStore retention 대상 선정 로직을 `runRetention` 순수 helper로 분리하고 단위 테스트를 추가했다.
- #132: package scripts를 required/recommended/manual/release/data/desktop 범주로 정리한 문서를 추가했다.

## 확인한 기존 충족 항목
- #114: FINLIFE product route 6개가 모두 `createFinlifeProductRoute`와 `getFinlifeProductsForHttp` gateway를 사용한다.
- #115: 공식 planning route/API와 deprecated alias/legacy compute 정책이 `docs/current-screens.md`, `src/lib/planning/routes.ts`, route adapter/headers/meta에 반영되어 있다.
- #117: create run parser/preflight/stage plan/assembler/adapter 분리와 경계 테스트가 이미 존재한다.
- #131: PostgreSQL readiness dry-run, mapper/schema contract, report-only apply 차단이 이미 존재한다.

## 주요 변경 파일
- `src/lib/planning/core/v2/service.ts`
- `src/lib/planning/server/v2/service.ts`
- `src/lib/planning/v2/service.ts`
- `src/lib/planning/api/writeGuard.ts`
- `src/app/api/planning/v2/**/route.ts`
- `src/lib/planning/store/runStore.ts`
- `src/lib/planning/store/runRetention.ts`
- `scripts/planning_storage_mode_guard.mjs`
- `scripts/next_prod_safe.mjs`
- `scripts/security_route_guard_scan.mjs`
- `scripts/planning_v2_route_guard_scan.mjs`
- `docs/package-scripts.md`
- `README.md`
- 관련 테스트: `tests/planning-v2/service.test.ts`, `tests/planning-v2-api/guards.test.ts`, `tests/planning-v2-api/write-guard-contract.test.ts`, `tests/planning-storage-mode-guard.test.ts`, `tests/planning/runRetention.test.ts`

## 실행한 확인
- `pnpm test tests/planning-v2/service.test.ts`: PASS, 3 tests
- `pnpm typecheck`: PASS
- `pnpm test tests/planning-storage-mode-guard.test.ts tests/planning/storage-consistency-recovery.test.ts tests/planning/store/planningStoreNamespace.test.ts tests/planning/ops-safety.test.ts`: PASS, 16 tests
- `node --check scripts/planning_storage_mode_guard.mjs && node --check scripts/next_prod_safe.mjs`: PASS
- `pnpm test tests/planning-v2-api/guards.test.ts tests/planning-v2-api/write-guard-contract.test.ts tests/planning-v2-api/simulate-route.test.ts tests/planning-v2-api/optimize-route.test.ts tests/planning-v2-api/profiles-route.test.ts tests/planning-v2-api/actions-route.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2-api/debt-strategy-route.test.ts tests/planning-v2-api/monte-carlo-route.test.ts tests/planning-v2-api/trash-route.test.ts tests/planning-v2-api/reports-route.test.ts tests/planning-v2-api/share-report-route.test.ts`: PASS, 45 tests
- `pnpm test tests/planning/runRetention.test.ts tests/planning-store.test.ts`: PASS, 20 tests
- `pnpm test tests/finlife-product-route-gateway.test.ts tests/finlife-http-error-debug.test.ts tests/finlife-fallback-mode.test.ts tests/finlife-products-http-cache.test.ts`: PASS, 8 tests
- `pnpm planning:ssot:check`: PASS, 9 tests
- `pnpm planning:postgres:readiness`: PASS, dry-run/report-only evidence generated
- `pnpm test tests/planning/auth/postgresSchemaContract.test.ts tests/planning/auth/postgresMapperContract.test.ts tests/planning/auth/postgresReadinessScript.test.ts`: PASS, 24 tests
- `pnpm test tests/quality-gates-registry.test.ts`: PASS, 4 tests
- `pnpm lint`: PASS
- `pnpm release:verify`: PASS, includes planning complete, compat, regress, postgres readiness, full test, advisory SSOT
- `pnpm build`: PASS

## Public API / 응답 shape / DB query / cache 영향
- Public URL은 변경하지 않았다.
- Planning v2 mutation route의 CSRF 실패 public error code는 기존 planning error normalization에 맞춰 `CSRF`로 유지된다. 원본 `CSRF_MISMATCH`는 내부 DevGuard code로만 남고 route 응답은 planning error mapper를 거친다.
- `/api/planning/run`, `/api/planning/v2/run`, `/api/planning/v2/runs`의 응답 shape와 deprecated headers/meta 정책은 바꾸지 않았다.
- FINLIFE route response shape, cache/fallback header 계약, snapshot replay 정책은 바꾸지 않았다.
- DB schema와 Prisma query는 변경하지 않았다. `planning:postgres:readiness`는 report-only dry-run이며 운영 DB mutation을 실행하지 않는다.
- Planning file-store 포맷은 변경하지 않았다. production startup guard helper와 retention 대상 선정 helper만 분리했다.

## 남은 리스크
- #116은 retention 대상 선정만 분리했다. index read/write, migration, trash, legacy fallback까지 더 쪼개는 작업은 별도 PR 단위가 안전하다.
- #117은 이미 분리된 helper와 테스트가 있지만 `createRunService.ts`는 여전히 orchestration 중심 파일이다. 추가 분리는 persistence/audit/metrics adapter 경계를 기준으로 별도 진행하는 편이 안전하다.
- #119, #124는 기존 구현과 테스트가 있는 것으로 확인했지만, 이번 라운드에서 별도 코드 변경은 하지 않았다.
- #128/#130은 v2 core/API 변경으로 freeze guard가 `[v2-core-change]` visibility를 요구한다. 현재 PR #127 제목에는 해당 태그가 있다.

## 다음 라운드 우선순위
- #116의 run index read/write helper 분리
- #117의 persistence/audit/metrics adapter 추가 분리
- #119 user scope와 #124 route policy manifest를 별도 audit 후 닫을 수 있는지 확인
