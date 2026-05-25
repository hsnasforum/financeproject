# 2026-05-25 release verify hydration race

## 변경 파일
- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/planning/workspace/panels/profilePanel.tsx`
- `work/5/25/2026-05-25-release-verify-hydration-race.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 planning UI와 release 검증, `/work` closeout이 함께 필요함을 분류했습니다.
- `planning-gate-selector`: 프로필 편집 UI 회귀에 필요한 unit/e2e와 release gate 검증 세트를 고르는 데 사용했습니다.
- `route-ssot-check`: 같은 release verify 범위에서 planning route/deep link/SSOT 검증이 포함되는지 확인하는 데 사용했습니다.
- `work-log-closeout`: 실제 실행한 명령과 남은 리스크를 `/work` 기록으로 남기는 데 사용했습니다.

## 변경 이유
- `pnpm release:verify`의 `planning:v2:e2e:full` 단계에서 `/planning keeps unsaved profile edits while preparing a new profile` 시나리오가 실패했습니다.
- 실패 내용은 사용자가 월 실수령을 `5,300,000`으로 입력한 직후 늦게 도착한 selected profile hydration이 기존 값 `4,100,000`으로 되돌리는 회귀였습니다.

## 핵심 변경
- 프로필 번들에 `markProfileEditorLocalEdit` 액션을 추가해 편집 영역 focus 시점부터 로컬 편집 의도를 기록합니다.
- 실제 프로필 선택 변경은 기존처럼 로컬 편집 플래그를 초기화해 선택 전환 hydration은 계속 허용합니다.
- 프로필 패널의 이름, 현금흐름, 자산, 부채, 목표, JSON 편집 영역에 focus capture를 연결했습니다.
- 폼 값 변경, JSON 반영, 샘플 로드 같은 기존 로컬 편집 경로도 같은 플래그를 사용하도록 정리했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint src/components/planning/workspace/useWorkspaceProfileBundle.ts src/components/planning/workspace/usePlanningWorkspaceController.tsx src/components/planning/workspace/panels/profilePanel.tsx` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceGroups.test.ts` 통과: 2 files / 7 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts --grep "keeps unsaved profile edits" --workers=1 --repeat-each=3 --reporter=line` 통과: 3 passed
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:v2:complete` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm release:verify` 통과

## 남은 리스크
- 현재 저장소에는 이번 수정 외의 추적/비추적 변경이 많이 섞여 있습니다. PR 전에는 포함 범위를 명시적으로 고른 뒤 stage해야 합니다.
- `release:verify`는 통과했지만 `planning:v2:freeze:guard`는 core 변경 감지를 informational WARN으로 출력했습니다. PR 제목이나 커밋 메시지에는 `[v2-core-change]` 태그가 필요할 수 있습니다.
- focus만 하고 실제 입력하지 않은 경우에도 늦은 같은 프로필 hydration은 막힙니다. 사용자가 로딩 중 편집 영역에 들어간 상태에서 원격 최신값을 자동 반영하지 않는 보수적 선택입니다.

## 다음 라운드
- 현재 비추적 상태의 workspace 분리 컴포넌트 3개가 실제 PR 범위에 들어갈지 확인합니다.
- PR 후보 범위를 확정한 뒤 `node scripts/worktree_scope.mjs <후보 파일들>`로 사용자 기존 변경과 섞이지 않는지 재점검합니다.
