# 2026-05-25 next round planning breakdown

## 변경 파일
- `work/5/25/2026-05-25-next-round-planning-breakdown.md`

## 사용 skill
- `finance-skill-routing`: 오늘 최신 `/work`와 남은 후보를 기준으로 다음 라운드에 붙일 최소 스킬 조합을 정리했습니다.
- `planning-gate-selector`: 다음 라운드 후보별로 필요한 최소 검증 세트를 고르는 기준으로 사용했습니다.

## 변경 이유
- `f352a8b` 이후 다음 실행 라운드를 단일 후보로 좁히고, 메인 에이전트가 직접 잡아야 할 핵심 경로와 범위 밖 변경 묶음을 분리할 필요가 있습니다.
- 현재 worktree에는 planning workspace, planner wizard, planning v3 news/batches/balances, scripts/docs 등 여러 갈래 변경이 함께 남아 있어 다음 stage를 한 묶음으로 좁히지 않으면 검증과 커밋 범위가 다시 커질 위험이 있습니다.

## 전달 변경
- 다음 라운드 추천 후보를 `planning workspace 분리`로 고정했습니다.
- 이유는 오늘 기록 기준으로 workspace 묶음이 이미 별도 scope map과 focused gate 메모를 갖고 있고, `PlanningWorkspaceClient` 진입점 기준 reachability와 focused unit/e2e 근거가 정리돼 있어 다음 stage로 옮기기 가장 안전하기 때문입니다.
- planner wizard, news/batches/balances, scripts/docs, guidedoc, data-source/DART는 이번 라운드 범위 밖 묶음으로 남기기로 했습니다.

## 추천 검증
- `git diff --check -- src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace tests/planning/ui`
- `pnpm lint`
- `pnpm test tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts`
- `pnpm build`
- [조건부] workspace 사용자 흐름이나 selector를 건드리면 `pnpm e2e:rc` 대신 우선 focused Playwright 재현부터 확인하고, 최종 gate는 메인 에이전트가 실행합니다.

## 남은 리스크
- `src/components/PlanningWorkspaceClient.tsx` 자체 수정분까지 함께 stage하지 않으면 workspace 분리 파일만으로 import graph가 끊길 수 있습니다.
- 현재 worktree 전반에 다른 대규모 UI/ops/docs 변경이 함께 남아 있어 stage 범위 확인 없이 진행하면 충돌과 과검증이 다시 발생할 수 있습니다.

## 다음 라운드 우선순위
- 우선순위 1: `planning workspace 분리`
- 우선순위 2: `planner wizard 분리`
- 우선순위 3: `planning v3 news/batches/balances 화면 변경`
