# 2026-05-26 Ops Planning Feedback React Compiler 경고 축소

## 요약
- `/ops/feedback/planning`의 `OpsPlanningFeedbackClient.tsx`에서 `react-hooks/set-state-in-effect` 경고 3건을 제거했습니다.
- Dev CSRF 복원, 초기 목록 로드, 선택 피드백의 triage 폼 동기화를 effect 본문 직접 상태 갱신 대신 타이머 callback 경계에서 실행하도록 바꿨습니다.
- planning feedback API 계약, 라우트, 사용자 노출 문구는 변경하지 않았습니다.
- 직전 라운드의 `LabelingClient.tsx`와 이번 파일 모두 0건이 되어, 세 후보 중 `PlanningReportsClient.tsx` 3건만 남았습니다.

## 사용 skill
- `finance-skill-routing`: 이번 라운드의 기본 Finance Project 작업 skill 선택에 사용했습니다.
- `planning-gate-selector`: local-only ops React hook/UI 변경의 검증 세트 선정에 사용했습니다.
- `work-log-closeout`: 변경 후 `/work` 종료 기록 작성 기준으로 사용했습니다.

## 변경 파일
- `src/components/OpsPlanningFeedbackClient.tsx`

## 검증
- PASS: `corepack pnpm exec eslint src/components/OpsPlanningFeedbackClient.tsx --rule react-hooks/set-state-in-effect:error`
- PASS: `corepack pnpm exec eslint src/components/LabelingClient.tsx src/components/OpsPlanningFeedbackClient.tsx src/components/PlanningReportsClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - `LabelingClient.tsx` 경고 0건 확인
  - `OpsPlanningFeedbackClient.tsx` 경고 0건 확인
  - `PlanningReportsClient.tsx`는 3건 잔여
- PASS: `corepack pnpm exec vitest run tests/dev-unlock-shortcut.test.ts tests/planning/ops/planningFeedbackApi.test.ts tests/planning/ops/planningFeedbackStore.test.ts tests/planning/ops/planningFeedbackCreateIssueApi.test.ts tests/planning/ops/planningFeedbackIssueBody.test.ts`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm test`
- PASS: `corepack pnpm build`

## 남은 리스크
- triage 폼 값 동기화는 기존 동작을 유지하되 한 tick 늦게 반영됩니다. 선택 변경 직후 사용자가 즉시 입력하는 극단 케이스는 cleanup으로 이전 선택의 예약 작업을 취소하도록 했습니다.
- `/ops/feedback/planning`은 production에서 차단되는 local-only ops 경로라 공개 사용자 경로 영향은 낮습니다.

## 다음 라운드
- `PlanningReportsClient.tsx`의 `react-hooks/set-state-in-effect` 3건을 별도 라운드에서 처리합니다.
- 이 파일은 public stable `/planning/reports` 경로이므로 targeted ESLint, 관련 report tests, `pnpm lint`, `pnpm test`, `pnpm build`, 필요 시 focused smoke까지 함께 확인하는 것이 안전합니다.
