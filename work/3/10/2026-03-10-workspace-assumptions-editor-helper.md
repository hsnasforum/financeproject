# 2026-03-10 workspace assumptions editor helper

### 변경 파일

- `src/app/planning/_lib/workspaceAssumptionsEditor.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceAssumptionsEditor.test.ts`

### 변경 이유

- `PlanningWorkspaceClient`의 assumptions 편집기는 `assumptionsForm`, `assumptionsExtraOverrides`, `assumptionsOverrideJson`, `assumptionsJsonError`를 같은 JSON <-> form 변환 경계에서 다루고 있었다.
- compatibility key 처리와 parse error를 component 밖으로 이동해 editor 상태 전이의 결합도를 더 낮췄다.

### 핵심 변경

- `workspaceAssumptionsEditor.ts`를 추가해 `splitAssumptionsRecord()`, `assumptionsFormToRecord()`, `parseAssumptionsEditorJson()`를 분리했다.
- `PlanningWorkspaceClient`는 assumptions JSON 교체 시 helper 결과만 소비하고, error 메시지도 helper 반환값을 그대로 사용한다.
- `workspaceAssumptionsEditor.test.ts`에 compatibility key 처리와 invalid JSON error를 고정했다.

### 검증

- `pnpm test tests/planning/ui/workspaceAssumptionsEditor.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceAssumptionsEditor.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceAssumptionsEditor.test.ts`

### 남은 리스크

- `profile JSON` 편집기 상태 전이는 아직 `PlanningWorkspaceClient` 내부에 남아 있다.
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
