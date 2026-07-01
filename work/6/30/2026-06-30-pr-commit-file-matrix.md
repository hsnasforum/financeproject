# 2026-06-30 PR 커밋/파일/검증 매트릭스

## 변경 파일
- `work/6/30/2026-06-30-pr-commit-file-matrix.md`
- `work/6/30/2026-06-30-github-unblock-playbook.md`

## 사용 skill
- `planning-gate-selector`: PR 후보별 변경 분류와 최소 검증 명령을 분리하기 위해 사용했습니다.
- `work-log-closeout`: 실제 확인한 커밋/파일/dirty 상태와 deferred external verification 항목을 `/work` 표준 형식으로 기록했습니다.

## 변경 이유
- 전달문은 P0-01, P0-02, P0-03을 독립 PR 단위로 먼저 처리하라고 요구합니다.
- 현재는 commit/push/PR이 금지되어 실제 PR을 만들 수 없으므로, GitHub 재개 시 사용할 로컬 재구성 매트릭스를 남깁니다.
- aggregate 브랜치 `codex/p2-05-quality-gates`를 그대로 push하지 않도록 PR별 커밋, dirty 파일, 검증 범위를 분리했습니다.

## 핵심 변경
- 기준 SHA 이후 로컬 커밋 18개를 PR 후보별로 다시 매핑했습니다.
- 현재 dirty tracked 21파일과 untracked 19파일을 별도 follow-up 후보로 분리했습니다.
- PR별 targeted gate와 최종 통합 gate를 구분했습니다.
- 이번 라운드에서도 stage, commit, branch 생성, push, PR은 수행하지 않았습니다.

## PR 매트릭스
| PR 후보 | 포함 커밋/파일 | 주요 책임 변화 | 검증 |
|---|---|---|---|
| P0-01 storage ownership | `aac556ab`; `.env*`, `docs/deploy.md`, `docs/planning-v2-ops.md`, `scripts/next_prod_safe.mjs`, `src/lib/planning/auth/currentUser.ts`, `src/lib/planning/store/namespace.ts`, auth/store tests | production/auth required에서 namespace 또는 명시적 single-user 모드 강제 | `corepack pnpm test tests/planning/auth/currentUser.test.ts tests/planning/auth/routeAuth.test.ts tests/planning/store/planningStoreNamespace.test.ts`, `corepack pnpm planning:auth:check`, `corepack pnpm planning:user-scope:check`, `corepack pnpm lint`, `corepack pnpm typecheck` |
| P0-02 legacy transaction removal | `645bf614`, `6be7c0de`; dirty `scripts/planning_v2_static_guard.mjs`, `src/app/api/planning/v3/draft/apply/route.ts`, `src/lib/planning/v3/service/userFacingBatchReadPolicy.ts`, batch read helpers/tests | 사용자 노출 거래 경로를 stored-first/canonical로 제한하고 legacy는 migration/quarantine 경로로 격리 | P0-02 v3 targeted tests, `corepack pnpm planning:v2:guard`, `corepack pnpm planning:user-scope:check`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build` |
| P0-03 restore atomicity | `e266ddf9`; `scripts/planning_v2_ops_run.mjs`, `scripts/planning_v2_ops_safety.mjs`, backup vault/service tests | backup replace를 staging/commit 구조로 원자화 | `corepack pnpm test tests/planning/ops/backup-api.test.ts tests/planning/ops/ops-backup-restore-route-service-boundary.test.ts`, `corepack pnpm planning:v2:ops:safety`, `corepack pnpm lint`, `corepack pnpm typecheck` |
| P1-01 storage error semantics | `d1860e73` | not-found/corrupt/unavailable 분리, 빈 상태 축약 방지 | `corepack pnpm test tests/planning-v3-storage-error-api.test.ts tests/planning-v3-accountsStore.test.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts`, `corepack pnpm lint`, `corepack pnpm typecheck` |
| P1-02 mutation serialization | `dccfc284` | file store read-modify-write process-local 직렬화와 consistency guard | `corepack pnpm test tests/planning-store-concurrency.test.ts tests/planning-v3-store-concurrency.test.ts tests/planning/storage-consistency-recovery.test.ts`, `corepack pnpm lint`, `corepack pnpm typecheck` |
| P1-03 Action Center SSOT | `2d47134f` | Action Center 별도 file canonical, run meta는 summary | `corepack pnpm test tests/planning-v2-api/run-action-center-ssot.test.ts tests/planning-v2-api/run-action-progress-route.test.ts`, `corepack pnpm planning:v2:compat`, `corepack pnpm lint` |
| P1-04 draft family | `5b6564d9` | cashflow/profile/import preview draft 저장 경계 분리 | `corepack pnpm test tests/planning-v3-draft-boundary.test.ts`, `corepack pnpm typecheck` |
| P1-05 desktop artifact provenance | `d74f8038` | `.dist` source tracking 제거, desktop manifest package/git/lockfile/checksum provenance | `corepack pnpm test tests/desktop-artifact-provenance.test.ts`, `corepack pnpm planning:v2:desktop:build`, `corepack pnpm planning:v2:desktop:smoke` |
| P1-06 v3 source root | `856f1801` | `src/lib/planning/v3` canonical root와 packaging 경계 정리 | `corepack pnpm test tests/planning-v3-canonical-source-contract.test.ts tests/desktop-artifact-provenance.test.ts`, `corepack pnpm typecheck` |
| P1-07 run application service | `f1cfe174`, `08353c8a` | run 생성 route adapter와 application service 분리, runStore read purity | `corepack pnpm test tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning-store.test.ts`, `corepack pnpm planning:v2:guard` |
| P1-08 report SSOT | `92b4d559` | report/dashboard raw run 재해석 제거, canonical report contract 사용 | `corepack pnpm test tests/planning/report-canonical-contract.test.ts tests/planner-compute-route-auth.test.ts`, `corepack pnpm planning:v2:regress` |
| P1-09 depositProtection | `64ade8f0` | `depositProtection` supported/rejected mode를 API 계약으로 노출 | `corepack pnpm test tests/products-unified-route.test.ts tests/unified-enrich.test.ts` |
| P1-10 public API provenance | `e90e51ff` | public API 성공 응답에 live/mock/degraded provenance 포함 | `corepack pnpm test tests/public-api-provenance.test.ts`, `corepack pnpm lint` |
| P2/follow-up | `078e5dd1`, `d9e853cd`, `baf6325e`; dirty P2-03/P2-04/P2-05/P2-06 files | source loader 분리, quality gates, rounding, planner guard, workspace hook split, boundary docs | 각 dirty map의 targeted tests 후 최종 `lint`, `typecheck`, `test`, `planning:auth:check`, `planning:user-scope:check`, `release:verify`, `build` |

## Dirty follow-up 분리
- P0-02 follow-up:
  - `scripts/planning_v2_static_guard.mjs`
  - `src/app/api/planning/v3/draft/apply/route.ts`
  - `src/lib/planning/v3/service/userFacingBatchReadPolicy.ts`
  - `src/lib/planning/v3/service/batchReadRepository.ts`
  - `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`
  - `src/lib/planning/v3/service/getBatchSummary.ts`
  - `src/lib/planning/v3/service/loadBatchVisiblePipeline.ts`
  - `tests/planning-v2-static-guard.test.ts`
  - `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `tests/planning-v3-batches-api.test.ts`
  - `tests/planning-v3-draft-apply-api.test.ts`
  - `tests/planning-v3-getBatchSummary.test.ts`
