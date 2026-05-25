# 2026-04-11 Planning Workspace execution state/effect bundle 분리

## 변경 파일
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts`
- `tests/planning/ui/workspaceExecutionOptionsBundle.test.ts`

## 사용 skill
- `planning-gate-selector`: execution bundle 분리 라운드의 최소 검증 세트와 전체 게이트 순서를 고르기 위해 사용
- `work-log-closeout`: 오늘 라운드 `/work` 기록 형식과 포함 범위를 저장소 관례에 맞추기 위해 사용

## 변경 이유
- `usePlanningWorkspaceController.tsx` 안에 beginner/execution option state와 mode transition/storage effect가 여전히 크게 남아 있어 다음 우선순위인 execution 묶음 분리가 필요했습니다.
- 이번 라운드 목표는 execution panel 관련 raw state/effect를 새 workspace-local hook으로 옮기고, main controller는 cross-bundle 계산과 async action 조립에 집중하도록 정리하는 것이었습니다.
- beginner/advanced 복원, feature flag 기반 강제 OFF, assumptions/debt JSON editor sync가 그대로 유지되는지 좁은 테스트와 실제 `/planning` 흐름으로 확인할 필요가 있었습니다.

## 핵심 변경
- `useWorkspaceExecutionOptionsBundle.ts`를 추가해 beginner mode, assumptions/debt/optimizer editor state, pipeline toggle state, feature-flag/health 기반 강제 OFF effect, localStorage load/save, mode transition restore를 한 곳에서 소유하도록 분리했습니다.
- assumptions/debt editor sync와 disable guard를 hook 안의 pure helper로 정리하고, `workspaceExecutionOptionsBundle.test.ts`에서 storage/load-save, advanced restore, disable guard, JSON sync를 직접 검증하도록 추가했습니다.
- `usePlanningWorkspaceController.tsx`는 execution 관련 raw state/effect를 제거하고 새 bundle return을 조립만 하도록 정리했습니다. profile mutation, health/preflight/result 파생값, run/save/optimize async action은 그대로 controller가 소유합니다.
- `PlanningWorkspaceClient` 재노출 경로와 grouped contract, panel/action surface는 바꾸지 않았습니다.
- controller 본문 길이는 2531줄에서 2336줄로 줄었고, execution concern이 별도 bundle 467줄로 fan-out되었습니다.

## 검증
- `pnpm exec eslint src/components/planning/workspace/usePlanningWorkspaceController.tsx src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts`
  - 통과.
- `pnpm exec vitest run tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceAssumptionsEditor.test.ts tests/planning/ui/workspaceDebtOffersEditor.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts`
  - 통과. 9 files, 40 tests passed.
- `pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/**/*.ts* tests/planning/ui/*.test.ts`
  - 통과. workspace 관련 warning/error 0 확인.
- `pnpm lint`
  - 통과. workspace 밖 기존 warning 24개만 유지됨.
- `pnpm build`
  - 통과.
- `pnpm e2e:rc`
  - 통과. 22/22 passed.

## 남은 리스크
- profile load/hydration state와 run/save/optimize async action은 아직 main controller에 남아 있어, 다음 우선순위는 profile bundle 또는 async action 묶음 정리 쪽이 자연스럽습니다.
- 이번 라운드의 `workspaceExecutionOptionsBundle.test.ts`는 hook 자체를 DOM harness로 올리기보다 분리된 helper 로직을 좁게 검증합니다. 현재 저장소에는 jsdom/happy-dom 기반 hook harness가 기본 설치되어 있지 않습니다.
- repo-wide lint warning 24개는 여전히 `planning/v3 news`, `ReportRecommendationsSection`, `transactionStore` 쪽에 남아 있고 이번 범위 밖입니다.
