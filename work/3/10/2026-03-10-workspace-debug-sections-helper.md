# 2026-03-10 workspace debug sections helper

### 변경 파일

- `src/app/planning/_lib/workspaceResultInsights.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceResultInsights.test.ts`

### 변경 이유

- `PlanningWorkspaceClient`에는 `warningsGoals/scenarios/monte/actions/debt` debug section 배열을 직접 조립하는 표현용 계산이 남아 있었다.
- 이 값들은 이미 만들어진 VM을 배열 형태로 다시 감싸는 수준이라 helper로 분리하기 가장 안전하다.

### 핵심 변경

- `workspaceResultInsights.ts`에 debug section helper 5개를 추가했다.
- `PlanningWorkspaceClient`는 debug section 배열을 직접 만들지 않고 helper 결과만 소비한다.
- `workspaceResultInsights.test.ts`에 beginner/advanced 분기와 각 debug section label 구성을 고정했다.

### 검증

- `pnpm test tests/planning/ui/workspaceResultInsights.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceResultInsights.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceResultInsights.test.ts`

### 남은 리스크

- `PlanningWorkspaceClient`에는 아직 일부 status/debug 표현과 form/editor 쪽 로컬 state 전이가 남아 있다.
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
