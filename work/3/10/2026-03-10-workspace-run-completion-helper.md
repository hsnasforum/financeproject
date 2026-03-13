# 2026-03-10 workspace run completion helper

### 변경 파일

- `src/app/planning/_lib/workspaceRunResult.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceRunResult.test.ts`

### 변경 이유

- `PlanningWorkspaceClient`는 이미 run 결과 파싱 일부를 helper로 옮겼지만, 실행 완료 후 `runResult`, `stepStatuses`, notice 조립은 아직 컴포넌트 안에 남아 있었다.
- 이 상태 전이 묶음을 helper로 분리해 저장된 run 표시 경로의 책임을 더 줄였다.

### 핵심 변경

- `workspaceRunResult.ts`에 `buildWorkspaceCompletedRunState()`를 추가했다.
- helper는 `buildWorkspaceRunResultFromRecord()` 결과를 재사용해 `stepStatuses`와 completion notice 목록을 함께 반환한다.
- `PlanningWorkspaceClient`의 `runPlanAction()`은 helper 반환값을 그대로 써서 상태 갱신과 notice 표시만 수행한다.
- `workspaceRunResult.test.ts`에 partial success + failed/skipped stage 조합의 notice 조립을 고정했다.

### 검증

- `pnpm test tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/runPipeline.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceRunResult.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceRunResult.test.ts`

### 남은 리스크

- `PlanningWorkspaceClient`에는 아직 `runResult.meta`와 health/snapshot 관련 직접 소비가 남아 있다.
- 직접 컴포넌트 렌더 테스트는 아직 없다.
- 전체 `pnpm build`, 전체 `pnpm test`, `pnpm planning:v2:compat`, `pnpm e2e:rc`는 아직 미실행이다.

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
