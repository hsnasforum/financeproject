# 2026-07-02 구조 Issue #114-#132 구현 closeout

## 변경 파일
- `src/lib/planning/core/v2/service.ts`
- `src/lib/planning/server/v2/service.ts`
- `src/lib/planning/v2/service.ts`
- `src/lib/planning/api/writeGuard.ts`
- `src/app/api/planning/v2/**/route.ts`
- `src/lib/planning/store/runStore.ts`
- `src/lib/planning/store/runRetention.ts`
- `src/lib/planning/store/runIndex.ts`
- `src/lib/planning/server/runs/createRunService.ts`
- `src/lib/planning/server/runs/createRunSideEffects.ts`
- `scripts/planning_storage_mode_guard.mjs`
- `scripts/next_prod_safe.mjs`
- `scripts/security_route_guard_scan.mjs`
- `scripts/planning_v2_route_guard_scan.mjs`
- `docs/package-scripts.md`
- `README.md`
- 관련 테스트: `tests/planning-v2/service.test.ts`, `tests/planning-v2-api/guards.test.ts`, `tests/planning-v2-api/write-guard-contract.test.ts`, `tests/planning-v2-api/create-run-service-boundary.test.ts`, `tests/planning-v2-api/create-run-side-effects.test.ts`, `tests/planning-v2-api/persistence-routes.test.ts`, `tests/planning-storage-mode-guard.test.ts`, `tests/planning/runRetention.test.ts`, `tests/planning/runIndex.test.ts`

## 사용 skill
- `github:github`: 기존 Issue/PR 상태 확인, 신규 Issue URL 정리
- `dart-data-source-hardening`: FINLIFE/public data source 범위 확인
- `planning-gate-selector`: planning v2 route/core/store 변경 검증 세트 선정
- `route-ssot-check`: #124 route SSOT 영향이 신규 route 변경이 아닌 기존 정합성 확인 범위임을 점검
- `work-log-closeout`: 변경, 검증, 잔여 리스크 기록
- `manager` subagent: 첨부 후보 12개를 실행 범위와 검증 흐름으로 재분해

## 변경 이유
- 통합 Markdown 기준 구조 Issue를 GitHub Issue로 등록/매핑하고, public API/응답 shape를 깨지 않는 범위에서 우선순위가 높은 구조 리스크를 줄이기 위해서다.
- #116은 retention helper만 분리된 상태에서 run index 계약이 `runStore.ts` 내부에 남아 있어 저장소 일관성 테스트 경계가 약했다.
- #117은 create-run orchestration에서 audit/metrics 실패 보호 로직이 service 내부에 남아 있어 route contract와 side effect 경계 검증이 약했다.

## 핵심 변경
- 신규 Issue #128~#132를 등록하고 기존 #114, #115, #116, #117, #119, #124와 함께 PR #127 구현 범위로 매핑했다.
- #128: planning core service의 provider default 생성을 제거하고 server wrapper가 provider wiring을 담당하도록 분리했다.
- #129: production planning file-store topology guard를 `scripts/planning_storage_mode_guard.mjs`로 분리하고 테스트를 추가했다.
- #130: planning v2 mutation route의 same-origin/CSRF 확인을 `assertPlanningWriteGuard`로 통일하고 scanner contract를 갱신했다.
- #116: run retention 대상 선정과 run index payload/parse/build 계약을 각각 `runRetention`, `runIndex` helper로 분리했다.
- #117: create-run audit/metrics side effect 실패 보호를 `createRunSideEffects` helper로 분리하고 service boundary test를 갱신했다.

