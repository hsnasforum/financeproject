# 2026-03-09 Report Route SSOT

### Scope

- Started autonomous work from the planning report stabilization track.
- Chosen slice: fix SSOT drift between actual official planning report routes and `docs/current-screens.md`.

### Problem

- Official report/run routes were already implemented and referenced in UI/docs:
  - `/planning/runs`
  - `/planning/reports`
  - `/planning/reports/[id]`
- But `docs/current-screens.md` did not list them.
- This creates drift against the project rule that internal links and docs must follow `current-screens.md`.

### Changes

- Updated `docs/current-screens.md`:
  - added `/planning/runs`
  - added `/planning/reports`
  - added `/planning/reports/[id]`
  - added a boundary note separating official planning report routes from legacy `/report`
  - refreshed the reference date to `2026-03-09`
- Added regression test:
  - `tests/planning/catalog/currentScreens.reportRoutes.test.ts`

### Validation

- `pnpm test tests/planning/catalog/currentScreens.reportRoutes.test.ts`
- `pnpm test tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning/reports/recommendationSignals.test.ts`

### Next likely slice

- Continue report-path stabilization around canonical report VM / report contract flow.
- Keep avoiding broad refactors because the worktree already contains many active user changes.

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
