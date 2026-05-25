# 2026-05-25 package tooling stage

## 변경 파일
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `tsconfig.playwright.json`
- `scripts/worktree_scope.mjs`
- `work/README.md`
- `work/5/25/2026-05-25-package-tooling-stage.md`

## 사용 skill
- `planning-gate-selector`: package/tooling 변경에 맞춰 diff, script syntax/lint, lockfile, `sec:check`, typecheck 검증을 선택했습니다.
- `work-log-closeout`: 실제 scope와 실행한 명령, 남은 분리 후보를 기록했습니다.

## 변경 이유
- security route scan과 worktree scope 확인을 package script로 연결해 반복 stage 작업에서 같은 기준을 쓰기 위함입니다.
- CSP/runtime 변경에 맞춰 framer-motion 의존성을 제거하고 Next/ESLint/Prisma/Vitest 계열 lockfile을 현재 설치 상태와 맞췄습니다.
- `tmp/**` 타입 스캔 제외로 임시 산출물이 typecheck에 끼어드는 위험을 줄입니다.

## 핵심 변경
- `sec:check`가 `security_check.mjs`와 `security_route_guard_scan.mjs`를 함께 실행합니다.
- `sec:scan:routes`, `worktree:scope` script를 추가했습니다.
- `verify`에 `pnpm sec:check`를 포함했습니다.
- `planning:v2:e2e:full`은 workers=1로 고정해 공유 상태 e2e의 경쟁을 줄였습니다.
- package/lock을 Next 16.2.3, Prisma 7.7.0, Vitest 4.1.4 등 현재 검증된 버전으로 맞췄습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/worktree_scope.mjs package.json pnpm-lock.yaml tsconfig.json tsconfig.playwright.json scripts/worktree_scope.mjs work/README.md` 통과: 전체 변경 133, 범위 내 6, 범위 밖 127
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- package.json pnpm-lock.yaml tsconfig.json tsconfig.playwright.json scripts/worktree_scope.mjs work/README.md` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node --check scripts/worktree_scope.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/worktree_scope.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm worktree:scope -- package.json pnpm-lock.yaml tsconfig.json tsconfig.playwright.json scripts/worktree_scope.mjs work/README.md` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm sec:check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm install --frozen-lockfile --ignore-scripts` 통과: lockfile up to date
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm typecheck` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 현재 worktree 기준 재실행 통과: 254 pages 생성. 이 라운드 전 같은 package/lock 상태에서 통과한 build 근거입니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --cached --check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard` 통과: `latestWorkNote=work/5/25/2026-05-25-package-tooling-stage.md`

## 남은 리스크
- package/lock 변경은 넓은 의존성 업데이트를 포함합니다. focused 검증과 build/typecheck는 통과했지만 PR 최종 전 전체 `pnpm test`와 `pnpm lint`를 다시 묶는 편이 안전합니다.
- 현재 worktree에는 범위 밖 변경 127개가 남아 있습니다.

## 다음 라운드
- planning workspace refactor 후보 또는 planning v3 news/transaction 후보를 다음 pathspec 묶음으로 분리합니다.
- 남은 `/work` 과거 메모와 guidedoc Zone.Identifier 삭제는 별도 docs/cleanup 후보로 처리합니다.
