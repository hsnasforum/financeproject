# 2026-03-13 home quick rules status followup

## 변경 파일
- `src/app/page.tsx`
- `src/components/home/TodayQueue.tsx`
- `src/components/HomePortalClient.tsx`
- `src/app/planning/_lib/planningQuickStart.ts`
- `src/components/planning/PlanningQuickStartGate.tsx`
- `src/app/planning/_lib/workspaceQuickStart.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/planningQuickStart.test.ts`
- `tests/planning/ui/workspaceQuickStart.test.ts`
- `tests/planning/ui/homeQuickRulesStatus.test.tsx`
- `tests/e2e/planning-quickstart-preview.spec.ts`

## 사용 skill
- `planning-gate-selector`: 홈 UI, quickstart helper, workspace CTA, 좁은 e2e까지 포함한 배치에서 `targeted vitest + eslint + build + narrow e2e`만 실행하도록 검증 범위를 고르기 위해 사용
- `work-log-closeout`: 이번 follow-up 라운드의 실제 변경과 실제 검증 결과를 `/work` 형식으로 정리하기 위해 사용

## 변경 이유
- 홈 액션 요약은 최근 run이 있어도 quick rules 기준 상태 문구가 없어 `지금 고정의무가 빡빡한지`, `생활비 여유가 있는지`를 한눈에 읽기 어려웠습니다.
- `/planning` quickstart는 preview -> accept 분리까지는 됐지만, accept 직후 사용자가 저장을 먼저 눌러야 하는지 바로 첫 실행으로 갈 수 있는지가 화면에서 즉시 읽히지 않았습니다.

## 핵심 변경
- `planningQuickStart`에 `resolvePlanningQuickRuleStatus`를 추가해 `고정의무 압박 / 생활비 압박 / 배분 가능` 상태를 공용 helper로 계산하고, preview에도 같은 상태를 노출하도록 맞췄습니다.
- 홈 `TodayQueue`와 `HomePortalClient`가 최신 run + profile 기준 quick rules 상태 칩과 설명 문구를 같이 보여 주도록 바꿔 액션 요약과 상태 읽기를 한 화면에 붙였습니다.
- `PlanningQuickStartGate`는 적용 후 success 상태를 별도로 렌더링하고, 현재 조건에 따라 `먼저 프로필 저장` 또는 `이제 첫 실행 시작` CTA를 바로 보여 주도록 바꿨습니다.
- `PlanningWorkspaceClient`와 `workspaceQuickStart` 문구는 accept 직후 안내가 실제 진행 조건과 맞도록 조정했고, 저장 버튼/첫 실행 버튼에 quickstart 후속 진입 target id를 부여했습니다.
- 좁은 e2e는 `preview -> accept -> 프로필 저장 -> 첫 실행 시작 -> stage timeline 표시`까지 한 spec으로 묶어 실제 첫 실행 진입을 고정했습니다.

## 검증
- `pnpm exec vitest run tests/planning/ui/planningQuickStart.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/homeQuickRulesStatus.test.tsx`
- `pnpm exec eslint src/app/page.tsx src/components/home/TodayQueue.tsx src/components/HomePortalClient.tsx src/app/planning/_lib/planningQuickStart.ts src/components/planning/PlanningQuickStartGate.tsx src/app/planning/_lib/workspaceQuickStart.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/planningQuickStart.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/homeQuickRulesStatus.test.tsx tests/e2e/planning-quickstart-preview.spec.ts`
- `pnpm build`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
- `git diff --check -- src/app/page.tsx src/components/home/TodayQueue.tsx src/components/HomePortalClient.tsx src/app/planning/_lib/planningQuickStart.ts src/components/planning/PlanningQuickStartGate.tsx src/app/planning/_lib/workspaceQuickStart.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/planningQuickStart.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/homeQuickRulesStatus.test.tsx tests/e2e/planning-quickstart-preview.spec.ts work/3/13/2026-03-13-home-quick-rules-status-followup.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- quick rules 상태는 현재 `실수령 / 고정지출 / 월 잉여금`의 얇은 규칙 세트라, 부채 상환 구조나 변동지출 상세를 따로 반영하지는 않습니다.
- quickstart 후속 CTA는 이번 라운드에서 기존 저장/실행 버튼으로 안내를 수렴한 것이고, 별도 preview token이나 임시 저장 모델은 도입하지 않았습니다.
- 홈 quick rules 상태는 최신 성공/부분성공 run이 있을 때만 노출되고, run이 없으면 기존 fallback 홈 카드가 그대로 유지됩니다.

## 다음 작업
- quick rules 상태 문구를 홈 액션 요약 외 다른 홈 요약 표면까지 확대할 실익이 있는지 판단합니다.
- quickstart 성공 상태에서 저장/실행 이후 저장 완료까지 더 이어지는 안내가 필요한지 확인합니다.
- 필요하면 home quick rules 상태와 quickstart 후속 CTA를 묶는 더 작은 UI 회귀 테스트를 추가합니다.
