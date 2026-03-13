# 2026-03-10 workspace scenario/debt vm helper

### 변경 파일

- `src/app/planning/_lib/workspaceResultInsights.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceResultInsights.test.ts`

### 변경 이유

- `PlanningWorkspaceClient` 안에 남아 있던 `resultDto.scenarios` / `resultDto.debt` 재해석 블록을 줄였다.
- scenario 비교표와 debt typed-first/raw-fallback 로직을 UI 컴포넌트 밖 helper로 이동해 컴포넌트 내부 raw DTO 파싱을 축소했다.
- 기존 사용자 노출 계약은 바꾸지 않고, view model 조립 위치만 공통 helper로 정리했다.

### 핵심 변경

- `buildWorkspaceScenarioVm()` 추가
- `buildWorkspaceDebtVm()` 추가
- `PlanningWorkspaceClient`가 local parser 대신 helper 결과를 소비하도록 전환
- helper 테스트에 scenario/debt 케이스 추가

### 검증

- `pnpm test tests/planning/ui/workspaceResultInsights.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceResultInsights.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceResultInsights.test.ts`

### 남은 리스크

- `actions` / `monteCarlo` parser는 아직 `PlanningWorkspaceClient` 안에 남아 있다.
- `toStepStatusesFromRunStages()` / `toCombinedRunResultFromRecord()`도 여전히 컴포넌트 내부 transition helper다.
- 전체 `pnpm build`, 전체 `pnpm test`, `pnpm planning:v2:compat`, `pnpm e2e:rc`는 미실행이다.

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
