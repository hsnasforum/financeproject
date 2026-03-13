# 2026-03-13 quickstart success followthrough closeout

## 변경 파일
- `src/components/planning/PlanningQuickStartGate.tsx`
- `src/components/PlanningWorkspaceClient.tsx`
- `src/app/planning/_lib/workspaceQuickStart.ts`
- `tests/planning/ui/workspaceQuickStart.test.ts`
- `tests/e2e/planning-quickstart-preview.spec.ts`

## 사용 skill
- `planning-gate-selector`: quickstart success 문구, workspace 카드, 좁은 e2e 범위에서 `targeted vitest + eslint + build + narrow e2e + diff check`만 실행하도록 검증 폭을 고르기 위해 사용
- `work-log-closeout`: 이번 라운드의 실제 변경과 실제 검증 결과를 `/work` 형식으로 정리하기 위해 사용

## 변경 이유
- quickstart success 상태가 `프로필 저장`, `첫 실행`, `결과 저장`의 후속 순서를 한 번에 보여 주지 못해 저장 직후 다음 단계가 모호했습니다.
- 첫 실행 뒤에도 success 블록이 이전 안내를 유지해 어디까지 완료됐는지 읽기 어려웠고, 실제 다음 버튼 target도 단계별로 바뀌지 않았습니다.

## 핵심 변경
- `PlanningQuickStartGate`가 quickstart 적용 시점에 프로필 저장이 필요했는지 기억하고, 이후 `프로필 저장 -> 첫 실행 -> 결과 저장 -> 리포트` 단계에 따라 제목, 완료 요약, CTA target을 바꾸도록 정리했습니다.
- `PlanningWorkspaceClient`에서 quickstart 다음 단계 CTA를 `새로 만들기`, `첫 실행 시작`, `결과 저장`, `리포트` 버튼으로 실제 흐름에 맞게 연결하고 저장/리포트 버튼에 target id를 추가했습니다.
- workspace quickstart helper는 카드 제목, 설명, 진행 상태 문구를 `프로필 저장/선택 -> 첫 실행 -> 결과 저장` 기준으로 다시 써서 저장 완료 뒤 다음 단계가 바로 읽히게 맞췄습니다.
- quickstart e2e는 `preview -> apply -> 프로필 저장 -> 첫 실행 -> 결과 저장 -> 리포트 버튼 노출`까지 한 spec으로 보강해 이번 follow-through만 좁게 고정했습니다.

## 검증
- `pnpm exec vitest run tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/workspaceQuickStart.test.ts`
- `pnpm exec eslint src/components/planning/PlanningQuickStartGate.tsx src/components/PlanningWorkspaceClient.tsx src/app/planning/_lib/workspaceQuickStart.ts tests/planning/ui/workspaceQuickStart.test.ts tests/e2e/planning-quickstart-preview.spec.ts`
- `pnpm build`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
- `git diff --check -- src/components/planning/PlanningQuickStartGate.tsx src/components/PlanningWorkspaceClient.tsx src/app/planning/_lib/workspaceQuickStart.ts tests/planning/ui/workspaceQuickStart.test.ts tests/e2e/planning-quickstart-preview.spec.ts`

## 남은 리스크
- quickstart success follow-through는 현재 세션 UI 상태 기준이라, 적용 직후 페이지를 새로고침하면 gate 내부의 적용 완료 블록 자체는 유지되지 않습니다.
- 진행 상태 요약은 quickstart 후속 순서를 우선으로 보여 주기 때문에, 이미 선택된 프로필에 수동 편집 미저장분이 있는 경우에도 1단계는 `프로필 저장/선택 완료`로 보일 수 있습니다.
- e2e는 happy path에서 저장 경고 확인까지 흡수하지만, 정규화 제안이 다수 뜨는 별도 분기나 저장 차단 오류 케이스는 이번 라운드 범위에 포함하지 않았습니다.
