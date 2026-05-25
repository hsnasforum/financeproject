# 2026-05-25 worktree 범위 감사

## 변경 파일
- `work/5/25/2026-05-25-worktree-scope-audit.md`

## 사용 skill
- `finance-skill-routing`: 검증 완료 뒤 남은 리스크를 worktree 범위 정리로 좁히기 위해 사용
- `work-log-closeout`: 실제 확인한 상태와 남은 PR 범위 리스크를 `/work`에 기록하기 위해 사용

## 변경 이유
- 현재 저장소에는 이번 라운드 변경 외의 추적/비추적 변경이 많이 섞여 있습니다.
- 자동 stage나 PR 생성 전에 포함 범위를 구분하지 않으면 사용자 기존 변경까지 함께 포함할 수 있습니다.

## 핵심 변경
- 코드나 설정 파일은 추가 수정하지 않고, 현재 worktree 범위를 감사 기록으로만 남겼습니다.
- `git status --short` 기준 전체 status 항목은 140개입니다.
- `git status --short --untracked-files=all` 기준 전체 status 항목은 193개입니다. 일반 status는 untracked 디렉터리를 접어서 보여 주므로 세부 파일 수와 차이가 납니다.
- `git diff --name-only` 기준 추적 파일 변경은 113개입니다.
- `git ls-files --others --exclude-standard` 기준 비추적 파일은 79개입니다.
- 이번 작업에서 직접 다룬 후보 범위는 `scripts/planning_v2_static_guard.mjs`, `tests/e2e/flow-history-to-report.spec.ts`, `work/5/25/2026-05-25-report-deeplink-e2e.md`, `work/5/25/2026-05-25-static-guard-route-inventory.md`, `work/5/25/2026-05-25-worktree-scope-audit.md` 5개입니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git status --short` 실행: 대규모 dirty worktree 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --name-only` 실행: 추적 파일 변경 113개 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git ls-files --others --exclude-standard` 실행: 비추적 파일 79개 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- sh -lc 'git status --porcelain | wc -l'` 실행: 140
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- sh -lc 'git diff --name-only | wc -l'` 실행: 113
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- sh -lc 'git ls-files --others --exclude-standard | wc -l'` 실행: 79
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node scripts/worktree_scope.mjs tests/e2e/flow-history-to-report.spec.ts scripts/planning_v2_static_guard.mjs work/5/25/2026-05-25-report-deeplink-e2e.md work/5/25/2026-05-25-static-guard-route-inventory.md work/5/25/2026-05-25-worktree-scope-audit.md` 실행: 전체 193 / 범위 내 5 / 범위 밖 188
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm release:verify` 실패: `multi-agent:guard`가 최신 `/work` note의 `## 다음 라운드` 누락을 지적
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard` 통과

## 남은 리스크
- PR 전에는 포함할 변경 묶음을 명시적으로 고른 뒤 stage해야 합니다. 현재 상태에서 전체 stage는 위험합니다.
- `guidedoc/*.Zone.Identifier` 삭제 항목은 Windows alternate data stream 잔여물로 보이지만, 실제 삭제 의도는 확인되지 않았습니다.
- 기존 untracked 컴포넌트 분리 파일과 4월 `/work` 기록이 많아, 변경 이력 소유권 확인 없이 정리하거나 삭제하면 안 됩니다.

## 다음 라운드
- `pnpm release:verify`가 `multi-agent:guard`에서 멈춘 원인을 재확인하고, 최신 `/work` note 형식 보강 후 `pnpm multi-agent:guard`부터 다시 실행합니다.
- 그 다음 `pnpm release:verify`를 재실행해 release primary gate 통과 여부를 최신 증거로 남깁니다.
