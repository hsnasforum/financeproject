# 2026-05-26 리포트 대시보드 React Compiler lint 축소

## 변경 파일
- `src/app/planning/reports/page.tsx`
- `src/components/PlanningReportsDashboardBoundary.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `work/5/26/2026-05-26-report-flake-prod-e2e.md`
- `work/5/26/2026-05-26-report-dashboard-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: React hooks, App Router page, 보고서 선택/비교 사용자 흐름 변경에 맞춰 `pnpm lint`, targeted unit test, `pnpm build`, 보고서 e2e, diff/guard 검증을 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 잔여 React Compiler migration 리스크를 `/work` 표준 섹션으로 정리했습니다.

## 변경 이유
- 직전 라운드에서 `eslint-plugin-react-hooks` 최신 7.1.1 해석은 유지하되 `react-hooks/set-state-in-effect` 113건을 별도 migration batch로 남겼습니다.
- 이번 라운드는 그중 `PlanningReportsDashboardClient`의 동기 effect state sync 8건을 렌더 파생값, hydration snapshot, 초기 key remount 계약으로 줄여 React Compiler 호환성을 높였습니다.
- 보고서 run/baseRun 딥링크와 저장 리포트 selected query는 사용자 흐름에 직접 노출되므로 e2e로 회귀를 확인했습니다.

## 핵심 변경
- `PlanningReportsDashboardClient`의 선택 실행과 기준 실행을 effect 동기화 대신 `resolvedSelectedRunId`, `resolvedBaselineRunId` 파생값으로 계산했습니다.
- 저장 리포트 id는 `useSearchParams()`의 `selected` query를 직접 기준으로 삼고, 별도 sync state effect를 제거했습니다.
- hydration readiness는 기존 로컬 패턴인 `useSyncExternalStore`로 바꿔 mount 직후 `setState` effect를 없앴습니다.
- `PlanningReportsDashboardBoundary`에 `initialBaseRunId` 기반 key를 추가해 서버에서 계산한 초기 실행 범위가 바뀌면 client state가 안전하게 재초기화되도록 했습니다.
- 보고서 실행 option 날짜 표시는 `Intl.DateTimeFormat(..., hourCycle: "h23")`로 고정해 서버/브라우저 간 `24시`와 `0시` hydration 불일치를 피했습니다.
- 저장 리포트 검증은 취소 가능한 0ms timer 뒤에 시작하도록 바꿔 React StrictMode 첫 effect pass가 네트워크 요청을 먼저 소비하지 않도록 했습니다.
- 이전 `report-flake` `/work` 기록에 `다음 라운드` 섹션을 추가해 CI guard가 최신 mtime 노트를 집어도 통과하도록 보강했습니다.
- 전체 `react-hooks/set-state-in-effect` 잔여 수를 113건에서 105건으로 줄였습니다.

## 검증
- `corepack pnpm exec eslint src/components/PlanningReportsDashboardClient.tsx src/components/PlanningReportsDashboardBoundary.tsx src/app/planning/reports/page.tsx --rule 'react-hooks/set-state-in-effect:error' -f json > tmp/eslint-report-dashboard-set-state.json || true` PASS: 변경 파일 기준 `react-hooks/set-state-in-effect` 0건
- `corepack pnpm exec eslint src tests scripts planning middleware.ts next.config.ts playwright.config.ts postcss.config.mjs prisma.config.ts vitest.config.ts eslint.config.mjs --rule 'react-hooks/set-state-in-effect:error' -f json > tmp/eslint-react-hooks-set-state-report.json || true` INFO: JSON report 기준 전체 잔여 105건
- `corepack pnpm lint` PASS
- `corepack pnpm test tests/planning/reports/reportDashboardReadiness.test.ts` PASS: 1 file / 2 tests
- `corepack pnpm build` PASS
- `corepack pnpm e2e -- tests/e2e/flow-history-to-report.spec.ts --workers=1 --reporter=line` PASS: 10 tests
- `corepack pnpm release:verify` PASS: `deps:audit`, `planning:v2:complete`, fast e2e 6 tests, `multi-agent:guard`, `planning:v2:compat`, `planning:v2:regress`, full e2e, vitest 663 files / 2033 tests, `planning:ssot:check`
- `corepack pnpm e2e -- tests/e2e/flow-history-to-report.spec.ts --workers=1 --reporter=line` PASS: timer 보강 뒤 10 tests
- `corepack pnpm build` PASS: 날짜 format 보강 뒤 hydration 경고 없이 완료
- `corepack pnpm multi-agent:guard` PASS: `report-flake` 노트 `다음 라운드` 보강 뒤 통과
- `git diff --check` PASS

## 남은 리스크
- `react-hooks/set-state-in-effect`는 아직 105건 남아 있으며, 다음 배치에서는 `DartSearchClient` 7건 또는 `ProductListPage` 6건처럼 상위 군집부터 줄이는 편이 효율적입니다.
- 이번 변경은 `/planning/reports`의 search param 기반 상태 초기화에 초점을 맞췄고, prototype 리포트 화면은 별도 client를 사용하므로 직접 수정하지 않았습니다.
- 원격 `CI #176`과 `E2E Smoke #58` 실패는 이전 head `47e5fb02` 기준이며, 후속 커밋 push 뒤 새 SHA 기준으로 다시 확인해야 합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- `DartSearchClient`의 hydration/localStorage 복구 effect를 우선 정리해 `react-hooks/set-state-in-effect` 7건을 줄입니다.
- 그다음 `ProductListPage`의 URL query 초기화와 provider fallback 상태를 파생 또는 초기화 계약으로 분리합니다.
- 각 배치마다 변경 파일 기준 React Compiler lint 0건 여부와 관련 e2e 또는 targeted test를 같이 확인합니다.
