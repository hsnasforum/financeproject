# 2026-05-25 report export/deep link focused gates

## 변경 파일
- `work/5/25/2026-05-25-report-export-deeplink-focused-gates.md`

## 사용 skill
- `planning-gate-selector`: report route/component/lib, HTML export, planning report e2e 변경에 맞는 focused unit/e2e 검증을 고르는 데 사용했습니다.
- `route-ssot-check`: report deep link가 기존 `/planning/reports`, `/planning/reports/[id]`, `/recommend/history?open=...` 경로 안에서 동작하는지 확인하는 기준으로 사용했습니다.
- `work-log-closeout`: 실제 실행한 report 후보 검증과 남은 stage 리스크를 `/work`에 기록했습니다.

## 변경 이유
- `report-export-deeplink` 후보 16개를 별도 stage 후보로 볼 수 있는지 최신 상태에서 확인해야 했습니다.
- 추적 diff뿐 아니라 비추적 report dashboard 분리 파일과 `public/planning-report-print.js`도 포함되므로, untracked 파일의 whitespace/문법까지 별도로 확인했습니다.

## 핵심 변경
- 코드 파일은 수정하지 않고 report 후보 검증만 수행했습니다.
- report 후보의 추적 diff whitespace, 비추적 파일 trailing whitespace, print JS 문법, ESLint를 확인했습니다.
- report export route, PDF route, report storage, recommendRunId 저장, dashboard split 관련 unit 17개 테스트가 통과했습니다.
- HTML export 버튼과 compare/recommend deep link focused e2e 2개가 통과했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git status --short --untracked-files=all -- public/planning-report-print.js src/app/api/planning/reports src/app/planning/reports src/components/PlanningReportsDashboardClient.tsx src/lib/planning/reports src/lib/planning/v2/report tests/planning-v2-api/reports-export-html-route.test.ts tests/planning/reports tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts` 실행: report 후보 16개 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- src/app/api/planning/reports src/app/planning/reports src/components/PlanningReportsDashboardClient.tsx src/lib/planning/reports src/lib/planning/v2/report tests/planning-v2-api/reports-export-html-route.test.ts tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts` 통과
- PowerShell trailing whitespace check 실행: `public/planning-report-print.js`, `CoreMetricEvidenceDock.tsx`, `sections.tsx`, `shared.ts`, `reportDashboardReadiness.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node --check public/planning-report-print.js` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint src/app/api/planning/reports/[runId]/export.html/route.ts src/app/planning/reports/_components/CandidateComparisonSection.tsx src/app/planning/reports/_components/ReportDashboard.tsx src/app/planning/reports/_components/ReportRecommendationsSection.tsx src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx src/app/planning/reports/_components/reportDashboard/sections.tsx src/app/planning/reports/_components/reportDashboard/shared.ts src/app/planning/reports/_lib/standaloneReportArtifacts.ts src/components/PlanningReportsDashboardClient.tsx src/lib/planning/reports/standaloneHtmlReport.ts src/lib/planning/v2/report/pdfReport.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/planning/reports/reportDashboardReadiness.test.ts tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/planning-v2-api/reports-export-html-route.test.ts tests/planning-v2-api/runs-report-pdf-route.test.ts tests/planning-v2-api/reports-route.test.ts tests/planning-reports/storage.test.ts tests/planning/reports/reportDashboardReadiness.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning-v2/report/htmlReport.test.ts` 통과: 7 files / 17 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts --grep "(/planning/reports shows run-based dashboard|planning reports preserve compare and recommendation deep links)" --workers=1 --reporter=line` 통과: 2 passed

## 남은 리스크
- report 후보 16개는 별도 stage 후보로 볼 수 있지만, 전체 worktree에는 여전히 많은 범위 밖 변경이 남아 있어 전체 stage는 위험합니다.
- `/recommend/history?open=...` 대상 화면 자체의 상세 동작은 이번 focused e2e 범위가 아니라 href/복귀 링크 중심으로 검증했습니다.
- PR 전 최종 묶음에는 직전 `pnpm e2e:rc`, `pnpm release:verify` 통과 기록도 함께 근거로 유지해야 합니다.

## 다음 라운드
- `workspace-refactor` 후보 25개도 같은 방식으로 `git diff --check`, focused unit, hydration focused e2e 근거를 최신화합니다.
- 이후 `report-export-deeplink`와 `workspace-refactor`를 각각 별도 stage할지, planning 사용자 흐름 묶음으로 함께 stage할지 결정합니다.
