# 2026-05-25 workspace PR 범위 매핑

## 변경 파일
- `work/5/25/2026-05-25-workspace-pr-scope-map.md`

## 사용 skill
- `planning-gate-selector`: planning workspace 분리 파일의 검증 범위를 unit, build, e2e 증거로 나누는 데 사용했습니다.
- `work-log-closeout`: 실제 확인한 import 그래프, 테스트 결과, 남은 PR 범위 리스크를 `/work`에 기록했습니다.

## 변경 이유
- 최신 남은 리스크는 `src/components/planning/workspace/*` 분리 파일 다수가 비추적 상태라 실제 PR 범위에 모두 포함해야 하는지 불명확하다는 점입니다.
- 전체 stage를 피하려면 workspace 분리 묶음이 엔트리에서 모두 도달 가능한지, 어떤 테스트가 이를 뒷받침하는지 먼저 확인해야 합니다.

## 핵심 변경
- 코드 파일은 수정하지 않고 PR 후보 범위 증거를 정리했습니다.
- 읽기 전용 Node import 그래프 확인 결과, `src/components/PlanningWorkspaceClient.tsx`에서 workspace 내부 18개 파일이 모두 도달 가능했고 고아 파일은 없었습니다.
- workspace 단위 테스트 6개를 실행해 helper/hook/type 계약 19개 테스트가 통과했습니다.
- 직전 라운드의 `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm release:verify` 통과 결과와 함께 workspace 분리 묶음을 PR 후보로 볼 근거가 강화됐습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git status --short --untracked-files=all -- src/components/planning/workspace src/components/PlanningWorkspaceClient.tsx tests/planning/ui tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts work/5/25` 실행: workspace 관련 비추적/수정 파일 확인
- 읽기 전용 Node import 그래프 확인 실행: workspace files=18, reachable from `PlanningWorkspaceClient.tsx`=18, not reached from entry=0
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts` 통과: 6 files / 19 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node scripts/worktree_scope.mjs src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts tests/e2e/planning-v2-fast.spec.ts tests/e2e/flow-history-to-report.spec.ts work/5/25/2026-05-25-workspace-pr-scope-map.md` 실행: 전체 196 / 범위 내 28 / 범위 밖 168

## 남은 리스크
- 현재 전체 worktree에는 workspace 후보 밖 변경이 많이 남아 있으므로 전체 stage는 여전히 위험합니다.
- workspace 분리 묶음은 엔트리에서 모두 도달 가능하지만, `src/components/PlanningWorkspaceClient.tsx`의 추적 diff와 함께 묶어 stage해야 import가 깨지지 않습니다.
- 이번 확인은 import 도달성과 기존 단위 테스트 기준입니다. UI 구조 변경의 최종 사용자 흐름은 직전 `pnpm e2e:rc`와 `pnpm release:verify` 통과 결과를 함께 봐야 합니다.

## 다음 라운드
- workspace 후보 묶음 28개 중 실제 커밋에 포함할 `/work` note 범위를 별도로 정합니다.
- 그 밖의 대규모 변경은 기능별로 별도 후보 묶음으로 나누어 stage 가능성을 판단합니다.
