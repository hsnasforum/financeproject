# 2026-06-30 전달문 요구사항 evidence index

## 변경 파일
- `work/6/30/2026-06-30-requirement-evidence-index.md`
- `work/6/29/2026-06-29-0629-delivery-final-report-draft.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드는 docs-only 증거 인덱스 보강이므로 검색과 `git diff --check`를 최소 검증으로 선택했습니다.
- `work-log-closeout`: 실제 확인한 코드·테스트·문서·로그 증거와 deferred external verification 항목을 `/work` 표준 형식으로 기록했습니다.

## 변경 이유
- 최종 보고서는 요구사항별로 어떤 코드, 테스트, 문서, 명령 결과가 증명 근거인지 바로 추적할 수 있어야 합니다.
- 이미 로컬 gate는 통과했지만, PR/운영 증거처럼 현재 범위 밖인 deferred external verification 항목과 로컬 완료 항목을 더 명확히 분리해야 합니다.
- GitHub 재개 시 reviewer가 원본 대화 없이도 P0/P1 책임 변화를 검토할 수 있도록 evidence index를 추가했습니다.

## 핵심 변경
- P0/P1 핵심 요구사항별 코드 위치, 테스트 위치, 문서 위치, 실행 gate를 표로 정리했습니다.
- P2 구조 개선 후보와 최종 보고서 필수 항목별 증거 위치를 추가로 정리했습니다.
- 검색 실패가 난 shell 명령은 증거에서 제외하고 PowerShell `Select-String` 재실행 결과만 사용했습니다.
- 최신 로컬 gate 로그 파일의 존재를 확인했습니다.
- 이번 라운드에서도 stage, commit, branch 생성, push, PR은 수행하지 않았습니다.

## Evidence index
| 요구사항 | 코드 증거 | 테스트/문서 증거 | 판정 |
|---|---|---|---|
| P0-01 storage ownership invariant | `src/lib/planning/store/namespace.ts:49`, `src/lib/planning/auth/currentUser.ts:85`, `scripts/next_prod_safe.mjs:37` | `tests/planning/auth/currentUser.test.ts:106`, `tests/planning/store/planningStoreNamespace.test.ts:179`, `docs/deploy.md:51`, `docs/planning-v2-ops.md:242` | 로컬 완료 |
| P0-02 user-facing legacy transaction 제거 | `src/lib/planning/v3/service/userFacingBatchReadPolicy.ts:6`, `src/app/api/planning/v3/draft/apply/route.ts:205`, `scripts/planning_v2_static_guard.mjs:389` | `tests/planning-v2-static-guard.test.ts:14`, `tests/planning-v3-batches-api.test.ts:521`, `tests/planning-v3-getBatchSummary.test.ts:257`, `tests/planning-v3-draft-apply-api.test.ts:209` | 로컬 완료, 운영 legacy 수량 deferred external verification |
| P0-03 replace restore atomicity | `src/lib/ops/backup/backupRestoreRouteService.ts:196`, `src/lib/ops/backup/backupRestoreRouteService.ts:202`, `src/lib/ops/backup/planningDataVault.ts:150`, `src/lib/ops/backup/planningDataVault.ts:239` | `tests/planning/ops/backup-api.test.ts`, `tests/planning/ops/ops-backup-restore-route-service-boundary.test.ts`, `work/6/28/2026-06-28-p0-03-restore-atomicity.md` | 로컬 완료 |
| P1-01 storage error semantics | `src/lib/planning/storage/serverFileRead.ts:3`, `src/lib/planning/storage/serverFileRead.ts:16`, `src/lib/planning/storage/serverFileRead.ts:63`, `src/lib/planning/api/storageErrorResponse.ts:18` | `tests/planning-v3-storage-error-api.test.ts:74`, `tests/planning-v3-storage-error-api.test.ts:85`, `tests/planning-v3-storage-error-api.test.ts:106` | 로컬 완료 |
| P1-02 mutation serialization | `src/lib/planning/storage/storeWriteLock.ts:13`, `src/lib/planning/store/runStore.ts:796`, `src/lib/planning/v3/store/batchesStore.ts` | `tests/planning-store-concurrency.test.ts`, `tests/planning-v3-store-concurrency.test.ts`, `tests/planning/storage-consistency-recovery.test.ts`, `docs/deploy.md:54` | 로컬 process-local 완료, multi-process 운영 검증 deferred external verification |
| P1-03 Action Center SSOT | `src/lib/planning/store/runActionStore.ts`, `src/lib/planning/server/runs/repository.ts`, `src/lib/planning/server/runs/routeService.ts` | `tests/planning-v2-api/run-action-center-ssot.test.ts`, `tests/planning-v2-api/run-action-progress-route.test.ts`, `work/6/28/2026-06-28-p1-04-action-center-ssot.md` | 로컬 완료 |
| P1-04 draft family boundary | `src/lib/planning/v3/store/draftStore.ts:32`, `src/lib/planning/v3/store/draftStore.ts:77`, `src/lib/planning/v3/store/draftStore.ts:493` | `tests/planning-v3-draft-boundary.test.ts:98`, `tests/planning-v3-draft-boundary.test.ts:106` | 로컬 완료 |
| P1-05 desktop artifact provenance | `scripts/planning_v2_desktop_build.mjs:205`, `scripts/planning_v2_desktop_build.mjs:228`, `scripts/planning_v2_desktop_provenance.mjs:43`, `.gitignore:25` | `tests/desktop-artifact-provenance.test.ts:30`, `tests/desktop-artifact-provenance.test.ts:40`, `tests/desktop-artifact-provenance.test.ts:93`, `docs/planning-v2-desktop-local.md:43` | 로컬 완료 |
| P1-06 v3 source root | `tsconfig.planning-v3.json:9`, `scripts/planning_v2_desktop_build.mjs:14`, `src/lib/planning/v3/README.md:13` | `tests/planning-v3-canonical-source-contract.test.ts:35`, `tests/planning-v3-canonical-source-contract.test.ts:47`, `tests/planning-v3-canonical-source-contract.test.ts:60`, `docs/planning-v3-boundary-adr.md:14` | 로컬 완료 |
| P1-07 run application service | `src/lib/planning/server/runs/createRunService.ts:761`, `src/lib/planning/server/runs/createRunRouteAdapter.ts:32`, `src/app/api/planning/v2/run/route.ts:1`, `src/app/api/planning/v2/runs/route.ts:62` | `tests/planning-v2-api/create-run-service-boundary.test.ts:21`, `tests/planning-v2-api/persistence-routes.test.ts:421`, `tests/planning-store.test.ts:243` | 로컬 완료 |
| P1-08 report SSOT | `src/app/planning/reports/_lib/reportViewModel.ts:42`, `src/app/planning/reports/_lib/reportViewModel.ts:535`, `src/app/planning/reports/_lib/reportViewModel.ts:571` | `tests/planning/report-canonical-contract.test.ts:133`, `tests/planning/report-canonical-contract.test.ts:184`, `docs/planning-v2-architecture.md:36`, `docs/planner-deprecated-cleanup.md:36` | 로컬 완료 |
| P1-09 depositProtection contract | `src/app/api/products/unified/route.ts:127`, `src/lib/sources/unified.ts:62`, `src/lib/sources/unifiedEnrichPolicy.ts:1`, `src/lib/sources/unifiedEnrichPolicy.ts:14` | `tests/products-unified-route.test.ts:193`, `tests/unified-enrich.test.ts:26`, `tests/unified-enrich.test.ts:45`, `docs/unified-catalog-contract.md:13` | 로컬 완료 |
| P1-10 public API provenance | `src/lib/publicApis/contracts/types.ts:124`, `src/lib/publicApis/contracts/types.ts:137`, `src/app/api/public/fx/route.ts:25`, `src/app/api/public/housing/sales/route.ts:11` | `tests/public-api-provenance.test.ts:28`, `tests/public-api-provenance.test.ts:95`, `docs/api-utilization-draft.md:288`, `docs/data-sources-settings-ops.md:36` | 로컬 완료 |
| 최종 local gates | `tmp/latest-pnpm-lint.log`, `tmp/latest-pnpm-typecheck.log`, `tmp/latest-pnpm-test.log`, `tmp/latest-planning-auth-check.log`, `tmp/latest-planning-user-scope-check.log`, `tmp/latest-release-verify.log`, `tmp/latest-pnpm-build.log` | `work/6/30/2026-06-30-local-gate-refresh.md` | 로컬 완료 |
| 운영 topology/inventory | `scripts/planning_v2_ops_safety.mjs:122`, `scripts/planning_v2_ops_safety.mjs:127`, `docs/planning-v2-ops.md:87` | `work/6/30/2026-06-30-local-topology-env-inventory.md`, production report 없음 | deferred external verification |
| 독립 PR/원격 CI | `work/6/30/2026-06-30-pr-commit-file-matrix.md`, `work/6/30/2026-06-30-github-unblock-playbook.md` | PR/CI 없음 | deferred external verification |

## P2 evidence index
| 요구사항 | 코드/문서 증거 | 검증/상태 증거 | 판정 |
|---|---|---|---|
| P2-01 runStore 읽기 부작용 제거 | `src/lib/planning/store/runRecordCodec.ts`, `src/lib/planning/store/runStore.ts` | `tests/planning-store.test.ts`, commit `08353c8a` | 로컬 완료 |
| P2-02 unified source adapter 경계 | `src/lib/sources/unified.ts`, `src/lib/sources/unifiedLoaders.ts`, `src/lib/sources/unifiedTypes.ts` | `tests/unified-source-loaders.test.ts`, commit `078e5dd1` | 로컬 완료 |
| P2-03 legacy planner deprecation guard | `docs/planner-deprecated-cleanup.md`, `scripts/planner_deprecated_guard.mjs` | `work/6/30/2026-06-30-dirty-worktree-pr-map.md`, `node --check scripts/planner_deprecated_guard.mjs`, `corepack pnpm planner:deprecated:guard` | 로컬 follow-up 완료, PR 분리 deferred external verification |
| P2-04 workspace hook 책임 분리 | `src/components/planning/workspace/useWorkspaceRuntimeBundle.ts`, `src/components/planning/workspace/workspaceRuntimeHelpers.ts`, `src/components/planning/workspace/useWorkspaceRuntimeStateBundle.ts`, `src/components/planning/workspace/useWorkspaceFeedbackSubmitAction.ts`, `src/components/planning/workspace/useWorkspaceOptimizeAction.ts`, `src/components/planning/workspace/useWorkspaceProfileSyncAction.ts`, `src/components/planning/workspace/useWorkspaceRunExecutionActions.ts` | `work/6/30/2026-06-30-dirty-worktree-pr-map.md`, workspace targeted tests 3 files / 15 tests PASS 기록 | 로컬 follow-up 완료, PR 분리 deferred external verification |
| P2-05 architecture guard/release gate 단일화 | `scripts/quality_gates.mjs`, `scripts/quality_gates_runner.mjs`, `scripts/release_verify.mjs`, `tests/quality-gates-registry.test.ts` | commit `d9e853cd`, `corepack pnpm release:verify` PASS | 로컬 완료 |
| P2-06 v2/v3 boundary ADR | `docs/planning-v3-boundary-adr.md`, `docs/README.md`, `src/lib/planning/v3/README.md` | `work/6/30/2026-06-30-dirty-worktree-pr-map.md`, 문서 링크 확인 기록 | 로컬 follow-up 완료, PR 분리 deferred external verification |
| P2-07 PostgreSQL/Prisma 전환 경계 | `docs/planning-v3-boundary-adr.md`, `scripts/planning_postgres_readiness.mjs`, `tests/planning/auth/postgresReadinessScript.test.ts` | `corepack pnpm planning:postgres:readiness` PASS dry-run, rollback probe `SKIPPED`, actual disposable target rollback 미실행 | 로컬 dry-run 완료, 실제 target rollback deferred external verification |

## 최종 보고서 체크리스트
| 필수 항목 | 현재 증거 | 판정 |
|---|---|---|
| 시작 SHA / 종료 SHA | `work/6/29/2026-06-29-0629-delivery-final-report-draft.md` 시작/종료 SHA 섹션 | 로컬 완료 |
| 작업 브랜치와 PR/커밋 목록 | 최종 보고서 초안 PR/커밋 목록, `work/6/30/2026-06-30-pr-commit-file-matrix.md` | 커밋 목록 완료, 실제 PR deferred external verification |
| Issue별 변경 파일과 책임 변화 | 최종 보고서 초안 커밋별 변경 파일 요약, Issue별 책임 변화 | 로컬 완료 |
| 수정 전 실패와 수정 후 성공 증거 | 최종 보고서 초안 수정 전 실패와 수정 후 성공 증거 섹션 | 로컬 완료, 기준 SHA 재실행은 미수행 |
| 실행한 명령과 결과 | 최종 보고서 초안 실행 명령과 결과, `work/6/30/2026-06-30-local-gate-refresh.md` | 로컬 완료 |
| migration dry-run 대상/성공/conflict/quarantine 수 | 최종 보고서 초안 Migration 대상/충돌/quarantine 섹션, `work/6/30/2026-06-30-synthetic-ops-evidence.md`, `work/6/30/2026-06-30-deferred-external-verification.md` | 로컬 완료, production 수량 deferred external verification |
| rollback 또는 recovery 검증 | 최종 보고서 초안 Rollback 검증 섹션, production runbook | 로컬 부분 완료, disposable PostgreSQL target rollback deferred external verification |
| API/storage/env/deploy 변화 | 최종 보고서 초안 호환성/API/storage/env/deploy 변화 섹션 | 로컬 완료 |
| desktop artifact manifest와 clean working tree 증거 | 최종 보고서 초안 Desktop artifact clean 증거 섹션 | 로컬 artifact 완료, 전체 clean worktree는 intentionally dirty |
| 남은 불확실성과 후속 Issue | 최종 보고서 초안 남은 불확실성과 후속 issue 섹션 | 로컬 완료 |

## 검증
- `git rev-parse HEAD main origin/main` PASS:
  - HEAD `baf6325ecdadb3a2b249c0946490ec48887430ab`
  - main/origin/main `5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5`
- `git status --short --branch --untracked-files=normal` PASS:
  - staged 파일 없음
  - modified/untracked 파일 존재
- PowerShell `Select-String`으로 P0/P1 코드·테스트·문서 증거를 확인했습니다.
- 최신 local gate 로그 존재 확인 PASS:
  - `tmp/latest-pnpm-lint.log`
  - `tmp/latest-pnpm-typecheck.log`
  - `tmp/latest-pnpm-test.log`
  - `tmp/latest-planning-auth-check.log`
  - `tmp/latest-planning-user-scope-check.log`
  - `tmp/latest-release-verify.log`
  - `tmp/latest-pnpm-build.log`
  - `tmp/latest-planning-v2-ops-safety.log`
- 미사용 증거:
  - PowerShell quoting으로 실패한 `rg`/bash pipe 명령 출력은 증거로 쓰지 않았고, `Select-String` 또는 별도 PowerShell 명령으로 재실행했습니다.
- 2026-06-30 추가 보강 검증:
  - 전달문 `P2 구조 개선 후보`, `필수 검증 게이트`, `최종 보고서 필수 항목` 섹션을 확인했습니다.
  - `work/6/30/2026-06-30-dirty-worktree-pr-map.md`, `work/6/30/2026-06-30-local-gate-refresh.md`, `work/6/30/2026-06-30-local-topology-env-inventory.md`를 근거로 P2/최종 보고서 매핑을 갱신했습니다.
- 2026-06-30 deferred external verification 정정:
  - 로컬 synthetic fixture와 dry-run 대체 검증 결과는 `work/6/30/2026-06-30-deferred-external-verification.md`에 기록했습니다.

## 남은 리스크
- [deferred external verification] 독립 branch/commit/PR과 원격 CI는 현재 범위 밖입니다.
- [deferred external verification] 실제 production topology/env와 legacy inventory/conflict/quarantine 수는 운영 환경 report가 필요합니다.
- [검증 필요] 이 evidence index는 추적용 문서입니다. 실제 PR 재구성 시 각 PR 브랜치에서 targeted gate를 다시 실행해야 합니다.
