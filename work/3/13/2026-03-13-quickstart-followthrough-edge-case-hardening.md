# 2026-03-13 quickstart followthrough edge-case hardening

## 변경 파일
- src/components/planning/PlanningQuickStartGate.tsx
- src/components/PlanningWorkspaceClient.tsx
- src/app/planning/_lib/workspaceQuickStart.ts
- tests/planning/ui/workspaceQuickStart.test.ts

## 사용 skill
- planning-gate-selector: quickstart UI/helper 변경에 필요한 최소 검증 세트를 유지했습니다.
- work-log-closeout: `/work` 종료 기록 형식과 필수 항목을 맞췄습니다.

## 변경 이유
- quickstart 적용 뒤 새로고침 시 후속 안내가 완전히 사라지지 않도록, 실제 workspace/profile/run 상태에서 복원 가능한 안내만 다시 보여줄 필요가 있었습니다.
- 이미 선택된 프로필에 미저장 변경이 있는 경우에도 1단계가 완료처럼 보이지 않게, success 문구와 CTA를 더 보수적으로 맞출 필요가 있었습니다.

## 핵심 변경
- `PlanningQuickStartGate`가 로컬 applied state가 없어도 실제 workspace 상태(saved/dirty/unknown, run/save 상태)를 기준으로 중립적인 후속 안내 블록을 복원하도록 조정했습니다.
- quickstart를 선택된 저장 프로필에 덮어쓴 직후에는, dirty 상태를 한 번 확인하기 전까지 저장 완료처럼 보이지 않도록 후속 문구를 보수적으로 바꿨습니다.
- `PlanningWorkspaceClient`의 beginner 저장 성공 문구를 create/update 모두 `프로필 저장 완료. 다음 단계는 첫 실행 시작입니다.`로 맞췄습니다.
- `workspaceQuickStart`에 stable stringify 비교를 추가해 dirty 판정을 정렬된 canonical 값 기준으로 고정했고, client에서는 Web Crypto로 현재 profile hash를 계산해 저장된 run과 비교하도록 바꿨습니다.
- `tests/planning/ui/workspaceQuickStart.test.ts`에 `selected profile + unsaved edits` edge case를 고정했습니다.

## 검증
- `pnpm exec vitest run tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/workspaceQuickStart.test.ts` 통과
- `pnpm exec eslint src/components/planning/PlanningQuickStartGate.tsx src/components/PlanningWorkspaceClient.tsx src/app/planning/_lib/workspaceQuickStart.ts tests/planning/ui/workspaceQuickStart.test.ts` 통과
- `pnpm build` 통과
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1` 통과
- `git diff --check -- src/components/planning/PlanningQuickStartGate.tsx src/components/PlanningWorkspaceClient.tsx src/app/planning/_lib/workspaceQuickStart.ts tests/planning/ui/workspaceQuickStart.test.ts work/3/13/2026-03-13-quickstart-followthrough-edge-case-hardening.md` 통과

## 남은 리스크
- Web Crypto를 사용할 수 없는 브라우저/환경에서는 현재 profile hash 비교가 빈 값으로 degrade되어, 새로고침 뒤 report 단계 복원이 더 보수적으로 내려갈 수 있습니다.
- normalization suggestion 다수 노출 상태는 이번 라운드에서 별도 회귀 테스트로 고정하지 않았습니다.