## 검증
- `pnpm test tests/planning-v2/service.test.ts`: PASS, 3 tests
- `pnpm typecheck`: PASS
- `pnpm test tests/planning-storage-mode-guard.test.ts tests/planning/storage-consistency-recovery.test.ts tests/planning/store/planningStoreNamespace.test.ts tests/planning/ops-safety.test.ts`: PASS, 16 tests
- `node --check scripts/planning_storage_mode_guard.mjs && node --check scripts/next_prod_safe.mjs`: PASS
- `pnpm test tests/planning-v2-api/guards.test.ts tests/planning-v2-api/write-guard-contract.test.ts tests/planning-v2-api/simulate-route.test.ts tests/planning-v2-api/optimize-route.test.ts tests/planning-v2-api/profiles-route.test.ts tests/planning-v2-api/actions-route.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2-api/debt-strategy-route.test.ts tests/planning-v2-api/monte-carlo-route.test.ts tests/planning-v2-api/trash-route.test.ts tests/planning-v2-api/reports-route.test.ts tests/planning-v2-api/share-report-route.test.ts`: PASS, 45 tests
- `corepack pnpm test tests/planning/runIndex.test.ts tests/planning/runRetention.test.ts tests/planning-store.test.ts`: PASS, 24 tests
- `corepack pnpm test tests/planning-v2-api/create-run-side-effects.test.ts tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/create-run-service-modules.test.ts tests/planning-v2-api/persistence-routes.test.ts`: PASS, 19 tests
- `pnpm test tests/finlife-product-route-gateway.test.ts tests/finlife-http-error-debug.test.ts tests/finlife-fallback-mode.test.ts tests/finlife-products-http-cache.test.ts`: PASS, 8 tests
- `pnpm planning:ssot:check`: PASS, 9 tests
- `pnpm planning:user-scope:check`: PASS, 15 files / 88 tests
- `pnpm planning:auth:check`: PASS, 13 files / 75 tests
- `pnpm planning:postgres:readiness`: PASS, dry-run/report-only evidence generated
- `pnpm test tests/planning/auth/postgresSchemaContract.test.ts tests/planning/auth/postgresMapperContract.test.ts tests/planning/auth/postgresReadinessScript.test.ts`: PASS, 24 tests
- `pnpm test tests/quality-gates-registry.test.ts`: PASS, 4 tests
- `corepack pnpm lint`: PASS
- `corepack pnpm planning:v2:complete`: PASS, includes planning guard, security scan, report/guide tests, smoke, fast e2e 6 tests
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases and full e2e 8 tests
- `corepack pnpm test`: PASS, 758 files / 2513 tests
- `corepack pnpm build`: PASS
- `git diff --check`: PASS
- 참고: plain `pnpm`은 현재 WSL shell PATH에서 발견되지 않아 `corepack pnpm`으로 재실행했다. `corepack pnpm planning:v2:compat` 1회는 내부 complete exit 1로 실패했으나, `--keep-sandbox` 재실행에서 migration+complete까지 PASS했다.

## Public API / 응답 shape / DB query / cache 영향
- Public URL은 변경하지 않았다.
- `/api/planning/run`, `/api/planning/v2/run`, `/api/planning/v2/runs`의 응답 shape와 deprecated headers/meta 정책은 바꾸지 않았다.
- Planning run index 저장 payload는 기존 `version: 1`, `entries` shape를 유지했다. 변경은 parse/build helper 분리와 단위 테스트 추가뿐이다.
- Planning v2 mutation route의 CSRF 실패 public error code는 기존 planning error normalization에 맞춰 `CSRF`로 유지된다. 원본 `CSRF_MISMATCH`는 내부 DevGuard code로만 남고 route 응답은 planning error mapper를 거친다.
- FINLIFE route response shape, cache/fallback header 계약, snapshot replay 정책은 바꾸지 않았다.
- DB schema와 Prisma query는 변경하지 않았다. `planning:postgres:readiness`는 report-only dry-run이며 운영 DB mutation을 실행하지 않는다.
- Cache 동작은 변경하지 않았다.

## 남은 리스크
- #116은 run index 계약을 분리했지만 migration, trash, legacy fallback까지 완전한 backend rewrite로 쪼개지는 않았다. 추가 분리는 별도 PR 단위가 안전하다.
- #117은 audit/metrics side effect 경계를 분리했지만 `createRunService.ts`가 orchestration 소유자인 점은 유지했다. persistence adapter 추가 분리는 API contract 재검증을 포함한 별도 작업이 안전하다.
- #119, #124는 기존 구현과 테스트로 충족을 확인했으며 이번 라운드에서 별도 코드 변경은 하지 않았다.
- #128/#130/#116/#117은 v2 core/API 변경으로 freeze guard가 `[v2-core-change]` visibility를 요구한다. 현재 PR #127 제목에는 해당 태그가 있다.

## 다음 라운드 우선순위
- PR #127 리뷰에서 #116 legacy fallback/trash/migration 경계 추가 분리 필요 여부를 결정한다.
- PR #127 리뷰에서 #117 persistence adapter 분리를 별도 후속으로 둘지 결정한다.
- merge 전 GitHub Actions 최신 run이 모두 PASS인지 확인한다.
