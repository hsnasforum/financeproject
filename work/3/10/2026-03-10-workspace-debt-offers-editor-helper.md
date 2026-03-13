# 2026-03-10 workspace debt offers editor helper

### 변경 파일

- `src/app/planning/_lib/workspaceDebtOffersEditor.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceDebtOffersEditor.test.ts`

### 변경 이유

- `PlanningWorkspaceClient`의 debt offers 편집기는 `debtOfferRows`, `debtOffersJson`, `debtOffersJsonError` 3개 상태만 다뤄서 editor helper로 분리하기 가장 작은 범위였다.
- row parsing과 payload 조립, JSON parse error를 component 밖으로 이동해 로컬 상태 전이의 결합도를 줄였다.

### 핵심 변경

- `workspaceDebtOffersEditor.ts`를 추가해 `parseDebtOffersFormRows()`, `debtOfferRowsToPayload()`, `parseDebtOffersEditorJson()`를 분리했다.
- `PlanningWorkspaceClient`는 debt offers JSON 교체 시 helper 결과만 소비하고, error 메시지도 helper 반환값을 그대로 사용한다.
- `workspaceDebtOffersEditor.test.ts`에 raw row parsing, payload filtering, invalid JSON error를 고정했다.

### 검증

- `pnpm test tests/planning/ui/workspaceDebtOffersEditor.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceDebtOffersEditor.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceDebtOffersEditor.test.ts`

### 남은 리스크

- `assumptions JSON`과 `profile JSON` 편집기 상태 전이는 아직 `PlanningWorkspaceClient` 내부에 남아 있다.
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
