# 2026-03-10 workspace parser follow-up

### 변경 파일

- `src/app/planning/_lib/workspaceRunResult.ts`
- `src/app/planning/_lib/workspaceResultInsights.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceRunResult.test.ts`
- `tests/planning/ui/workspaceResultInsights.test.ts`

### 변경 이유

- 우선순위 3번인 `PlanningWorkspaceClient` UI 계산 제거 후속으로, 워크스페이스가 저장된 run과 `resultDto`를 다시 해석하는 범위를 더 줄였다.
- `run.outputs.*` 직접 파싱과 step status 조립을 컴포넌트 밖 helper로 이동해 테스트 가능한 경계로 고정했다.

### 핵심 변경

- `workspaceRunResult.ts`를 추가해 `buildWorkspaceRunResultFromRecord()`와 `buildStepStatusesFromRunStages()`를 분리했다.
- `PlanningWorkspaceClient`는 `CombinedRunResult` 내부에 `simulate/scenarios/monte/actions/debt` 원본 조각을 들고 있지 않고, `resultDto + hasSimulateResult + healthWarnings + stepStatuses`만 소비하도록 정리했다.
- `workspaceResultInsights.ts`에 `buildWorkspaceMonteCarloVm()`와 `buildWorkspaceActionsVm()`를 추가해 monte/actions parser를 helper 계층으로 이동했다.
- `PlanningWorkspaceClient`는 scenario/debt에 이어 monte/actions도 helper 결과를 소비하게 맞췄다.

### 검증

- `pnpm test tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/runPipeline.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceRunResult.ts src/app/planning/_lib/workspaceResultInsights.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/workspaceResultInsights.test.ts`

### 남은 리스크

- `PlanningWorkspaceClient` 자체를 렌더링하는 직접 컴포넌트 테스트는 아직 없다.
- 전체 `pnpm build`, 전체 `pnpm test`, `pnpm planning:v2:compat`, `pnpm e2e:rc`는 아직 미실행이다.
- 다음 우선순위는 `legacy /report` 신규 진입 차단 강화 또는 workspace 내부의 남은 local state 전이 로직 정리다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
