# 2026-04-11 Planning Workspace runtime contract narrowing 마감

## 변경 파일
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/planning/workspace/useWorkspaceRuntimeBundle.ts`
- `src/components/planning/workspace/useWorkspaceQuickStartHandoff.ts`
- `src/app/planning/reports/_components/ReportRecommendationsSection.tsx`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- `src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `src/app/planning/v3/news/_components/NewsTodayClient.tsx`
- `src/app/planning/v3/news/_components/WeeklyPlanPanel.tsx`
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning/ui/workspaceQuickStartHandoff.test.ts`

## 사용 skill
- `planning-gate-selector`: workspace refactor + repo-wide dead-code cleanup 범위에서 필요한 검증 게이트를 최소 세트로 다시 고르기 위해 사용
- `work-log-closeout`: 오늘 라운드 closeout note 형식과 기록 범위를 저장소 관례에 맞추기 위해 사용

## 변경 이유
- `useWorkspaceRuntimeActionsBundle` 호출면이 여전히 scalar 나열형에 가까워 controller wiring 리스크가 남아 있었습니다.
- controller에 `applyWizardOutputAction`, `applyQuickStartAction` 본문이 남아 있어 orchestrator 경계가 완전히 닫히지 않았습니다.
- repo-wide lint warning 24개가 planning/news/reports/transactionStore에 남아 있어 이번 라운드 acceptance를 끝내려면 함께 0으로 정리할 필요가 있었습니다.

## 핵심 변경
- `useWorkspaceRuntimeBundle.ts`의 runtime actions 입력을 `profile / execution / snapshot / guard / feedback / runtime` 6개 grouped deps로 재구성해 controller wiring을 줄였습니다.
- `useWorkspaceQuickStartHandoff.ts`를 추가해 quickstart/wizard 적용 후 hydrate + notice + suggestion clear를 controller 밖 workspace-local helper로 옮겼습니다.
- `usePlanningWorkspaceController.tsx`는 runtime grouped deps 조립과 quickstart handoff wiring만 맡도록 줄였고, 직접 소유하던 handoff 본문은 제거했습니다.
- `ReportRecommendationsSection`, planning v3 news 클라이언트들, `transactionStore.ts`의 미사용 import/state/type/helper를 dead-code 정리만으로 제거해 repo-wide lint warning 0을 맞췄습니다.
- `workspaceQuickStartHandoff.test.ts`를 추가해 quickstart/wizard follow-through notice 문구가 기존 그대로 유지되는지 좁게 고정했습니다.

## 검증
- `pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/**/*.ts* tests/planning/ui/*.test.ts`
  - 통과. workspace 관련 warning/error 0.
- `pnpm exec eslint src/app/planning/reports/_components/ReportRecommendationsSection.tsx src/app/planning/v3/news/_components/*.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/lib/planning/v3/service/transactionStore.ts`
  - 통과. 잔여 repo warning 정리 대상 0 확인.
- `pnpm exec vitest run tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceAssumptionsEditor.test.ts tests/planning/ui/workspaceDebtOffersEditor.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts`
  - 통과. 12 files, 49 tests passed.
- `pnpm lint`
  - 통과. repo-wide warning/error 없이 종료.
- `pnpm build`
  - 통과.
- `pnpm e2e:rc`
  - 통과. 22/22 passed.

## 남은 리스크
- 이번 범위 기준 active blocker나 workspace-local refactor debt는 남기지 않았습니다.
- 남은 작업은 기능 추가나 더 넓은 구조 재설계를 선택할 때의 후속 선택지에 가깝고, 현재 `PlanningWorkspaceClient` 계열 내부 refactor closeout에는 추가 필수 항목이 없습니다.
