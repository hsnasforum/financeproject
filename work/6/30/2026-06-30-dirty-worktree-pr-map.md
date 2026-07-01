# 2026-06-30 dirty worktree PR map

## 변경 파일
- `work/6/30/2026-06-30-dirty-worktree-pr-map.md`

## 사용 skill
- `planning-gate-selector`: 현재 변경 파일을 route/API, ops script, docs, UI hook, gate 안정화 범위로 나누고 각 PR 후보별 검증을 분리하기 위해 사용했습니다.
- `work-log-closeout`: 실제 확인한 dirty 파일 목록과 실행 명령을 `/work` 표준 형식으로 남기기 위해 사용했습니다.

## 변경 이유
- 현재 브랜치에는 기준 SHA 이후 커밋뿐 아니라 여러 uncommitted follow-up이 함께 있습니다.
- 사용자가 billing 해결 전 commit/push/PR 금지를 지시했기 때문에 지금 원격 작업은 하지 않습니다.
- GitHub 작업이 재개되면 aggregate dirty worktree를 그대로 push하지 않고, 파일별로 올바른 PR에 재구성해야 합니다.

## 핵심 변경
- 현재 modified/untracked 파일 전체를 PR 소속 후보로 분류했습니다.
- P0-02 user-facing legacy 제거 follow-up과 ops evidence follow-up을 분리했습니다.
- P2 문서/guard/hook/gate 안정화 follow-up을 기능 PR과 섞지 않도록 분리 기준을 남겼습니다.
- 이번 라운드에서는 stage, commit, branch 생성, push, PR을 수행하지 않았습니다.

## 검증
- `git status --short --branch --untracked-files=normal` PASS:
  - 현재 브랜치 `codex/p2-05-quality-gates`
  - staged 파일 없음
  - modified/untracked 파일 존재
- `git diff --name-status -- && git ls-files --others --exclude-standard`는 PowerShell `&&` 구문 오류로 실패했습니다.
- 재실행: `bash -lc 'git diff --name-status --; git ls-files --others --exclude-standard'` PASS.
- `git diff --stat --` PASS:
  - tracked modified 21 files
  - 736 insertions / 974 deletions
- 최신 재확인:
  - `git diff --name-status --` PASS, tracked modified 21 files.
  - `git ls-files --others --exclude-standard` PASS, untracked 19 files.
  - `git diff --numstat --` PASS.

## PR 소속 후보
- P0-02 user-facing legacy transaction follow-up:
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
  - 권장 검증: P0-02 targeted v3 route/helper tests, `corepack pnpm planning:v2:guard`, `corepack pnpm planning:user-scope:check`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build`
- Ops evidence / legacy inventory follow-up:
  - `docs/planning-v2-ops.md`
  - `scripts/planning_v2_ops_safety.mjs`
  - `tests/planning/ops-safety.test.ts`
  - 권장 검증: `node --check scripts/planning_v2_ops_safety.mjs`, `corepack pnpm test tests/planning/ops-safety.test.ts tests/planning-store.test.ts`, `corepack pnpm planning:v2:ops:safety -- --legacy-mode=check --legacy-limit=500 --legacy-fail-threshold=-1`, `corepack pnpm lint`, `corepack pnpm typecheck`
- P2-03 legacy planner deprecation guard follow-up:
  - `docs/planner-deprecated-cleanup.md`
  - `scripts/planner_deprecated_guard.mjs`
  - 권장 검증: `node --check scripts/planner_deprecated_guard.mjs`, `corepack pnpm planner:deprecated:guard`, `git diff --check`
- P2-04 workspace runtime hook split:
  - `src/components/planning/workspace/useWorkspaceRuntimeBundle.ts`
  - `src/components/planning/workspace/workspaceRuntimeHelpers.ts`
  - `src/components/planning/workspace/useWorkspaceRuntimeStateBundle.ts`
  - `src/components/planning/workspace/useWorkspaceFeedbackSubmitAction.ts`
  - `src/components/planning/workspace/useWorkspaceOptimizeAction.ts`
  - `src/components/planning/workspace/useWorkspaceProfileSyncAction.ts`
  - `src/components/planning/workspace/useWorkspaceRunExecutionActions.ts`
  - 권장 검증: workspace UI targeted tests, `corepack pnpm lint`, `corepack pnpm typecheck`
- P2-05 quality/release gate stabilization:
  - `tests/desktop-artifact-provenance.test.ts`
  - `tests/planning-v3-store-concurrency.test.ts`
  - `tests/planning/auth/postgresReadinessScript.test.ts`
  - 권장 검증: `corepack pnpm test tests/planning-v3-store-concurrency.test.ts tests/planning/auth/postgresReadinessScript.test.ts tests/desktop-artifact-provenance.test.ts`, `corepack pnpm release:verify`, `corepack pnpm lint`
- P2-06 v2/v3 boundary documentation:
  - `docs/planning-v3-boundary-adr.md`
  - `docs/README.md`
  - `src/lib/planning/v3/README.md`
  - 권장 검증: `git diff --check`, 관련 문서 링크 확인
- Final report / audit documentation:
  - `work/6/29/2026-06-29-0629-delivery-completion-audit.md`
  - `work/6/29/2026-06-29-0629-delivery-final-report-draft.md`
  - `work/6/29/2026-06-29-0629-delivery-revalidation.md`
  - `work/6/30/2026-06-30-github-unblock-playbook.md`
  - `work/6/30/2026-06-30-completion-blocker-audit.md`
  - `work/6/30/2026-06-30-goal-current-state-audit.md`
  - `work/6/30/2026-06-30-local-gate-refresh.md`
  - `work/6/30/2026-06-30-local-topology-env-inventory.md`
  - `work/6/30/2026-06-30-pr-reconstruction-readiness.md`
  - `work/6/30/2026-06-30-synthetic-ops-evidence.md`
  - `work/6/30/2026-06-30-dirty-worktree-pr-map.md`
  - 권장 검증: `git diff --check -- work/6/29 work/6/30`

## 재구성 주의사항
- 현재 aggregate 브랜치를 그대로 push하지 않습니다.
- P0-02 follow-up은 기존 P0-02/P1-03 transaction migration 커밋 위에 얹어야 충돌 가능성이 낮습니다.
- Ops evidence follow-up은 `scripts/planning_v2_ops_safety.mjs`가 P0-03에서도 변경된 파일이므로 P0-03과 P0-02 중 어느 PR에 넣을지 PR dependency를 먼저 정해야 합니다.
- P2-04 hook split은 파일 이동/분할 성격이 커서 P0/P1 기능 PR과 섞으면 review noise가 커집니다.
- `/work` 문서는 최종 보고용 보조 산출물이므로 기능 PR에 모두 포함할지, 별도 final-report PR에 모을지 먼저 정합니다.

## 남은 리스크
- [deferred GitHub publishing] 이 문서는 분류표입니다. 실제 branch 재구성, cherry-pick, stage, commit, push, PR은 현재 범위 밖입니다.
- [검증 필요] 실제 cherry-pick 시 충돌이 나면 이 분류표보다 현재 코드 dependency를 우선해 최소 변경 단위로 다시 쪼개야 합니다.
- [deferred external verification] 원격 CI와 운영 inventory는 현재 범위 밖입니다.
