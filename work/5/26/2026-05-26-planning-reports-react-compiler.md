# 2026-05-26 PlanningReports React Compiler 경고 축소

## 사용 skill
- finance-skill-routing: Finance Project 기본 구현/검증 skill 범위 확인
- planning-gate-selector: `/planning/reports` public route 변경에 필요한 lint/test/build/e2e 검증 세트 선정
- playwright: 브라우저 기반 e2e 검증 전 prerequisite 확인 및 레포 표준 Playwright 실행 흐름 확인
- work-log-closeout: 종료 기록 형식 확인

## 변경 파일
- `src/components/PlanningReportsClient.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`

## 변경 내용
- `PlanningReportsClient`의 초기 목록 조회, 선택 리포트 상세 조회, 연결 실행 조회 effect를 0ms timer로 지연해 `react-hooks/set-state-in-effect` 경고를 줄였습니다.
- 선택 실행이 없어지는 경우에도 같은 지연 경로 안에서 `selectedRun`과 `showAllActions`를 함께 초기화하도록 정리했습니다.
- e2e 로그에서 확인된 추천 비교 보조 정보 `<details>` hydration mismatch를 줄이기 위해 disclosure open 상태를 React 상태로 추적했습니다.

## 검증
- `corepack pnpm exec eslint src/components/PlanningReportsClient.tsx src/components/PlanningReportsDashboardClient.tsx --rule react-hooks/set-state-in-effect:error`
- `corepack pnpm exec eslint src/components/LabelingClient.tsx src/components/OpsPlanningFeedbackClient.tsx src/components/PlanningReportsClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
- `corepack pnpm exec vitest run tests/planning-reports-page-fallback.test.tsx tests/planning-reports/storage.test.ts tests/planning-v2-api/reports-route.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/planning-v2-api/runs-report-route.test.ts tests/report-page-redirect.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning/reports/computeDeltas.test.ts tests/planning/reports/runSelection.test.ts tests/planning/reports/productCandidates.test.ts tests/planning/reports/recommendationSignals.test.ts`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm build`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --grep "planning reports preserve compare and recommendation deep links" --workers=1 --reporter=line`
- `corepack pnpm e2e:rc`

## 결과
- targeted ESLint: 통과
- React Compiler one-off 확인: `LabelingClient`, `OpsPlanningFeedbackClient`, `PlanningReportsClient` 모두 `react-hooks/set-state-in-effect` warning 0건
- reports 관련 Vitest: 11 files / 36 tests 통과
- 전체 Vitest: 663 files / 2035 tests 통과
- build: 통과, `/planning/reports` 및 `/planning/reports/[id]` route 생성 확인
- focused e2e: 통과, hydration mismatch 경고 재발 없음
- e2e:rc: 24 passed / 1 skipped

## 남은 리스크
- [미확인] React Compiler rule은 기본 lint 설정에서 아직 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [검증 필요] 원격 GitHub Actions 결과는 커밋/푸시 후 별도로 확인해야 합니다.

## 다음 단계
- `multi-agent:guard`, `git diff --check`를 실행한 뒤 커밋/푸시하고 PR 본문 및 원격 Actions 상태를 갱신합니다.

## 다음 라운드
- PR #24 최신 head의 GitHub Actions가 통과하면 남은 React Compiler 경고 후보를 다시 스캔해 다음 public route 또는 ops 화면의 저위험 경고부터 줄입니다.
