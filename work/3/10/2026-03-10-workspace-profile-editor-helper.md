# 2026-03-10 workspace profile editor helper

### 변경 파일

- `src/app/planning/_lib/profileFormModel.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/profileFormModel.test.ts`

### 변경 이유

- `PlanningWorkspaceClient`의 profile JSON 편집기에는 `normalizeDraft + pretty`와 `safeParseProfileJson + profileToForm + formToProfile` 조합이 컴포넌트 안에 남아 있었다.
- 상태 setState는 그대로 두고, pure conversion만 `profileFormModel`로 옮겨 편집기 상태 전이의 책임을 더 줄였다.

### 핵심 변경

- `profileFormModel.ts`에 `buildProfileJsonEditorDraft()`와 `parseProfileJsonEditorDraft()`를 추가했다.
- `PlanningWorkspaceClient`의 `syncProfileJsonFromForm()`과 `applyProfileJsonEditorAction()`은 helper 결과만 소비한다.
- `loadProfiles`, `selectedProfile` effect, beginner mode 기본 goal/debt 보정 경로도 같은 draft helper를 재사용하도록 맞췄다.
- `profileFormModel.test.ts`에 editor draft 생성, editor draft parse, invalid JSON error를 고정했다.

### 검증

- `pnpm test tests/planning/ui/profileFormModel.test.ts`
- `pnpm exec eslint src/app/planning/_lib/profileFormModel.ts src/components/PlanningWorkspaceClient.tsx`

### 남은 리스크

- `PlanningWorkspaceClient`에는 아직 일부 form/editor setState 묶음 자체는 남아 있다.
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
