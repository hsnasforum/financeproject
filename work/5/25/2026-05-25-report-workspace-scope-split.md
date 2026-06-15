# 2026-05-25 report/workspace 후보 범위 분리

## 변경 파일
- `work/5/25/2026-05-25-report-workspace-scope-split.md`

## 사용 skill
- `planning-gate-selector`: report deep link/export와 workspace refactor의 검증 단위를 분리하는 기준으로 사용했습니다.
- `route-ssot-check`: report deep link 변경이 실제 `/planning/reports`, `/planning/reports/[id]`, `/recommend/history` 사용자 경로에 머무는지 확인하는 기준으로 사용했습니다.
- `work-log-closeout`: 실제 확인한 scope, import 검색, 남은 stage 리스크를 `/work`에 기록했습니다.

## 변경 이유
- 직전 후보 분류에서는 `tests/e2e/planning-v2-fast.spec.ts`와 `tests/e2e/flow-history-to-report.spec.ts`가 `workspace-refactor`와 `report-export-deeplink`에 함께 걸렸습니다.
- 실제 diff 기준으로 두 e2e 파일의 변경은 HTML export 버튼과 compare/recommend deep link 검증이므로 report 후보에만 넣는 것이 더 정확합니다.

## 핵심 변경
- 코드 파일은 수정하지 않고 후보 범위를 정정했습니다.
- `workspace-refactor` 후보는 25개로 정리했습니다. `PlanningWorkspaceClient.tsx`, `src/components/planning/workspace/*`, 관련 `tests/planning/ui/workspace*.test.*`만 포함합니다.
- `report-export-deeplink` 후보는 16개로 정리했습니다. report route/component/lib, HTML print asset, report unit/e2e를 포함합니다.
- `ReportDashboard.tsx`가 `reportDashboard/sections`를 import하고, `sections.tsx`가 `CoreMetricEvidenceDock`를 import하므로 report dashboard 분리 파일은 실제 사용 중입니다.
- report deep link는 기존 사용자 경로인 `/planning/reports`, `/planning/reports/[id]`, `/recommend/history?open=...` 안에서 동작하며 새 public route를 추가하지 않습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff -- tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts src/components/PlanningWorkspaceClient.tsx` 실행: e2e 변경이 report export/deep link 전용임을 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node scripts/worktree_scope.mjs src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts` 실행: 전체 197 / workspace 후보 25 / 범위 밖 172
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node scripts/worktree_scope.mjs public/planning-report-print.js src/app/api/planning/reports src/app/planning/reports src/components/PlanningReportsDashboardClient.tsx src/lib/planning/reports src/lib/planning/v2/report tests/planning-v2-api/reports-export-html-route.test.ts tests/planning/reports tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts` 실행: 전체 197 / report 후보 16 / 범위 밖 181
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- rg -n -e ReportDashboard -e CandidateComparisonSection -e ReportRecommendationsSection -e CoreMetricEvidenceDock -e 'reportDashboard/sections' -e standaloneReportArtifacts -e 'planning-report-print' -e 'report-export-html-button' -e PlanningReportsDashboardClient src/app src/components src/lib tests public` 실행: report dashboard 분리 파일과 print asset 참조 확인

## 남은 리스크
- workspace 후보와 report 후보는 별도 stage가 가능하지만, 둘 다 planning 사용자 흐름을 건드리므로 최종 PR 전에는 `pnpm e2e:rc`나 `pnpm release:verify` 근거를 함께 유지해야 합니다.
- `report-export-deeplink`에는 `/recommend/history?open=...` deep link가 포함됩니다. 현재 e2e는 href와 상세 화면 복귀 링크를 확인하지만, recommend history 실제 대상 화면의 상세 동작은 별도 후보에서 다룰 수 있습니다.
- `workspace-refactor`는 e2e diff를 직접 포함하지 않지만, hydration race 수정은 workspace 코드와 기존 e2e 시나리오로 검증됐습니다.

## 다음 라운드
- `report-export-deeplink` 후보 16개에 대해 `git diff --check`와 report focused unit/e2e 명령을 최신 상태로 다시 확인합니다.
- `workspace-refactor` 후보 25개는 unit test와 hydration focused e2e 근거를 묶어 stage 후보로 확정합니다.
