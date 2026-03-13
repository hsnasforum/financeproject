# 2026-03-10 workspace snapshot context helper

### 변경 파일

- `src/app/planning/_lib/workspaceRunResult.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceRunResult.test.ts`

### 변경 이유

- `PlanningWorkspaceClient`에는 feedback 저장, 결과 해석 카드, 피드백 모달 debug 정보에 쓰이는 `runResult.meta.snapshot` 직접 접근이 남아 있었다.
- 같은 snapshot 파생값을 여러 군데서 다시 조립하지 않도록 helper로 수렴했다.

### 핵심 변경

- `workspaceRunResult.ts`에 `buildWorkspaceSnapshotState()`를 추가했다.
- helper는 run snapshot과 선택된 snapshot을 합쳐 `feedbackContext`, `outcomesMeta`, `displayId`를 반환한다.
- `PlanningWorkspaceClient`는 feedback payload의 snapshot context, 결과 해석 카드의 `snapshotMeta`, 피드백 모달의 snapshot 표시를 helper 결과로만 소비한다.
- `workspaceRunResult.test.ts`에 run snapshot 우선 + selection fallback 조합을 고정했다.

### 검증

- `pnpm test tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/runPipeline.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceRunResult.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceRunResult.test.ts`

### 남은 리스크

- `PlanningWorkspaceClient`에는 아직 일부 debug section 조립과 결과 카드의 표현용 파생값이 남아 있다.
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
