# 2026-04-13 planning v2 readiness 안정화

## 변경 파일
- `src/app/planning/page.tsx`
- `src/components/PlanningWorkspaceClient.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/planning/reportDashboardReadiness.ts`
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
- `src/components/planning/workspace/panels/profilePanel.tsx`
- `tests/e2e/helpers/e2eTest.ts`
- `tests/planning/reports/reportDashboardReadiness.test.ts`
- `tests/planning/ui/workspaceProfileBundle.test.ts`

## 사용 skill
- `work-log-closeout`: `/work/4/13/` readiness 안정화 결과를 저장소 규칙 형식으로 남기기 위해 사용

## 변경 이유
- 보안 배치 이후 `/planning` 초기 프로필 선택/하이드레이션과 `/planning/reports` advanced toggle readiness에서 e2e 회귀 2건이 남아 있었습니다.
- `?profileId=` 우선순위와 `planning:v2:selectedProfileId` storage 복원이 초기 로딩 중 흔들리면서 unsaved draft가 덮이는 문제가 있었습니다.
- seeded run으로 진입한 `/planning/reports`에서 `report-advanced-toggle`의 `data-ready` 전환이 mount timing에 흔들리지 않도록 고정할 필요가 있었습니다.

## 핵심 변경
- `PlanningReportsDashboardClient`에 report readiness helper를 분리하고, `report-advanced-toggle`은 `clientReady + selected run usable` 조건이 갖춰졌을 때만 `data-ready="true"`가 되도록 고정했습니다.
- `/planning` page는 query profile이 없거나 아직 client list가 오기 전에도 사용할 수 있도록 초기 프로필을 서버에서 warmup해서 workspace에 전달하도록 정리했습니다.
- `useWorkspaceProfileBundle`은 초기 선택 우선순위를 `query -> localStorage -> loaded profile`로 다시 고정하고, 최초 load settle 전에는 storage sync가 editor state를 덮지 않도록 막았습니다.
- 동일 프로필의 단순 목록 재로딩이나 storage sync로는 hydrate가 다시 일어나지 않도록 hydration stamp/cache guard를 추가했습니다.
- profile select가 목록 fetch 전에도 빈 문자열로 흔들리지 않도록 workspace header/profile panel select에 hidden pending option을 넣었습니다.
- Playwright dev HMR guard는 `/planning`, `/planning/reports`에서만 예외 처리해 readiness 검증 중 hydration이 끊기지 않도록 조정했습니다.

## 검증
- `pnpm exec eslint src/app/planning/page.tsx src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/usePlanningWorkspaceController.tsx src/components/planning/workspace/useWorkspaceProfileBundle.ts src/components/PlanningReportsDashboardClient.tsx src/components/planning/reportDashboardReadiness.ts src/components/planning/workspace/panels/profilePanel.tsx tests/planning/reports/reportDashboardReadiness.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/e2e/helpers/e2eTest.ts` → 통과
- `pnpm exec vitest run tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/reports/reportDashboardReadiness.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning-reports-page-fallback.test.tsx` → 4 files / 13 tests 통과
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=0 node scripts/playwright_with_webserver_debug.mjs --port 3143 test tests/e2e/planning-v2-fast.spec.ts --grep "/planning/reports shows run-based dashboard by default and keeps embedded markdown manager hidden|/planning keeps unsaved profile edits while preparing a new profile"` → 2 tests 통과
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=0 node scripts/playwright_with_webserver_debug.mjs --port 3141 test tests/e2e/planning-v2-full.spec.ts --grep "run pipeline shows stage timeline and reports dashboard contracts"` → 1 test 통과
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=0 node scripts/playwright_with_webserver_debug.mjs --port 3142 test tests/e2e/flow-planner-to-history.spec.ts` → 1 test 통과
- `pnpm build` → 통과
- `git diff --check -- src/app/planning/page.tsx src/components/PlanningWorkspaceClient.tsx src/components/PlanningReportsDashboardClient.tsx src/components/planning/reportDashboardReadiness.ts src/components/planning/workspace/usePlanningWorkspaceController.tsx src/components/planning/workspace/useWorkspaceProfileBundle.ts src/components/planning/workspace/panels/profilePanel.tsx tests/e2e/helpers/e2eTest.ts tests/planning/reports/reportDashboardReadiness.test.ts tests/planning/ui/workspaceProfileBundle.test.ts` → 통과

## 남은 리스크
- 이번 배치 범위 밖의 unrelated worktree 변경이 계속 많이 남아 있으므로, 후속 라운드에서 정리 배치 없이 넓은 git 조작을 하면 충돌 위험이 있습니다.
- `tests/e2e/helpers/e2eTest.ts`의 `/planning`, `/planning/reports` HMR 예외는 dev test harness 한정 조정입니다. 다른 route에서 같은 hydration 지연이 보이면 route별 원인 확인 후 예외 범위를 다시 검토해야 합니다.
- public route/query/storage/data-testid 계약은 유지했고, `docs/current-screens.md`나 보안 문서는 이번 readiness 복구 범위에서 변경하지 않았습니다.
