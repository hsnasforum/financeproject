# 2026-05-25 WSL dev launcher stage 범위 확정

## 변경 파일
- `docs/planning-v2-setup-playbook.md`
- `docs/windows.md`
- `scripts/next_dev_safe.mjs`
- `tests/next-dev-safe-bridge-status.test.ts`
- `work/5/25/2026-05-25-wsl-localhost-bridge-skip.md`
- `work/5/25/2026-05-25-wsl-dev-launcher-stage-scope.md`

## 사용 skill
- `planning-gate-selector`: WSL dev launcher 후보가 Next dev wrapper, 테스트, 운영 문서만 포함하는지 확인하고 stage 전 확인 게이트를 좁히는 데 사용했습니다.
- `work-log-closeout`: staged 파일 목록, 범위 밖 변경, 실제 확인 결과를 `/work`에 남기는 데 사용했습니다.

## 변경 이유
- dirty worktree가 총 265개 변경으로 커져 전체 stage가 위험한 상태입니다.
- WSL localhost bridge skip 처리는 독립 후보로 분리 가능하므로 먼저 stage 범위를 고정했습니다.
- staged 파일이 범위 밖 변경과 섞이지 않았는지 추후 PR 작업자가 바로 확인할 수 있어야 합니다.

## 핵심 변경
- `scripts/worktree_scope.mjs` 기준 WSL dev launcher 후보의 범위 내 변경 5개, 범위 밖 변경 260개를 확인했습니다.
- `git diff --check -- ...`로 후보 파일 공백 검사를 통과했습니다.
- `git add -- ...`로 WSL dev launcher 후보 5개 파일만 stage했습니다.
- staged diff에는 `docs/planning-v2-setup-playbook.md`, `docs/windows.md`, `scripts/next_dev_safe.mjs`, `tests/next-dev-safe-bridge-status.test.ts`, `work/5/25/2026-05-25-wsl-localhost-bridge-skip.md`만 포함된 것을 확인했습니다.
- 이후 이 stage 기록 파일도 같은 후보에 포함해 staged 파일을 6개로 확정했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --cached --name-only` 실행: stage 전 비어 있음 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/worktree_scope.mjs scripts/next_dev_safe.mjs tests/next-dev-safe-bridge-status.test.ts docs/windows.md docs/planning-v2-setup-playbook.md work/5/25/2026-05-25-wsl-localhost-bridge-skip.md` 통과: 전체 265, 범위 내 5, 범위 밖 260
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- scripts/next_dev_safe.mjs tests/next-dev-safe-bridge-status.test.ts docs/windows.md docs/planning-v2-setup-playbook.md work/5/25/2026-05-25-wsl-localhost-bridge-skip.md` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git add -- scripts/next_dev_safe.mjs tests/next-dev-safe-bridge-status.test.ts docs/windows.md docs/planning-v2-setup-playbook.md work/5/25/2026-05-25-wsl-localhost-bridge-skip.md` 실행
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --cached --name-only` 실행: staged 파일 5개 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --cached --check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git status --short -- scripts/next_dev_safe.mjs tests/next-dev-safe-bridge-status.test.ts docs/windows.md docs/planning-v2-setup-playbook.md work/5/25/2026-05-25-wsl-localhost-bridge-skip.md` 실행: 4개 수정, 1개 추가가 staged 상태
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git add -- work/5/25/2026-05-25-wsl-dev-launcher-stage-scope.md` 실행
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --cached --name-only` 실행: staged 파일 6개 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard` 통과: latestWorkNote tracked

## 남은 리스크
- staged 후보 밖 변경은 여전히 260개 남아 있어, 다음 후보를 stage하기 전에도 반드시 pathspec 기반 scope 확인이 필요합니다.
- WSL에서 `powershell.exe`가 실제로 사용 가능한 환경의 bridge ready 경로는 이번 환경에서 재현하지 못했습니다.
- 이번 staged 후보는 dev launcher와 운영 문서 범위이므로 데이터 소스나 planning UI 변경과 한 커밋에 섞지 않는 것이 안전합니다.

## 다음 라운드
- 다음 후보는 `data-freshness-public-sources`로 두고, snapshot/generated report와 코드/test/doc 포함 범위를 먼저 나눕니다.
- 실제 커밋 또는 PR 생성 전에는 staged 상태에서 focused test와 `git diff --cached --check`를 다시 확인합니다.
