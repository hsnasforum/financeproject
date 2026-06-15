# 2026-04-12 worktree scope helper 추가

## 변경 파일
- `scripts/worktree_scope.mjs`
- `package.json`
- `work/README.md`

## 사용 skill
- `work-log-closeout`: 오늘 운영 helper 추가 라운드의 변경 파일, 검증, 잔여 리스크를 표준 형식으로 정리

## 변경 이유
- 현재 worktree에는 이번 라운드 변경과 무관한 tracked/untracked 변경이 계속 남아 있어, 배치별 범위 확인을 매번 수동으로 하기가 번거로웠습니다.
- 기존 변경을 건드리거나 stash하지 않고도 “이번 라운드 범위”와 “범위 밖 변경”을 바로 분리해 볼 수 있는 로컬 helper가 필요했습니다.

## 핵심 변경
- `scripts/worktree_scope.mjs`를 추가해 현재 `git status --short` 결과를 기준으로 범위 내 변경과 범위 밖 변경을 분리 출력하도록 했습니다.
- `package.json`에 `pnpm worktree:scope -- <paths...>` 실행 엔트리를 추가했습니다.
- `work/README.md` 작성 원칙에 unrelated 변경이 남아 있을 때 이 helper를 먼저 쓰도록 한 줄 가이드를 추가했습니다.
- 기존 사용자 변경이나 unrelated 파일은 건드리지 않았고, 운영상 시야를 분리하는 장치만 추가했습니다.

## 검증
- `sed -n '1,220p' work/4/12/2026-04-12-tmp-build-input-risk-closeout.md`
- `git status --short`
- `rg -n "git status|worktree|scoped|scope.*diff|unrelated 변경|범위 분리|git diff --check|status --short" docs scripts package.json work . -g '!node_modules'`
- `sed -n '1,240p' package.json`
- `sed -n '1,220p' work/README.md`
- `pnpm exec eslint scripts/worktree_scope.mjs`
  - PASS
- `pnpm worktree:scope -- tsconfig.json tsconfig.playwright.json work/4/12/2026-04-12-tmp-build-input-risk-closeout.md`
  - PASS, 범위 내 3 / 범위 밖 85로 현재 worktree를 분리 출력
- `git diff --check -- scripts/worktree_scope.mjs package.json work/README.md`
  - PASS

## 남은 리스크
- 이번 라운드로 unrelated 변경 자체가 사라진 것은 아니고, 그 변경을 안전하게 분리해서 보는 운영 장치를 추가한 상태입니다.
- tracked 변경을 실제로 정리하거나 분리 커밋하는 일은 사용자 의도와 충돌할 수 있어 이번 범위에 포함하지 않았습니다.
- 이후 라운드에서는 시작 시 `pnpm worktree:scope -- <이번 범위 경로...>`를 먼저 실행하면 범위 관리 리스크를 크게 줄일 수 있습니다.
