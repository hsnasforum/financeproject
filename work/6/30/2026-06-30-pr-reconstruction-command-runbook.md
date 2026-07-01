# 2026-06-30 PR 재구성 명령 runbook

## 변경 파일
- `work/6/30/2026-06-30-pr-reconstruction-command-runbook.md`
- `work/6/30/2026-06-30-github-unblock-playbook.md`

## 사용 skill
- `planning-gate-selector`: PR 단위별 검증 범위를 코드 변경 없이 문서화하기 위해 사용했습니다.
- `work-log-closeout`: 실제 실행한 명령과 미실행 GitHub 작업을 분리해 `/work` 표준 형식으로 기록하기 위해 사용했습니다.

## 변경 이유
- 사용자가 billing 문제 해결 전 commit, push, PR, 원격 CI를 금지했으므로 지금은 아래 명령을 실행하지 않습니다.
- 전달문은 P0-01, P0-02, P0-03을 각각 독립 PR 단위로 먼저 처리하라고 요구합니다.
- 현재 aggregate 브랜치 `codex/p2-05-quality-gates`에는 기준 SHA 이후 로컬 커밋 18개와 dirty follow-up 파일이 함께 있으므로, GitHub 재개 시 그대로 push하면 PR 단위 책임이 깨질 수 있습니다.

## 핵심 변경
- GitHub 금지 해제 후에만 실행할 독립 PR 재구성 명령 순서를 별도 runbook으로 분리했습니다.
- 현재 aggregate 브랜치는 보존용 작업 브랜치로만 취급하고, PR용 브랜치는 최신 main 또는 명시 stacked base에서 새로 만들도록 정리했습니다.
- dirty follow-up 파일은 blindly restore하지 않고 `git diff`로 확인한 뒤 PR 범위별로 옮기도록 제한했습니다.
- 이번 라운드에서도 stage, commit, branch 생성, push, PR, 원격 CI는 수행하지 않았습니다.

## GitHub 해제 후 preflight
아래 명령은 사용자가 commit/push/PR 금지를 명시적으로 해제한 뒤에만 실행합니다.

```bash
git status --short --branch --untracked-files=normal
git rev-parse HEAD main origin/main
git log --reverse --format='%h%x09%s' 5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5..HEAD
git diff --name-status
git ls-files --others --exclude-standard
```

확인 기준:
- staged 파일이 있으면 먼저 어떤 라운드에서 생겼는지 확인합니다.
- 현재 aggregate 브랜치 `codex/p2-05-quality-gates`는 그대로 push하지 않습니다.
- `origin/main`이 문서 기준 SHA `5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5`와 달라졌으면 각 이슈를 현재 코드 기준으로 재검증한 뒤 cherry-pick 충돌과 우선순위를 다시 판단합니다.

## Dirty follow-up 보존
브랜치 전환 전, 현재 aggregate 작업트리의 uncommitted 변경을 먼저 패치와 목록으로 보존합니다. 아래 명령도 금지 해제 후에만 실행합니다.

```bash
mkdir -p tmp/pr-reconstruction
git diff --binary > tmp/pr-reconstruction/aggregate-tracked-followups.patch
git ls-files --others --exclude-standard > tmp/pr-reconstruction/aggregate-untracked-files.txt
```

보존 후 확인:
- `tmp/pr-reconstruction/aggregate-tracked-followups.patch`는 tracked dirty 변경만 담습니다.
- `aggregate-untracked-files.txt`의 파일은 내용이 패치에 없으므로 PR 범위별로 직접 읽고 필요한 파일만 추가합니다.
- `git switch`가 dirty worktree 때문에 중단되면 강제 전환하지 말고, 충돌 파일을 PR 범위별로 먼저 분리합니다.

## P0-01 재구성
권장 기준: 최신 `main`.

```bash
git switch main
git pull --ff-only
git switch -c codex/p0-01-storage-ownership
git cherry-pick aac556ab
corepack pnpm test tests/planning/auth/currentUser.test.ts tests/planning/auth/routeAuth.test.ts tests/planning/store/planningStoreNamespace.test.ts
corepack pnpm planning:auth:check
corepack pnpm planning:user-scope:check
corepack pnpm lint
corepack pnpm typecheck
```

검증 후에만:

```bash
git status --short
git push -u origin codex/p0-01-storage-ownership
```

PR 본문에는 production/auth required에서 namespace 또는 명시적 single-user mode가 필요한 책임 변화를 적습니다.

## P0-02 재구성
권장 기준: P0-01 병합 후 최신 `main`. 병합 전 진행이 필요하면 P0-01 위 stacked branch로 만들고 PR dependency를 명시합니다.

```bash
git switch main
git pull --ff-only
git switch -c codex/p0-02-legacy-transactions
git cherry-pick 645bf614
git cherry-pick 6be7c0de
```

dirty follow-up 후보는 aggregate 브랜치에서 diff를 먼저 읽고 필요한 파일만 옮깁니다.