- Ops evidence/topology:
  - `docs/planning-v2-ops.md`
  - `scripts/planning_v2_ops_safety.mjs`
  - `tests/planning/ops-safety.test.ts`
  - 관련 `/work` evidence 문서
- P2-03/P2-04/P2-05/P2-06/final report:
  - `docs/planner-deprecated-cleanup.md`
  - `scripts/planner_deprecated_guard.mjs`
  - `src/components/planning/workspace/*`
  - `tests/desktop-artifact-provenance.test.ts`
  - `tests/planning-v3-store-concurrency.test.ts`
  - `tests/planning/auth/postgresReadinessScript.test.ts`
  - `docs/planning-v3-boundary-adr.md`
  - `docs/README.md`
  - `src/lib/planning/v3/README.md`
  - `work/6/29/*.md`
  - `work/6/30/*.md`

## 검증
- `git log --reverse --name-only --pretty=format:'--- %h %s' 5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5..HEAD` PASS.
- `git diff --name-only --` PASS, tracked modified 21 files.
- `git ls-files --others --exclude-standard` PASS, untracked 19 files.
- `git branch --show-current` PASS, `codex/p2-05-quality-gates`.

## 남은 리스크
- [deferred GitHub publishing] 이 매트릭스는 재개용 문서입니다. 실제 branch 생성, cherry-pick, stage, commit, push, PR은 현재 범위 밖입니다.
- [deferred external verification] 원격 CI는 현재 범위 밖입니다.
- [deferred external verification] 실제 production inventory/topology는 현재 범위 밖입니다.
- [검증 필요] 실제 PR 재구성 시 파일 충돌이 나면 이 문서보다 현재 코드 dependency와 최소 변경 원칙을 우선합니다.
