# 2026-06-30 GitHub unblock playbook

## 변경 파일
- `work/6/30/2026-06-30-github-unblock-playbook.md`

## 사용 skill
- `planning-gate-selector`: PR 단위별 최소 검증과 최종 통합 gate를 구분하기 위해 사용했습니다.
- `work-log-closeout`: GitHub 금지 상태에서 실행하지 않은 작업과 실제 확인한 로컬 상태를 분리해 기록하기 위해 사용했습니다.

## 변경 이유
- 사용자가 billing 문제 해결 전 commit/push/PR 금지를 지시했으므로, 현재 aggregate 브랜치를 원격에 올리지 않았습니다.
- 전달문은 P0-01, P0-02, P0-03을 각각 독립 PR 단위로 먼저 처리하라고 요구합니다.
- 현재 로컬 브랜치에는 기준 SHA 이후 구현 커밋과 uncommitted follow-up이 함께 있으므로, GitHub 작업이 허용되면 현재 브랜치를 그대로 push하지 말고 PR 단위 재구성부터 해야 합니다.

## 핵심 변경
- GitHub 작업 재개 전제와 금지 상태를 분리한 unblock 체크리스트를 추가했습니다.
- P0/P1/P2 제출 순서와 현재 로컬 커밋 매핑을 정리했습니다.
- PR별 커밋/파일/검증 매트릭스는 `work/6/30/2026-06-30-pr-commit-file-matrix.md`에 별도로 분리했습니다.
- 금지 해제 후 실행할 cherry-pick 중심 명령 순서는 `work/6/30/2026-06-30-pr-reconstruction-command-runbook.md`에 별도로 분리했습니다.
- 각 PR에서 다시 실행해야 할 targeted gate와 최종 통합 gate를 구분했습니다.
- 운영 inventory/topology/rollback 증거 수집 항목을 PR 전후로 분리했습니다.
- 이번 라운드에서는 branch 생성, staging, commit, push, PR 생성을 수행하지 않았습니다.

## 검증
- `git status --short --branch --untracked-files=normal` 확인:
  - 현재 브랜치 `codex/p2-05-quality-gates`
  - 로컬 수정/미추적 파일 존재
  - staged 파일 없음
- `git log --reverse --format='%h%x09%s' 5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5..HEAD` 확인:
  - 기준 이후 로컬 커밋 18개 확인.
- `git branch --show-current` 확인:
  - `codex/p2-05-quality-gates`

## GitHub 재개 전제
- billing 문제가 해결되어 사용자가 commit/push/PR 금지를 해제해야 합니다.
- 해제 전에는 아래 명령을 실행하지 않습니다.
- 해제 후에도 현재 aggregate 브랜치 `codex/p2-05-quality-gates`를 그대로 PR로 올리지 않습니다.
- 먼저 `git status --short --branch`로 dirty worktree를 확인하고, uncommitted follow-up을 어떤 PR에 넣을지 결정합니다.

## PR 재구성 순서
- P0-01 독립 PR:
  - 기준 커밋: `5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5`
  - 로컬 커밋: `aac556ab [planning] Enforce storage ownership mode`
  - 권장 브랜치: `codex/p0-01-storage-ownership`
  - 핵심 검증: `corepack pnpm test tests/planning/auth/currentUser.test.ts tests/planning/store/planningStoreNamespace.test.ts`, `corepack pnpm planning:auth:check`, `corepack pnpm planning:user-scope:check`, `corepack pnpm lint`, `corepack pnpm typecheck`
