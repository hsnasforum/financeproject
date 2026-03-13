# 2026-03-09 Current Screens Ops Alignment

### Scope

- Continued autonomous route SSOT cleanup after the report-route slice.
- Chosen target: local-only ops/admin routes used by actual navigation and docs.

### Problem

- `docs/current-screens.md` had no ops/admin section.
- But `/ops` and several `/ops/*` pages are real routes and are linked from header/planning/ops docs.
- Runtime policy is different from public routes:
  - middleware treats `/ops` and `/api/ops/*` as local-only
  - `shouldBlockOpsPageInCurrentRuntime()` blocks ops pages in production unless packaged runtime is enabled

### Changes

- Updated `docs/current-screens.md`:
  - added `Ops/Admin 화면 (local-only 또는 packaged runtime)` section
  - listed current `/ops` pages
  - added a rule note that `/ops/*` is not public feature navigation
- Added regression test:
  - `tests/planning/catalog/currentScreens.opsRoutes.test.ts`

### Validation

- `pnpm test tests/planning/catalog/currentScreens.opsRoutes.test.ts tests/planning/catalog/currentScreens.reportRoutes.test.ts`

### Notes

- There are still more real routes not yet reflected in `current-screens` (`feedback`, some `settings`, `planning/v3`, legacy planner routes).
- I left those out in this slice to avoid broad route-policy changes without first separating public/local/legacy/v3 semantics.

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
