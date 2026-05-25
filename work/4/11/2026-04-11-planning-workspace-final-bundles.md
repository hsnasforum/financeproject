# 2026-04-11 Planning Workspace final profile/runtime bundle 분리

## 변경 파일
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
- `src/components/planning/workspace/useWorkspaceRuntimeBundle.ts`
- `tests/planning/ui/workspaceProfileBundle.test.ts`
- `tests/planning/ui/workspaceRuntimeBundle.test.ts`

## 사용 skill
- `planning-gate-selector`: workspace 내부 refactor에서 필요한 최소 검증 세트와 전체 게이트 순서를 고르기 위해 사용
- `work-log-closeout`: 오늘 라운드 closeout note 형식과 기록 범위를 저장소 관례에 맞추기 위해 사용

## 변경 이유
- `usePlanningWorkspaceController.tsx` 안에 남아 있던 마지막 큰 묶음인 profile lifecycle과 runtime state/action을 분리해 workspace 내부 refactor를 마감할 필요가 있었습니다.
- 이번 라운드 목표는 public surface와 grouped contract를 유지한 채 controller를 cross-bundle 파생값 계산과 grouped 조립 역할로 축소하는 것이었습니다.
- quickstart/runs/reports handoff, normalization suggestion gating, delete confirm, baseline/runtime 흐름이 그대로 유지되는지 기존 planning gate와 `/planning` e2e로 다시 확인해야 했습니다.

## 핵심 변경
- `useWorkspaceProfileBundle.ts`를 추가해 profile 목록 load/hydration, localStorage selection sync, beginner goal auto-fill, profile save/delete, JSON/form 편집, normalization suggestion queue를 한 묶음으로 이동했습니다.
- `useWorkspaceRuntimeBundle.ts`를 추가해 baseline run load, current profile hash sync, run/save/optimize/feedback action, scenario/baseline/runtime helper를 controller 밖으로 fan-out했습니다.
- `usePlanningWorkspaceController.tsx`는 feedback/snapshot/execution/profile/runtime bundle을 조립하고, health guard/preflight/result insight/quickstart VM/grouped return만 직접 계산하도록 줄였습니다.
- 새 pure helper 테스트 `workspaceProfileBundle.test.ts`, `workspaceRuntimeBundle.test.ts`를 추가해 profile selection priority, beginner goal/debt limit, delete/save helper branch, baseline preference, review gating, snapshot fallback, run input binding을 좁게 검증했습니다.
- 첫 `pnpm build`에서 `buildStepStatusesFromRunStages` import를 잘못 옮긴 오류를 확인했고, `useWorkspaceRuntimeBundle.ts` import 경로를 `workspaceRunResult` 기준으로 바로잡은 뒤 재실행 통과했습니다.

## 검증
- `pnpm exec vitest run tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceAssumptionsEditor.test.ts tests/planning/ui/workspaceDebtOffersEditor.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts`
  - 통과. 11 files, 48 tests passed.
- `pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/**/*.ts* tests/planning/ui/*.test.ts`
  - 통과. workspace 관련 warning/error 0 확인.
- `pnpm lint`
  - 통과. workspace 밖 기존 warning 24개만 유지됨.
- `pnpm build`
  - 첫 실행은 `useWorkspaceRuntimeBundle.ts`의 `buildStepStatusesFromRunStages` import 경로 오류로 실패.
  - import 수정 후 재실행 통과.
- `pnpm e2e:rc`
  - 통과. 22/22 passed.

## 남은 리스크
- workspace 구조 마감 목표는 달성했지만 `useWorkspaceRuntimeActionsBundle` 입력 surface는 여전히 profile/execution/feedback 의존성이 큰 편이라, 다음 우선순위는 bundle input contract 축소 또는 runtime helper contract narrowing 쪽이 자연스럽습니다.
- `applyWizardOutputAction`, `applyQuickStartAction` 같은 cross-bundle handoff action은 controller에 남아 있습니다. 현재 역할상 맞지만, 더 줄이려면 별도 quickstart handoff helper로 한 번 더 정리할 수 있습니다.
- repo-wide lint warning 24개(`planning/v3 news`, `ReportRecommendationsSection`, `transactionStore`)는 이번 범위 밖으로 남아 있습니다.
