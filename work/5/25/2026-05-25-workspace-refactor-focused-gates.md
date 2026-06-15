# 2026-05-25 workspace refactor focused gates

## 변경 파일
- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
- `tests/planning/ui/workspaceProfileBundle.test.ts`
- `work/5/25/2026-05-25-workspace-refactor-focused-gates.md`

## 사용 skill
- `planning-gate-selector`: planning workspace hook/component/test 변경에 맞는 focused unit/e2e 검증을 고르는 데 사용했습니다.
- `work-log-closeout`: workspace 후보 검증, 재현된 hydration race, 수정 후 검증 결과를 `/work`에 기록했습니다.

## 변경 이유
- `workspace-refactor` 후보 25개를 별도 stage 후보로 볼 수 있는지 최신 상태에서 확인해야 했습니다.
- focused e2e 반복 중 프로필 hydrate가 입력 직후 로컬 편집값을 다시 서버 값으로 덮는 race가 1회 재현되어, 후보 완성도 기준상 수정이 필요했습니다.

## 핵심 변경
- 프로필 hydrate 적용 시점에 로컬 편집 버전이 바뀌었으면 예약된 hydrate state update가 현재 입력값을 덮지 않도록 guard를 추가했습니다.
- 기존 same-profile local edit skip 조건에 더해, hydrate 호출 이후 입력 이벤트가 들어오는 순서도 보호합니다.
- workspace profile bundle 단위 테스트에 edit version guard 분기를 추가했습니다.
- `PlanningWorkspaceClient.tsx` 기준 workspace 소스 18개 import 도달성을 재확인했습니다.

## 검증
- `node scripts/worktree_scope.mjs src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts` 실행: total 199 / in-scope 25 / out-of-scope 174
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts` 통과
- Node trailing whitespace check 실행: workspace 후보 25개 통과
- Node import reachability check 실행: `workspaceFiles: 18`, `reachable: 18`, `notReached: 0`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/controllerUtils.ts src/components/planning/workspace/executionOptions.ts src/components/planning/workspace/groups.ts src/components/planning/workspace/panels.tsx src/components/planning/workspace/panels/executionPanel.tsx src/components/planning/workspace/panels/modalPanel.tsx src/components/planning/workspace/panels/profilePanel.tsx src/components/planning/workspace/panels/resultsPanel.tsx src/components/planning/workspace/panels/shared.ts src/components/planning/workspace/panels/topSurfacePanel.tsx src/components/planning/workspace/usePlanningWorkspaceController.tsx src/components/planning/workspace/useWorkspaceArrivalHandoff.ts src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts src/components/planning/workspace/useWorkspaceFeedbackUiBundle.ts src/components/planning/workspace/useWorkspaceProfileBundle.ts src/components/planning/workspace/useWorkspaceQuickStartHandoff.ts src/components/planning/workspace/useWorkspaceRuntimeBundle.ts src/components/planning/workspace/useWorkspaceSnapshotSelectionBundle.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts` 통과: 6 files / 19 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts --grep "keeps unsaved profile edits" --workers=1 --repeat-each=3 --reporter=line` 최초 실행: 1 failed / 2 passed, `월 실수령`이 `5,300,000` 입력 뒤 `4,100,000`으로 되돌아가는 hydration race 재현
- 같은 e2e를 수정 후 재실행: 3 passed

## 남은 리스크
- workspace 후보 25개는 focused 검증 기준으로는 분리 가능한 상태입니다.
- 전체 worktree에는 scope 밖 변경이 여전히 많아 전체 stage는 위험합니다.
- 이번 라운드는 workspace profile hydrate race와 후보 검증에 집중했으며, 다른 후보 묶음의 사용자 흐름은 별도 라운드에서 확인해야 합니다.

## 다음 라운드
- `csp-style-runtime`, `dev-security-runtime`, `ops-ui` 중 사용자 영향과 PR 분리성이 큰 후보부터 focused gate를 최신화합니다.
- 이후 `report-export-deeplink`와 `workspace-refactor`를 별도 stage 후보로 유지할지, planning 사용자 흐름 묶음으로 함께 stage할지 결정합니다.
