# 2026-04-11 Planning Workspace controller grouped return 전환

## 변경 파일
- `src/components/PlanningWorkspaceClient.tsx`
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/planning/workspace/groups.ts`
- `tests/planning/ui/workspaceGroups.test.ts`

## 사용 skill
- `planning-gate-selector`: grouped return 전환의 최소 검증 세트를 고르기 위해 사용
- `work-log-closeout`: 오늘 라운드 closeout 문서 형식과 기록 범위를 맞추기 위해 사용

## 변경 이유
- workspace 내부가 `flat controller -> groups selector -> panels` 3단계로 이어져 있어 route-facing client와 controller 사이 계약이 한 번 더 우회되고 있었습니다.
- 이번 라운드 목표는 동작을 바꾸지 않고 controller가 최종 grouped contract를 직접 반환하도록 바꿔 workspace 내부 구조를 마감하는 것입니다.
- selector 제거 뒤에도 `/planning` quickstart, runs, reports handoff와 focus 동작이 그대로 유지되는지를 검증 가능한 형태로 정리할 필요가 있었습니다.

## 핵심 변경
- `usePlanningWorkspaceController.tsx` 끝부분에서 `{ quickStart, profile, execution, results, dialogs, actions }`를 직접 조립해 반환하도록 바꾸고, 기존 flat 반환을 제거했습니다.
- `PlanningWorkspaceClient.tsx`에서 `buildPlanningWorkspaceGroups` 호출을 제거하고 controller 반환값을 바로 구조분해하도록 단순화했습니다.
- `workspace/groups.ts`를 runtime selector에서 type-only grouped contract 모듈로 전환했습니다. `buildPlanningWorkspaceGroups` export는 제거했고 panel 파일들은 기존 경로에서 타입만 계속 가져갑니다.
- `tests/planning/ui/workspaceGroups.test.ts`를 selector 전용 테스트에서 route-facing client wiring 검증으로 교체해 header와 5개 패널이 grouped hook 결과를 그대로 받는지만 좁게 확인하도록 바꿨습니다.
- grouped return 전환 뒤 더 이상 쓰이지 않던 controller 내부 helper/constant를 제거해 workspace 관련 warning 0 상태를 유지했습니다.

## 검증
- `pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/**/*.ts* tests/planning/ui/workspaceGroups.test.ts`
  - 통과. workspace 관련 warning/error 0 확인.
- `pnpm exec vitest run tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceGroups.test.ts`
  - 통과. 6 files, 28 tests passed.
- `pnpm lint`
  - 통과. workspace 범위 밖 기존 warning 24개만 유지됨.
- `pnpm build`
  - 1차 실패: `usePlanningWorkspaceController.tsx`에서 `StepId` import 누락으로 type check 실패.
  - 2차 통과: import 복구 후 build 완료.
- `pnpm e2e:rc`
  - 통과. 22/22 passed.

## 남은 리스크
- repo-wide lint warning 24개는 여전히 `planning/v3 news`, `ReportRecommendationsSection`, `transactionStore` 쪽에 남아 있고 이번 라운드 범위 밖입니다.
- `workspace/groups.ts`는 이제 type-only contract 모듈이라 runtime selector 복구를 전제한 테스트나 호출 코드는 더 이상 두지 않아야 합니다.
- 다음 우선순위는 workspace 내부 추가 fan-out보다 `usePlanningWorkspaceController.tsx` 자체의 파일 크기 축소 또는 state/effect 묶음 정리 쪽이 더 자연스럽습니다.
