# 2026-03-09 Report VM Safe Build

### Scope

- Returned from route/document cleanup to planning report functional stabilization.
- Targeted issue: report UI consumers could throw when `buildReportVMFromRun()` hit an incomplete or non-canonical run.

### Problem

- `buildReportVMFromRun()` is strict by design and can throw when canonical report contract inputs are missing.
- Several UI consumers called it directly:
  - `PlanningReportsDashboardClient`
  - `PlanningReportDetailClient`
  - `PlanningReportsClient`
  - `PlanningReportsPrototypeClient`
  - home page featured report slide generation
- That meant a single incomplete/legacy run could crash the whole screen instead of showing a bounded error.

### Changes

- Added safe shared helper in `src/app/planning/reports/_lib/reportViewModel.ts`
  - `safeBuildReportVMFromRun()`
  - returns `{ vm, error }` instead of throwing
- Updated report UI consumers to use safe build:
  - dashboard client
  - detail client
  - reports client
  - prototype client
  - home page featured run logic
- Detail/prototype/reports surfaces now show an error message instead of crashing when the selected run cannot build a canonical report VM.
- Detail page uses an empty VM fallback for layout continuity while still surfacing the build error.

### Validation

- `pnpm exec eslint src/app/planning/reports/_lib/reportViewModel.ts src/components/PlanningReportsDashboardClient.tsx src/components/PlanningReportDetailClient.tsx src/components/PlanningReportsClient.tsx src/components/PlanningReportsPrototypeClient.tsx src/app/page.tsx tests/planning-v2/reportViewModel.safeBuild.test.ts`
- `pnpm test tests/planning-v2/reportViewModel.safeBuild.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning-v2-api/runs-report-route.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/report-page-redirect.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning/reports/recommendationSignals.test.ts`

### Added test

- `tests/planning-v2/reportViewModel.safeBuild.test.ts`
  - canonical run -> VM built successfully
  - incomplete run -> error captured without throw

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
