# 2026-03-10 snapshot selection type boundary

### 변경 파일

- `src/app/planning/_lib/snapshotSelection.ts`
- `src/app/planning/_components/SnapshotPicker.tsx`
- `src/app/planning/_lib/workspaceSnapshotSelection.ts`
- `src/components/PlanningWorkspaceClient.tsx`

### 변경 이유

- `workspaceSnapshotSelection` helper가 `SnapshotPicker` 컴포넌트에서 타입을 가져오고 있어 `_lib -> _components` 역참조가 생겨 있었다.
- snapshot selection 정책이 helper 쪽으로 이동한 뒤에는 타입도 같은 계층으로 옮기는 편이 다음 정리 작업에 더 안전하다.

### 핵심 변경

- `SnapshotSelection` 타입을 `src/app/planning/_lib/snapshotSelection.ts`로 분리했다.
- `SnapshotPicker`, `workspaceSnapshotSelection`, `PlanningWorkspaceClient`는 새 타입 파일을 공통으로 사용하도록 import를 정리했다.

### 검증

- `pnpm test tests/planning/ui/workspaceSnapshotSelection.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceUiState.test.ts`
- `pnpm exec eslint src/app/planning/_lib/snapshotSelection.ts src/app/planning/_components/SnapshotPicker.tsx src/app/planning/_lib/workspaceSnapshotSelection.ts src/components/PlanningWorkspaceClient.tsx`
- `pnpm build`

### 남은 리스크

- `src/lib/planning/v2/preflight.ts`의 `SnapshotSelection` shape는 아직 별도 정의다.
- 다음 후보는 `SnapshotPicker`/workspace selection의 render-level 통합 테스트를 붙이는 것이다.

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