- P0-02 독립 PR:
  - 기준: P0-01 병합 후 main 또는 P0-01 위 stacked branch 중 하나로 선택하되 PR 설명에 dependency를 명시합니다.
  - 로컬 커밋 후보: `645bf614`, `6be7c0de`
  - uncommitted follow-up 후보: `src/lib/planning/v3/service/userFacingBatchReadPolicy.ts`, batch reader/helper tests, `src/app/api/planning/v3/draft/apply/route.ts`, `tests/planning-v2-static-guard.test.ts`, `scripts/planning_v2_static_guard.mjs`
  - 권장 브랜치: `codex/p0-02-legacy-transactions`
  - 핵심 검증: P0-02 targeted v3 batch/import/user-scope tests, `corepack pnpm planning:v2:guard`, `corepack pnpm planning:user-scope:check`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build`
- P0-03 독립 PR:
  - 기준: P0-01/P0-02 병합 후 main 또는 명시 stacked branch.
  - 로컬 커밋: `e266ddf9 [ops] Make replace restore atomic`
  - 권장 브랜치: `codex/p0-03-restore-atomicity`
  - 핵심 검증: `corepack pnpm test tests/planning/ops/backup-api.test.ts tests/planning/ops/ops-backup-restore-route-service-boundary.test.ts`, `corepack pnpm planning:v2:ops:safety`, `corepack pnpm lint`, `corepack pnpm typecheck`

## P1/P2 제출 매핑
- P1-01 storage error semantics: `d1860e73`
- P1-02 mutation serialization: `dccfc284`
- P1-03 Action Center SSOT: `2d47134f`
- P1-04 draft family boundary: `5b6564d9`
- P1-05 desktop artifact provenance: `d74f8038`
- P1-06 v3 source root: `856f1801`
- P1-07 run application service: `f1cfe174`
- P1-08 report SSOT: `92b4d559`
- P1-09 depositProtection contract: `64ade8f0`
- P1-10 public API provenance: `e90e51ff`
- P2/follow-up:
  - `08353c8a` runStore read purity
  - `078e5dd1` unified source loaders
  - `d9e853cd` quality gates
  - `baf6325e` rounding policy
  - uncommitted P2/source-doc/hook/guard/ops evidence follow-ups

## 최종 통합 전 gate
- 각 PR의 targeted tests와 lint/typecheck를 먼저 통과시킵니다.
- 통합 브랜치에서 아래를 다시 실행합니다.
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`
  - `corepack pnpm test`
  - `corepack pnpm planning:auth:check`
  - `corepack pnpm planning:user-scope:check`
  - `corepack pnpm release:verify`
  - `corepack pnpm build`
  - P0-02 포함 시 `corepack pnpm planning:v2:guard`
  - ops/inventory 포함 시 `corepack pnpm planning:v2:ops:safety -- --legacy-mode=check --legacy-limit=500 --legacy-fail-threshold=0`

## 운영 증거 수집
- production 또는 staging 운영 환경에서 `planning:v2:ops:safety`를 실행하고 리포트의 아래 값을 최종 보고서에 붙입니다.
  - `operatingEnvironment.storageMode`
  - `operatingEnvironment.dataDir`
  - `topology.writeSerializationScope`
  - `topology.sharedFileStoreCompletion`
  - `legacyBackfill.candidateCount`
- 실제 legacy migration 대상, conflict, quarantine 수는 운영 데이터 dry-run 리포트로만 확정합니다.
- owner 불명 legacy 데이터는 자동 배정하지 않고 quarantine으로 남깁니다.
- 다중 프로세스/다중 인스턴스 공유 파일 저장소라면 process-local mutex로 완료 주장하지 않고 후속 file lock/CAS/DB transaction 이슈를 생성합니다.

## 남은 리스크
- [deferred external verification] 이 문서는 실행 계획입니다. commit, push, PR, 원격 CI는 현재 범위 밖입니다.
- [deferred external verification] 운영 데이터와 production topology 검증은 현재 범위 밖입니다.
- [검증 필요] 실제 PR 분리 시 cherry-pick 충돌이나 hidden dependency가 드러날 수 있습니다. 충돌이 있으면 aggregate 브랜치를 그대로 push하지 말고 해당 PR 범위의 최소 변경으로 재구성해야 합니다.
