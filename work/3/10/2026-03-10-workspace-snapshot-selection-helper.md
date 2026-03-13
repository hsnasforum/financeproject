# 2026-03-10 workspace snapshot selection helper

### 변경 파일

- `src/app/planning/_lib/workspaceSnapshotSelection.ts`
- `src/app/api/planning/v2/assumptions/snapshots/route.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceSnapshotSelection.test.ts`
- `tests/planning-v2-api/assumptions-snapshots-route.test.ts`

### 변경 이유

- `PlanningWorkspaceClient` 내부에는 snapshot API 응답 파싱, history 정렬, latest/history 초기 선택, 사라진 history id fallback, `SNAPSHOT_NOT_FOUND` 복구가 분산돼 있었다.
- 이 묶음은 실행 파이프라인을 건드리지 않고 helper로 분리할 수 있는 다음 안전한 local state 정리 대상이었다.

### 핵심 변경

- `workspaceSnapshotSelection.ts`를 추가해 snapshot item 파싱, history 정렬, API payload -> items state 변환, 초기 선택/정규화, selected item 해석, `SNAPSHOT_NOT_FOUND` fallback을 helper로 수렴했다.
- `PlanningWorkspaceClient`는 snapshot fetch success 경로와 선택 fallback 경로에서 새 helper를 사용하도록 정리했다.
- `effectiveSnapshotSelection`을 도입해 사라진 history id가 남아 있어도 preflight, selector UI, selected snapshot 계산이 같은 기준으로 동작하게 맞췄다.
- assumptions snapshot route와 helper parser가 `korea` 필드를 함께 보존하도록 맞춰, SSR 초기 목록과 client refresh 이후 picker 상세 정보가 같은 shape를 유지하게 했다.
- assumptions snapshot route의 history item에도 `warningsCount`를 내려 SSR 초기 목록과 client refresh 이후 warning chip 표시 기준이 같아지게 했다.
- 전용 테스트와 route test를 추가해 정렬, 초기 선택, missing history fallback, error-code fallback, `korea`/`warningsCount` payload parity를 고정했다.

### 검증

- `pnpm test tests/planning/ui/workspaceSnapshotSelection.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceUiState.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceSnapshotSelection.ts src/app/api/planning/v2/assumptions/snapshots/route.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceSnapshotSelection.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts`
- `pnpm build`

### 남은 리스크

- snapshot selection은 정리했지만 snapshot fetch 실패 시 안내 문구와 retry UX는 여전히 `PlanningWorkspaceClient` 안에 남아 있다.
- 다음 후보는 run/save 입력 파서 정리보다, snapshot 관련 warning/error surface를 helper로 더 좁힐지 검토하는 편이 안전하다.

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
