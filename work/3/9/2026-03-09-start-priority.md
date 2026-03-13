# 2026-03-09 Start Priority

### Project direction snapshot

- Product focus: personal finance planning for non-experts.
- Constraints:
  - Planning v2 is frozen for bugfix/stabilization only.
  - New functional expansion should prefer v3 scope or non-core report/UI layers.
  - Real public routes must follow `docs/current-screens.md`.

### Current repository signal

- The worktree already contains broad in-progress changes across planning reports, engine routes, ops routes, docs, and tests.
- Current alignment docs show the active stream is:
  - `P0-2 engine orchestration`
  - `P1-2 UI calculation removal`
- Recent planning report recommendation design also indicates report-side user value work is being prepared.

### Recommended priority order

1. Stabilize planning report canonical flow.
   - Reason: user-facing result consistency depends on `run -> resultDto -> report contract -> report VM`.
   - Risk if delayed: report/export/pdf may disagree on the same run.

2. Narrow engine orchestration spread without changing v2 contracts.
   - Reason: repeated route-level engine wiring is a maintenance and regression source.
   - Risk if delayed: more duplicate logic and fallback drift.

3. Remove residual UI-side policy calculations.
   - Reason: interpretation should render server-produced meaning, not recreate it in clients.
   - Risk if delayed: different screens explain the same run differently.

4. Connect recommendation/report recommendation signals carefully.
   - Reason: strong user value, but should only happen after canonical report path is stable.
   - Risk if rushed: recommendation reasons can conflict with planning stage/status.

### Functional gaps to keep in scope

- Legacy `/report` still exists and can confuse users versus official planning reports.
- Recommendation system is not fully aligned with planning engine outputs yet.
- Some routes and UI surfaces still rely on compatibility fallback behavior.
- The worktree has many active edits, so new work should avoid broad refactors across touched files unless necessary.

### First execution target

- Default starting point: planning report path stabilization.
- First concrete focus:
  - verify and tighten the current report recommendation/report VM path
  - keep changes compatible with existing report contract flow
  - avoid introducing new shared helpers unless reused in at least two function definitions

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
