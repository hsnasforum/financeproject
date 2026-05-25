# 2026-05-25 planning workspace split stage

## 변경 파일
- `src/app/planning/page.tsx`
- `src/app/planning/_components/PlanningMiniCharts.tsx`
- `src/app/planning/_lib/workspaceQuickStart.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `src/components/planning/workspace/*`
- `tests/planning/ui/workspaceControllerUtils.test.ts`
- `tests/planning/ui/workspaceExecutionOptionsBundle.test.ts`
- `tests/planning/ui/workspaceGroups.test.ts`
- `tests/planning/ui/workspaceProfileBundle.test.ts`
- `tests/planning/ui/workspaceQuickStartHandoff.test.ts`
- `tests/planning/ui/workspaceRuntimeBundle.test.ts`

## 사용 skill
- `planning-gate-selector`: workspace hook/component, `/planning` page, route SSOT 영향에 맞는 focused gate와 build 범위를 고르는 데 사용.
- `route-ssot-check`: `/planning` route surface가 기존 `docs/current-screens.md` 공개 경로와 동일한지 확인하는 데 사용.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크를 이 종료 기록 형식에 맞추는 데 사용.

## 변경 이유
- `PlanningWorkspaceClient`가 이미 workspace 하위 모듈을 참조하지만 해당 모듈들이 미스테이지 상태라 단독 체크아웃 기준 build 계약이 깨질 수 있었다.
- `/planning?profileId=...` 진입 시 선택 프로필을 서버에서 먼저 hydrate해 초기 UI 공백과 select mismatch를 줄일 필요가 있었다.
- workspace controller가 너무 큰 단위로 남아 있어 프로필, 실행 옵션, 런타임 액션, 패널 props 계약을 테스트 가능한 작은 단위로 분리할 필요가 있었다.

## 핵심 변경
- workspace controller를 profile, execution options, runtime, feedback, snapshot, quickstart handoff hook과 panel 컴포넌트로 분리했다.
- `/planning` 서버 page에서 query profile 또는 default profile을 미리 조회해 `PlanningWorkspaceClient`에 초기 선택 프로필을 전달한다.
- profile hydrate race 보호, quickstart arrival focus 완료 조건, header/profile select pending option을 보강했다.
- feature flag가 켜진 고급 모드에서 optimizer 실행 토글이 실제 UI와 action에 연결되도록 복구했다.
- mini chart range bar를 SVG 기반으로 바꾸고 delta 색상을 `success/danger` 톤으로 명확히 정리했다.

## 검증
- PASS: `git diff --check -- src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts src/app/planning/_components/PlanningMiniCharts.tsx src/app/planning/_lib/workspaceQuickStart.ts src/app/planning/page.tsx`
- PASS: `corepack pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace src/app/planning/_components/PlanningMiniCharts.tsx src/app/planning/_lib/workspaceQuickStart.ts src/app/planning/page.tsx tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts`
- PASS: `corepack pnpm test tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/planningQuickStart.test.ts tests/planning/ui/workspaceAssumptionsEditor.test.ts tests/planning/ui/workspaceDebtOffersEditor.test.ts`
- PASS: `corepack pnpm exec tsc --noEmit`
- PASS: `corepack pnpm test tests/planning/catalog/currentScreens.fullRouteSet.test.ts tests/planning/catalog/currentScreens.experimentalRoutes.test.ts tests/planning/catalog/currentScreens.opsRoutes.test.ts tests/planning/catalog/currentScreens.reportRoutes.test.ts tests/planning/catalog/currentScreens.supportRoutes.test.ts`
- PASS: `corepack pnpm exec playwright test tests/e2e/planning-quickstart-preview.spec.ts --grep planning.*arrival --workers=1 --reporter=line` after arrival focus target reset fix.
- PASS: `corepack pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts --grep unsaved.*profile.*edits --workers=1 --reporter=line`
- PASS: `corepack pnpm build`
- 참고: `corepack pnpm planning:current-screens:guard`는 스크립트 내부의 bare `pnpm` 호출이 WSL PATH에서 발견되지 않아 실패했다. 동일 파일 세트는 위의 `corepack pnpm test ...currentScreens...` 명령으로 통과했다.

## 남은 리스크
- 전체 `corepack pnpm e2e:rc`는 이번 stage에서 실행하지 않았다. 이 stage는 `/planning` workspace hydrate/focus 경로의 focused e2e로 검증했다.
- worktree에는 PlannerWizard, v3 news/balances/batches, scripts, docs 등 범위 밖 변경이 계속 남아 있어 다음 stage도 pathspec 분리가 필요하다.
