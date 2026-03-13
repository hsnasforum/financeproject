# 2026-03-09 Current Screens Full Route Test

### Scope

- Converted the manual current-screens route audit into an automated regression test.

### Problem

- Previous slices aligned `docs/current-screens.md` with real routes, but the check was still manual/ad hoc.
- Future route additions could drift again unless the full route set is compared automatically.

### Changes

- Added `tests/planning/catalog/currentScreens.fullRouteSet.test.ts`
  - walks `src/app/**/page.tsx`
  - reads route bullets from `docs/current-screens.md`
  - compares the full page-route set against the documented route set
  - ignores API wildcard rule entries such as `/api/dev/*`

### Validation

- `pnpm test tests/planning/catalog/currentScreens.fullRouteSet.test.ts tests/planning/catalog/currentScreens.experimentalRoutes.test.ts tests/planning/catalog/currentScreens.supportRoutes.test.ts tests/planning/catalog/currentScreens.opsRoutes.test.ts tests/planning/catalog/currentScreens.reportRoutes.test.ts`

### Outcome

- `docs/current-screens.md` now has both:
  - current alignment with `src/app/**/page.tsx`
  - an automated guard preventing future route-set drift

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