```bash
git diff codex/p2-05-quality-gates -- scripts/planning_v2_static_guard.mjs
git diff codex/p2-05-quality-gates -- src/app/api/planning/v3/draft/apply/route.ts
git diff codex/p2-05-quality-gates -- src/lib/planning/v3/service/batchReadRepository.ts
git diff codex/p2-05-quality-gates -- src/lib/planning/v3/service/generateDraftPatchFromBatch.ts
git diff codex/p2-05-quality-gates -- src/lib/planning/v3/service/getBatchSummary.ts
git diff codex/p2-05-quality-gates -- src/lib/planning/v3/service/loadBatchVisiblePipeline.ts
```

untracked follow-up는 현재 aggregate 작업트리에서 내용을 확인한 뒤 PR 범위에 맞을 때만 추가합니다.

```bash
git diff --no-index /dev/null src/lib/planning/v3/service/userFacingBatchReadPolicy.ts
git diff --no-index /dev/null tests/planning-v2-static-guard.test.ts
```

권장 검증:

```bash
corepack pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v2-static-guard.test.ts
corepack pnpm planning:user-scope:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

PR 본문에는 legacy 전역 거래 저장소 제거, migration/quarantine 정책, owner 불명 데이터 자동 배정 금지를 적습니다.

## P0-03 재구성
권장 기준: P0-01/P0-02 병합 후 최신 `main`. ops script 충돌 가능성이 있으므로 `scripts/planning_v2_ops_safety.mjs`는 cherry-pick 뒤 현재 aggregate dirty diff를 따로 비교합니다.

```bash
git switch main
git pull --ff-only
git switch -c codex/p0-03-restore-atomicity
git cherry-pick e266ddf9
git diff codex/p2-05-quality-gates -- scripts/planning_v2_ops_safety.mjs
```

권장 검증:

```bash
corepack pnpm test tests/planning/ops/backup-api.test.ts tests/planning/ops/ops-backup-restore-route-service-boundary.test.ts
corepack pnpm planning:v2:ops:safety -- --legacy-mode=check --legacy-limit=500 --legacy-fail-threshold=0
corepack pnpm lint
corepack pnpm typecheck
```

PR 본문에는 staging/commit restore atomicity와 rollback 검증 경계를 적습니다.

## P1/P2 재구성 기준
- P1은 `work/6/30/2026-06-30-pr-commit-file-matrix.md`의 커밋 매핑 순서대로 재구성합니다.
- P2와 hook split, boundary ADR, final report 문서는 P0/P1 targeted gate와 최종 gate가 통과한 뒤 별도 follow-up으로 분리합니다.
- `/work` 문서는 기능 PR의 검증 증거로 참조하되, 기능 변경 커밋과 같은 PR에 넣을지는 PR 본문 책임에 맞춰 결정합니다.

## 최종 통합 gate
모든 PR 재구성과 병합 후보 정리가 끝난 뒤에만 아래 gate를 통합 브랜치에서 다시 실행합니다.

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm planning:auth:check
corepack pnpm planning:user-scope:check
corepack pnpm release:verify
corepack pnpm build
```

## 검증
- `git rev-parse HEAD` PASS:
  - `baf6325ecdadb3a2b249c0946490ec48887430ab`
- `git log --reverse --format=%h%x09%s 5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5..HEAD` PASS:
  - 기준 SHA 이후 로컬 커밋 18개 확인.
- `node -e`로 관련 `package.json` scripts 확인 PASS:
  - `lint`, `typecheck`, `test`, `build`, `planning:auth:check`, `planning:user-scope:check`, `release:verify`, `planning:ssot:check`, `planning:v2:ops:safety`.
- `git diff --check -- work/6/30/2026-06-30-pr-reconstruction-command-runbook.md work/6/30/2026-06-30-github-unblock-playbook.md` PASS.
- `grep -n '[[:blank:]]$' work/6/30/2026-06-30-pr-reconstruction-command-runbook.md work/6/30/2026-06-30-github-unblock-playbook.md` PASS:
  - 출력 없음. exit code 1은 grep match 없음으로 확인했습니다.
- `git diff --check` PASS.
- `git status --short --branch --untracked-files=normal` PASS:
  - staged 파일 없음.
  - 기존 modified/untracked 파일과 이번 `/work` 문서 변경 존재.
- PowerShell에서 `git diff ... | sed` 형태로 실행한 diff 미리보기 1회는 `sed`를 PowerShell이 해석해 실패했으므로 증거에서 제외했고, WSL `bash -lc` 형태로 재실행했습니다.
- 이 문서의 PR 재구성 명령은 미실행입니다.

## 남은 리스크
- [deferred GitHub publishing] commit, push, PR은 현재 범위 밖입니다.
- [deferred external verification] 원격 CI는 현재 범위 밖입니다.
- [deferred external verification] 실제 production topology, env, legacy inventory, conflict 수, quarantine 수는 현재 범위 밖입니다.
- [검증 필요] 실제 cherry-pick 시 충돌이 나면 이 runbook보다 현재 코드 dependency와 최소 변경 원칙을 우선합니다.
- [검증 필요] P0-02 untracked follow-up는 커밋 SHA에 포함되지 않았으므로 PR 재구성 시 파일별 diff를 다시 읽어야 합니다.
