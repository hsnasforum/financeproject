# 2026-04-11 Planning Workspace 패널 fan-out 리팩터링

## 변경 파일
- `src/components/planning/workspace/panels.tsx`
- `src/components/planning/workspace/panels/shared.ts`
- `src/components/planning/workspace/panels/topSurfacePanel.tsx`
- `src/components/planning/workspace/panels/profilePanel.tsx`
- `src/components/planning/workspace/panels/executionPanel.tsx`
- `src/components/planning/workspace/panels/resultsPanel.tsx`
- `src/components/planning/workspace/panels/modalPanel.tsx`
- `src/app/planning/_lib/workspaceQuickStart.ts`

## 사용 skill
- `planning-gate-selector`: workspace panel fan-out 변경에 맞는 최소 검증 세트를 고르기 위해 사용
- `work-log-closeout`: 오늘 라운드 closeout 문서 섹션/기록 형식을 맞추기 위해 사용

## 변경 이유
- `src/components/planning/workspace/panels.tsx` 단일 파일에 5개 패널 구현이 몰려 있어 diff 표면과 내부 탐색 비용이 컸습니다.
- 이번 라운드 목표는 공개 import surface와 grouped contract를 그대로 둔 채 workspace-local view만 fan-out해서 다음 리팩터링 라운드의 변경 범위를 줄이는 것입니다.
- 검증 중 `workspaceQuickStart` saved 상태 톤이 테스트 기대와 어긋나 있던 잔여 mismatch를 확인해 no-behavior-change 계약에 맞게 함께 정리했습니다.

## 핵심 변경
- `panels.tsx`를 barrel로 축소하고 기존 export 이름 `PlanningWorkspaceTopSurfacePanel`, `PlanningWorkspaceProfilePanel`, `PlanningWorkspaceExecutionPanel`, `PlanningWorkspaceResultsPanel`, `PlanningWorkspaceModalPanel`을 그대로 유지했습니다.
- 실제 패널 구현을 `src/components/planning/workspace/panels/` 하위 5개 파일로 분리해 top/profile/execution/results/modal 경계를 파일 레벨에서 고정했습니다.
- 여러 패널에서 함께 쓰는 workspace-local helper를 `panels/shared.ts`로 옮기고, panel 하나에서만 쓰는 helper/constant는 각 패널 파일에 남겼습니다.
- controller, selector, grouped props 계약은 유지했고 panel 쪽으로 `fetch`, `localStorage`, `navigator`, `useEffect` 같은 부수효과를 옮기지 않았습니다.
- `src/app/planning/_lib/workspaceQuickStart.ts`의 saved 완료 상태 tone을 `border-slate-200 bg-slate-50`로 복원해 기존 quickstart 테스트 계약과 맞췄습니다.

## 검증
- `pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/**/*.ts* tests/planning/ui/workspaceGroups.test.ts`
  - 통과. workspace 관련 warning/error 0 확인.
- `pnpm test -- tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceGroups.test.ts`
  - 실패. `pnpm test --`가 repo 전체 Vitest를 실행했고 news search/alerts 관련 기존 실패와 `workspaceQuickStart` tone mismatch가 함께 노출됨.
- `pnpm exec vitest run tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceGroups.test.ts`
  - 통과. 6 files, 28 tests passed.
- `pnpm lint`
  - 통과. 다만 workspace 범위 밖의 기존 ESLint warning 24개가 `src/app/planning/reports/_components/ReportRecommendationsSection.tsx`, `src/app/planning/v3/news/_components/*`, `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`, `src/lib/planning/v3/service/transactionStore.ts`에 남아 있음.
- `pnpm build`
  - 통과.
- `pnpm e2e:rc`
  - 통과. 22/22 passed.

## 남은 리스크
- repo-wide lint warning 24개는 이번 workspace fan-out 범위 밖이라 그대로 남아 있습니다.
- `pnpm test -- <files>`가 좁은 실행 대신 repo 전체를 타는 현재 스크립트 동작은 다음 라운드에서 테스트 실행 가이드나 스크립트 보정이 필요합니다.
- `usePlanningWorkspaceController`는 아직 flat return을 유지하고 있어, 다음 우선순위는 grouped return 전환 여부 판단 또는 results panel 내부 2차 fan-out보다 controller/selectors 경계 재정리 쪽이 더 자연스럽습니다.
