# 2026-03-10 workspace profile hydrate state

### 변경 파일

- `src/app/planning/_lib/profileFormModel.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/profileFormModel.test.ts`

### 변경 이유

- `PlanningWorkspaceClient`는 프로필 로드, beginner auto-heal, 위저드 적용, 샘플 로드마다 `form/json/jsonDraft/error`를 같은 방식으로 다시 조립하고 있었다.
- 오전 helper 분리 작업 이후 남아 있던 profile hydrate/reset 묶음을 더 좁혀, 다음 local state 정리 지점을 안전하게 줄이려 했다.

### 핵심 변경

- `profileFormModel.ts`에 `ProfileJsonEditorState`, `buildProfileJsonEditorState()`, `hydrateProfileJsonEditorState()`를 추가했다.
- `PlanningWorkspaceClient`는 초기 editor state, 선택 프로필 hydrate, beginner goal/debt auto-heal, 위저드 적용, JSON apply, 샘플 로드를 새 helper 결과로 수렴했다.
- pending suggestion reset은 기존 `clearPendingSuggestions()`를 그대로 재사용해 상태 전이 책임만 줄였다.

### 검증

- `pnpm test tests/planning/ui/profileFormModel.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceAssumptionsEditor.test.ts tests/planning/ui/workspaceDebtOffersEditor.test.ts tests/planning/ui/runPipeline.test.ts tests/planning/ui/workspaceUiState.test.ts`
- `pnpm build`

### 남은 리스크

- snapshot selection normalize/fallback 묶음은 아직 `PlanningWorkspaceClient` 내부에 남아 있다.
- profile hydrate/reset은 줄였지만 `applyProfileForm()`을 중심으로 한 form row update 경로는 여전히 컴포넌트 로컬 state에 남아 있다.

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
