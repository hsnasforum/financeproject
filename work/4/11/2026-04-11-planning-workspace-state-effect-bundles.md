# 2026-04-11 Planning Workspace state/effect bundle 정리

## 변경 파일
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/planning/workspace/useWorkspaceSnapshotSelectionBundle.ts`
- `src/components/planning/workspace/useWorkspaceFeedbackUiBundle.ts`
- `src/components/planning/workspace/useWorkspaceArrivalHandoff.ts`
- `tests/planning/ui/workspaceControllerUtils.test.ts`

## 사용 skill
- `planning-gate-selector`: workspace-local refactor에 맞는 최소 검증 세트와 전체 게이트 순서를 고르기 위해 사용
- `work-log-closeout`: 오늘 라운드 `/work` 기록 형식과 포함 범위를 저장소 관례에 맞추기 위해 사용

## 변경 이유
- `usePlanningWorkspaceController.tsx` 안에 snapshot selection, feedback UI, arrival handoff effect가 본문 로직과 섞여 있어 다음 우선순위였던 state/effect 묶음 정리가 필요했습니다.
- 이번 라운드 목표는 동작을 바꾸지 않고 controller가 async action과 grouped return 조립에 더 집중하도록 내부 역할을 나누는 것이었습니다.
- `profileId` query handoff 포커스, snapshot fallback, feedback/delete UI 상태 같은 사용자 경로가 그대로 유지되는지 검증 가능한 형태로 정리할 필요가 있었습니다.

## 핵심 변경
- snapshot 목록 fetch, selection fallback sync, `effectiveSnapshotSelection`, `selectedSnapshotItem` 계산을 `useWorkspaceSnapshotSelectionBundle.ts`로 옮겼습니다.
- feedback dialog, toast/notice auto-clear, 삭제 확인 dialog 상태와 `pushWorkspaceNotice`/`pushWorkspaceError` helper를 `useWorkspaceFeedbackUiBundle.ts`로 분리했습니다.
- `profileId` query 진입 시 reset, user interaction cancel listener, next-step autofocus effect를 `useWorkspaceArrivalHandoff.ts`로 분리했습니다.
- `usePlanningWorkspaceController.tsx`는 위 3개 bundle을 조합하는 상위 orchestrator로 정리하고, profile/run/save/optimize async 흐름과 grouped return 계약은 그대로 유지했습니다.
- arrival handoff guard를 좁게 확인하도록 `tests/planning/ui/workspaceControllerUtils.test.ts`에 `targetId` 누락 차단 케이스를 추가했습니다.
- controller 본문 길이는 2644줄에서 2531줄로 줄었고, 새 bundle 3개가 각 concern별로 workspace-local 경계를 형성하도록 정리했습니다.

## 검증
- `pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/**/*.ts* tests/planning/ui/*.test.ts`
  - 통과. workspace 관련 warning/error 0 확인.
- `pnpm exec vitest run tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceSnapshotSelection.test.ts`
  - 통과. 7 files, 36 tests passed.
- `pnpm lint`
  - 통과. workspace 밖 기존 warning 24개만 유지됨.
- `pnpm build`
  - 1차 실패: controller에 남아 있던 옛 snapshot fetch effect가 `setAvailableSnapshotItems`를 계속 참조해 type check 실패.
  - 2차 통과: 중복 effect 제거 후 build 완료.
- `pnpm e2e:rc`
  - 통과. 22/22 passed.

## 남은 리스크
- beginner/execution option state와 mode transition effect는 아직 main controller에 남아 있어, 다음 우선순위는 그 묶음을 별도 bundle로 fan-out하는 쪽이 자연스럽습니다.
- 이번 라운드는 controller-local hook 추출만 수행했으므로 profile hydration/load 흐름과 run/save/optimize async 액션 fan-out은 후속 라운드 범위입니다.
- repo-wide lint warning 24개는 여전히 `planning/v3 news`, `ReportRecommendationsSection`, `transactionStore` 쪽에 남아 있고 이번 범위 밖입니다.
