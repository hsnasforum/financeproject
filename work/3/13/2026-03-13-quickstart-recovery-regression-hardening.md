# 2026-03-13 quickstart recovery regression hardening

## 변경 파일
- src/components/planning/PlanningQuickStartGate.tsx
- src/components/PlanningWorkspaceClient.tsx
- src/app/planning/_lib/workspaceQuickStart.ts
- tests/planning/ui/planningQuickStartGate.test.tsx
- tests/planning/ui/workspaceQuickStart.test.ts

## 사용 skill
- planning-gate-selector: quickstart UI/helper 회귀 범위에 맞는 최소 검증 세트를 유지했습니다.
- work-log-closeout: /work 종료 기록 형식과 필수 항목을 맞췄습니다.

## 변경 이유
- Web Crypto 미지원 또는 profile hash 비교 실패 시 quickstart 후속 안내가 첫 실행 미완료처럼 과하게 깨지지 않도록, 완료로 단정하지 않는 중립 fallback이 필요했습니다.
- normalization suggestion가 여러 개 노출되는 상태에서 quickstart가 dirty 분기로 유지되는지를 최소 1개 회귀 테스트로 고정할 필요가 있었습니다.

## 핵심 변경
- `PlanningWorkspaceClient`에서 저장 실행의 profile hash가 있더라도 현재 profile hash 입력/계산을 확정하지 못하면 곧바로 `runStatusReviewRequired`로 내려, quickstart 카드가 첫 실행 미완료로 단정하지 않도록 보수적으로 조정했습니다.
- review fallback일 때 quickstart의 `다음 단계` 타깃을 기존 `실행 내역` 버튼으로 돌리고, 같은 버튼을 강조해 새 CTA 없이 중립 확인 흐름으로 맞췄습니다.
- `workspaceQuickStart`와 `PlanningQuickStartGate`의 review fallback 문구를 `아래 실행 내역에서 진행 상태를 다시 확인` 기준으로 정리해, 상태를 확신할 수 없을 때 완료처럼 보이지 않게 맞췄습니다.
- `workspaceQuickStart` 테스트의 neutral fallback 케이스를 실행 내역 기준 문구로 고정했습니다.
- `workspaceQuickStart` 테스트에 `pendingSuggestionsCount: 2` dirty 회귀를 남겨 normalization suggestion 다수 노출 상태가 quickstart dirty 분기를 유지하는지 고정했습니다.

## 검증
- `pnpm exec vitest run tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/workspaceQuickStart.test.ts` 통과
- `pnpm exec eslint src/components/planning/PlanningQuickStartGate.tsx src/components/PlanningWorkspaceClient.tsx src/app/planning/_lib/workspaceQuickStart.ts tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/workspaceQuickStart.test.ts` 통과
- `pnpm build` 통과
- `git diff --check -- src/components/planning/PlanningQuickStartGate.tsx src/components/PlanningWorkspaceClient.tsx src/app/planning/_lib/workspaceQuickStart.ts tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/workspaceQuickStart.test.ts` 통과
- [미실행] `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`

## 남은 리스크
- Web Crypto 미지원 환경에서는 여전히 현재 프로필과 저장 실행의 exact match를 자동 복원하지 못하므로, 이번 라운드는 완료 표시를 중립 안내로 낮추는 수준까지 처리했습니다.
- 실제 브라우저에서 review fallback일 때 `실행 내역` 강조 동선이 충분한지는 이번 라운드에서 e2e로 재검증하지 않았습니다.
- 다음 라운드 우선순위는 quickstart fallback의 브라우저별 재현 환경 보강 또는 좁은 e2e 재실행입니다.
