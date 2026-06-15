# 2026-05-25 PR 기본 게이트 보강

## 변경 파일
- `work/5/25/2026-05-25-pr-basic-gates-followup.md`

## 사용 skill
- `planning-gate-selector`: 최신 hydration 수정 이후 PR 전 기본 검증에서 빠진 `lint`, `build`, `e2e:rc`를 보강 대상으로 선정했습니다.
- `work-log-closeout`: 실제 실행한 검증 결과와 남은 PR 범위 리스크를 `/work`에 기록했습니다.

## 변경 이유
- 직전 라운드에서 `pnpm release:verify`는 통과했지만, release verify 스크립트는 별도 `pnpm lint`, `pnpm build`, 일반 `pnpm e2e:rc`를 모두 포함하지 않습니다.
- planning workspace UI와 e2e 시나리오가 바뀐 상태이므로 PR 전 기본 검증 기준을 최신 변경 기준으로 다시 맞출 필요가 있었습니다.

## 핵심 변경
- 코드 파일은 수정하지 않고 검증만 추가로 수행했습니다.
- `pnpm lint`로 React/TS/스크립트 lint 전체를 재확인했습니다.
- `pnpm build`로 Next production build와 타입 검사를 재확인했습니다.
- `pnpm e2e:rc`로 DART, data source, planning history/report, quickstart, smoke/CSP 흐름을 재확인했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm lint` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm e2e:rc` 통과: 24 passed

## 남은 리스크
- 현재 worktree에는 이번 후보 범위 밖 변경이 계속 많이 남아 있습니다. 전체 stage는 여전히 위험합니다.
- `src/components/planning/workspace/*` 분리 파일 다수가 비추적 상태입니다. 실제 PR 범위에 포함할 파일 목록을 확정해야 합니다.
- `pnpm e2e:rc` 중 `housing:sales` 외부 upstream 404 로그가 있었지만 테스트는 통과했습니다. 외부 데이터 소스 안정성 라운드가 따로 필요할 수 있습니다.

## 다음 라운드
- PR 후보 파일 목록을 기능 묶음별로 나누어 `worktree_scope` 기준 범위 밖 변경을 줄입니다.
- 비추적 workspace 분리 파일이 모두 import 경로에 필요한지 확인하고, 필요 없는 파일은 소유권 확인 뒤 별도 정리합니다.
