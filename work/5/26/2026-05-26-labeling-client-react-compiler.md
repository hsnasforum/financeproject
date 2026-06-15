# 2026-05-26 LabelingClient React Compiler 경고 축소

## 요약
- `/ops/labels`의 `LabelingClient.tsx`에서 `react-hooks/set-state-in-effect` 경고 3건을 제거했습니다.
- Dev unlock sessionStorage 복원과 초기 큐 로드는 effect 본문 직접 상태 갱신 대신 타이머 callback 경계에서 실행하도록 바꿨습니다.
- 필터 변경 시 선택 항목 초기화는 파생 선택 effect 대신 입력 이벤트에서 직접 처리하도록 좁혔습니다.
- 경로, API 계약, 사용자 노출 문구는 변경하지 않았습니다.

## 사용 skill
- `finance-skill-routing`: 이번 라운드의 기본 Finance Project 작업 skill 선택에 사용했습니다.
- `planning-gate-selector`: React hook/UI 변경의 최소 검증 세트 선정에 사용했습니다.
- `work-log-closeout`: 변경 후 `/work` 종료 기록 작성 기준으로 사용했습니다.

## 변경 파일
- `src/components/LabelingClient.tsx`

## 검증
- PASS: `corepack pnpm exec eslint src/components/LabelingClient.tsx --rule react-hooks/set-state-in-effect:error`
- PASS: `corepack pnpm exec eslint src/components/LabelingClient.tsx src/components/OpsPlanningFeedbackClient.tsx src/components/PlanningReportsClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - `LabelingClient.tsx` 경고 0건 확인
  - `OpsPlanningFeedbackClient.tsx`, `PlanningReportsClient.tsx`는 각각 3건 잔여
- PASS: `corepack pnpm exec vitest run tests/labels-store.test.ts`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm exec vitest run tests/planning/ops/backup-api.test.ts --testNamePattern "exports delta backup with only changed run and updates sync state"`
- PASS: `corepack pnpm test` 재실행

## 참고
- 첫 번째 `corepack pnpm test`는 `tests/planning/ops/backup-api.test.ts`의 delta backup 기대값에서 1회 실패했습니다.
- 같은 테스트를 단독 실행했을 때 통과했고, 전체 `corepack pnpm test` 재실행도 663개 파일 / 2035개 테스트 모두 통과했습니다.
- 이번 변경 파일과 실패 테스트 사이의 직접 의존성은 확인되지 않았습니다.

## 남은 리스크
- `LabelingClient.tsx`의 필터 변경 시 선택 초기화 동작은 유지하되, 기존 effect 기반 자동 동기화는 제거했습니다. 큐 갱신과 저장 후 이동은 기존 로직을 유지합니다.
- `/ops/labels`는 local-only ops 경로라 사용자 공개 경로 영향은 낮습니다.

## 다음 라운드
- `OpsPlanningFeedbackClient.tsx`의 `react-hooks/set-state-in-effect` 3건을 같은 방식으로 좁게 줄이는 것이 다음 우선순위입니다.
- 그 다음 public stable 경로인 `PlanningReportsClient.tsx`는 별도 라운드에서 더 강한 smoke와 함께 다루는 편이 안전합니다.
