# 2026-03-09 Current Screens V3 Legacy Alignment

### Scope

- Final route-SSOT cleanup slice for remaining unclassified page routes.
- Targeted:
  - legacy redirect pages
  - prototype/preview page
  - planning v3 pages
  - debug planning page

### Problem

- After public/support/ops route cleanup, remaining undocumented pages were:
  - `/planner`
  - `/planner/[...slug]`
  - `/planning/reports/prototype`
  - `/planning/v3/*`
  - `/debug/planning-v2`
- These are not simple public routes; they need explicit classification.

### Changes

- Updated `docs/current-screens.md` with separate sections:
  - `Legacy/Redirect 화면`
  - `Prototype/Preview 화면`
  - `Planning v3 화면 (experimental / in-progress)`
  - added `/debug/planning-v2` to Dev/Debug
- Refined the ops rule note so `/ops/*` is not parsed as a literal route item in future route diffs.
- Added regression test:
  - `tests/planning/catalog/currentScreens.experimentalRoutes.test.ts`

### Validation

- `pnpm test tests/planning/catalog/currentScreens.experimentalRoutes.test.ts tests/planning/catalog/currentScreens.supportRoutes.test.ts tests/planning/catalog/currentScreens.opsRoutes.test.ts tests/planning/catalog/currentScreens.reportRoutes.test.ts`
- route inventory diff check against `src/app/**/page.tsx`
  - result: `onlyInPages=[]`, `onlyInDocs=[]`

### Outcome

- `docs/current-screens.md` now fully matches the current `src/app/**/page.tsx` route set while preserving route class boundaries.

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
