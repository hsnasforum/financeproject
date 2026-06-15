# 2026-05-25 report dashboard deeplink stage

## 변경 파일
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `src/app/planning/reports/_components/ReportRecommendationsSection.tsx`
- `src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx`
- `src/app/planning/reports/_components/reportDashboard/sections.tsx`
- `src/app/planning/reports/_components/reportDashboard/shared.ts`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/planning/reportDashboardReadiness.ts`
- `src/lib/planning/v2/report/pdfReport.ts`
- `tests/planning/reports/reportDashboardReadiness.test.ts`
- `tests/e2e/planning-v2-fast.spec.ts`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/5/25/2026-05-25-report-dashboard-deeplink-stage.md`

## 사용 skill
- `planning-gate-selector`: report page/component, PDF runtime import, deep link e2e 변경에 맞춰 lint, unit, route catalog, focused e2e, build 근거를 선택했습니다.
- `route-ssot-check`: `/planning/reports`, `/planning/reports/[id]`, `/recommend/history` deep link가 실제 page와 `docs/current-screens.md`에 이미 존재하는지 확인했습니다.
- `work-log-closeout`: 실제 변경 범위, 검증 결과, 남은 리스크와 다음 라운드를 기록했습니다.

## 변경 이유
- report dashboard 본문이 한 파일에 과도하게 집중되어 있었고, 핵심 지표 근거 패널과 섹션 렌더링을 분리해야 유지보수가 쉬워집니다.
- report 화면에서 HTML 저장 버튼이 사용자 흐름으로 검증되지 않아 export route 회귀를 e2e로 잡기 어려웠습니다.
- compare 기준 실행과 추천 비교 실행 참조가 query, 저장된 리포트, 상세 리포트 복귀 링크까지 유지되는지 고정할 필요가 있었습니다.
- PDF route의 Playwright 동적 import는 webpack 번들 해석을 피하도록 명시해야 runtime 로딩 실패 가능성을 줄일 수 있습니다.

## 핵심 변경
- `ReportDashboard.tsx`의 섹션 렌더링과 공통 포맷/링크 helper를 `reportDashboard/*` 파일로 분리했습니다.
- 핵심 지표 계산 근거 패널을 `CoreMetricEvidenceDock`으로 분리했습니다.
- report dashboard에 `HTML 저장` 버튼을 추가하고 `/api/planning/reports/[runId]/export.html` 다운로드 흐름을 e2e로 검증했습니다.
- advanced raw toggle 준비 조건을 `reportDashboardReadiness` helper로 분리하고 기본값이 닫힘인지 unit test로 고정했습니다.
- compare `baseRunId`, `recommendRunId`, 저장된 리포트 상세 복귀 링크 보존을 focused e2e로 검증했습니다.
- PDF report의 Playwright import를 `webpackIgnore` 동적 import로 바꿨습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/worktree_scope.mjs src/app/planning/reports/_components/ReportDashboard.tsx src/app/planning/reports/_components/ReportRecommendationsSection.tsx src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx src/app/planning/reports/_components/reportDashboard/sections.tsx src/app/planning/reports/_components/reportDashboard/shared.ts src/components/PlanningReportsDashboardClient.tsx src/components/planning/reportDashboardReadiness.ts src/lib/planning/v2/report/pdfReport.ts tests/planning/reports/reportDashboardReadiness.test.ts tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts` 통과: 전체 변경 207, 범위 내 11, 범위 밖 196
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- rg --files src/app -g 'page.tsx' | rg 'planning/reports|recommend/history'` 확인: `src/app/planning/reports/page.tsx`, `src/app/planning/reports/[id]/page.tsx`, `src/app/recommend/history/page.tsx` 존재
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- rg -n -e '/planning/reports' -e '/recommend/history' docs/current-screens.md` 확인: 세 경로가 문서화되어 있어 `docs/current-screens.md` 수정 불필요
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- src/app/planning/reports/_components/ReportDashboard.tsx src/app/planning/reports/_components/ReportRecommendationsSection.tsx src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx src/app/planning/reports/_components/reportDashboard/sections.tsx src/app/planning/reports/_components/reportDashboard/shared.ts src/components/PlanningReportsDashboardClient.tsx src/components/planning/reportDashboardReadiness.ts src/lib/planning/v2/report/pdfReport.ts tests/planning/reports/reportDashboardReadiness.test.ts tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint src/app/planning/reports/_components/ReportDashboard.tsx src/app/planning/reports/_components/ReportRecommendationsSection.tsx src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx src/app/planning/reports/_components/reportDashboard/sections.tsx src/app/planning/reports/_components/reportDashboard/shared.ts src/components/PlanningReportsDashboardClient.tsx src/components/planning/reportDashboardReadiness.ts src/lib/planning/v2/report/pdfReport.ts tests/planning/reports/reportDashboardReadiness.test.ts tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:current-screens:guard` 통과: 5 files, 9 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/planning/reports/reportDashboardReadiness.test.ts tests/planning-v2-api/runs-report-pdf-route.test.ts tests/planning-v2-api/reports-route.test.ts tests/planning-reports/storage.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning-v2/report/htmlReport.test.ts` 통과: 6 files, 14 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts --grep "(/planning/reports shows run-based dashboard|planning reports preserve compare and recommendation deep links)" --workers=1 --reporter=line` 통과: 2 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 현재 worktree 기준 재실행 통과: 254 pages 생성. 첫 시도는 tool timeout으로 결과를 받지 못했고, 두 번째 시도에서 통과했습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --cached --check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard` 통과: `latestWorkNote=work/5/25/2026-05-25-report-dashboard-deeplink-stage.md`

## 남은 리스크
- `CandidateComparisonSection`의 scroll lock 변경은 공통 modal scroll lock 후보와 연결되어 있어 이번 stage에서 제외했습니다.
- focused e2e는 report HTML 저장과 deep link 보존 경로만 확인했습니다. PR 최종 전에는 전체 `pnpm e2e:rc` 또는 release 검증과 함께 묶어야 합니다.
- 현재 worktree에는 범위 밖 변경 196개가 남아 있으므로 전체 stage는 계속 위험합니다.

## 다음 라운드
- 공통 `scrollLock` helper와 modal/후보 비교 섹션 변경을 별도 pathspec 묶음으로 검증합니다.
- 이후 dev-security runtime 또는 workspace refactor 후보 중 범위와 검증 근거가 가장 작은 묶음을 이어서 stage합니다.
