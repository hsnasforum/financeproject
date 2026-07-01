# 2026-06-30 PR 재구성 준비도 감사

## 변경 파일
- `work/6/30/2026-06-30-pr-reconstruction-readiness.md`
- `work/6/30/2026-06-30-dirty-worktree-pr-map.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드는 docs-only PR 재구성 감사이므로 `git diff --check`와 상태 확인을 최소 검증으로 선택했습니다.
- `work-log-closeout`: 실제 확인한 dirty 파일, diff 통계, PR 분리 리스크를 `/work` 표준 형식으로 기록했습니다.

## 변경 이유
- 현재 aggregate 브랜치에는 기준 SHA 이후 커밋과 uncommitted follow-up이 섞여 있습니다.
- 사용자가 commit/push/PR을 금지했기 때문에 지금 독립 PR을 만들 수는 없습니다.
- GitHub 작업이 허용되는 즉시 aggregate 브랜치를 그대로 push하지 않고 PR 단위로 재구성할 수 있도록 최신 dirty 상태를 고정했습니다.

## 핵심 변경
- tracked modified 21파일, untracked 19파일을 현재 기준으로 재확인했습니다.
- tracked diff 통계는 736 insertions / 974 deletions입니다.
- P0-02 follow-up, ops evidence, P2-03/P2-04/P2-05/P2-06, final report/audit 문서 그룹으로 재분류했습니다.
- P0-02 follow-up은 기존 `645bf614`/`6be7c0de` 위에 얹는 것이 가장 자연스럽고, ops evidence는 `scripts/planning_v2_ops_safety.mjs`가 P0-03 계열 파일과 겹치므로 실제 PR 분리 시 dependency 판단이 필요합니다.
- 이번 라운드에서도 stage, commit, branch 생성, push, PR은 수행하지 않았습니다.

## 검증
- `git diff --name-status --` PASS:
  - tracked modified 21파일 확인
- `git diff --stat --` PASS:
  - 21 files changed, 736 insertions(+), 974 deletions(-)
- `git ls-files --others --exclude-standard` PASS:
  - untracked 19파일 확인
- `git diff --numstat --` PASS:
  - 가장 큰 tracked diff는 `src/components/planning/workspace/useWorkspaceRuntimeBundle.ts` 91 additions / 723 deletions
  - `tests/planning/ops-safety.test.ts` 253 additions
  - `scripts/planning_v2_ops_safety.mjs` 138 additions / 3 deletions
- `git status --short --branch --untracked-files=normal` PASS:
  - staged 파일 없음
  - 현재 브랜치 `codex/p2-05-quality-gates`

## 재구성 후보
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
- Ops evidence / local topology:
  - `docs/planning-v2-ops.md`
  - `scripts/planning_v2_ops_safety.mjs`
  - `tests/planning/ops-safety.test.ts`
  - 관련 `/work` evidence 문서
- P2-03 legacy planner guard:
  - `docs/planner-deprecated-cleanup.md`
  - `scripts/planner_deprecated_guard.mjs`
- P2-04 workspace hook split:
  - `src/components/planning/workspace/useWorkspaceRuntimeBundle.ts`
  - `src/components/planning/workspace/workspaceRuntimeHelpers.ts`
  - `src/components/planning/workspace/useWorkspaceRuntimeStateBundle.ts`
  - `src/components/planning/workspace/useWorkspaceFeedbackSubmitAction.ts`
  - `src/components/planning/workspace/useWorkspaceOptimizeAction.ts`
  - `src/components/planning/workspace/useWorkspaceProfileSyncAction.ts`
  - `src/components/planning/workspace/useWorkspaceRunExecutionActions.ts`
- P2-05 gate stability:
  - `tests/desktop-artifact-provenance.test.ts`
  - `tests/planning-v3-store-concurrency.test.ts`
  - `tests/planning/auth/postgresReadinessScript.test.ts`
- P2-06 boundary docs:
  - `docs/planning-v3-boundary-adr.md`
  - `docs/README.md`
  - `src/lib/planning/v3/README.md`
- Final report / audit:
  - `work/6/29/2026-06-29-0629-delivery-completion-audit.md`
  - `work/6/29/2026-06-29-0629-delivery-final-report-draft.md`
  - `work/6/29/2026-06-29-0629-delivery-revalidation.md`
  - `work/6/30/*.md`

## 남은 리스크
- [deferred GitHub publishing] 독립 branch/commit/PR은 현재 범위 밖입니다.
- [deferred external verification] 원격 CI는 현재 범위 밖입니다.
- [deferred external verification] 실제 production inventory/topology는 현재 범위 밖입니다.
- [검증 필요] PR 재구성 시 같은 파일을 여러 PR에서 만지면 cherry-pick 충돌이 날 수 있습니다. 특히 `scripts/planning_v2_ops_safety.mjs`, `docs/planning-v2-ops.md`, `/work` 보고서 묶음은 제출 순서 결정이 필요합니다.
