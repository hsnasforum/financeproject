# 2026-05-25 static guard route inventory 정리

## 변경 파일
- `scripts/planning_v2_static_guard.mjs`
- `work/5/25/2026-05-25-static-guard-route-inventory.md`

## 사용 skill
- `finance-skill-routing`: 이전 `/work`의 잔여 warning 중 planning v2 static guard 쪽을 다음 품질 개선 범위로 선택하기 위해 사용
- `planning-gate-selector`: guard 스크립트 변경에 맞춰 `node --check`, `planning:v2:guard`, `planning:v2:complete`, `planning:v2:regress` 검증을 선택하기 위해 사용
- `route-ssot-check`: `/fonts`가 public route가 아니라 App Router 아래 정적 자산 폴더인지 확인하고, 문서 route inventory에 추가하지 않는 판단에 사용
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크를 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- `pnpm planning:v2:guard`가 실제 route가 아닌 `src/app/fonts/PretendardVariable.woff2` 정적 자산 폴더를 top-level route root로 세어 `ROUTE_INVENTORY_MISSING_TOP_LEVEL /fonts` 경고를 냈습니다.
- `/fonts`는 사용자 경로도 API 경로도 아니므로 `docs/routes-inventory.md`에 route로 추가하면 문서 기준이 오히려 흐려집니다.

## 핵심 변경
- static guard의 top-level route root 수집 전에 해당 디렉터리에 `page.*` 또는 `route.*` App Router 표면이 실제로 있는지 재귀 확인하도록 했습니다.
- asset-only 디렉터리인 `src/app/fonts`는 route inventory 비교 대상에서 제외됩니다.
- `docs/current-screens.md`와 `docs/routes-inventory.md`는 실제 route 계약이 바뀌지 않아 수정하지 않았습니다.
- `[v2-core-change]` 태그 메시지는 정책상 커밋/PR 제목 가시성 권고이므로 코드로 숨기지 않고 남은 운영 알림으로 유지했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node --check scripts/planning_v2_static_guard.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:v2:guard` 통과: warning 없음
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- scripts/planning_v2_static_guard.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:v2:complete` 통과: fast e2e 6 tests 포함
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:v2:regress` 통과: regression 9 cases + full e2e 8 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm lint` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test` 통과: 653 files / 2016 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:ssot:check` 통과: 5 files / 9 tests

## 남은 리스크
- `planning:v2:complete`는 여전히 `[v2-core-change]` 태그 부재를 정보성으로 출력합니다. 이는 현 커밋/PR 제목에 태그가 없다는 정책 알림이며 종료코드는 0입니다.
- 현재 worktree에는 이번 라운드 밖의 대규모 기존 변경과 untracked 파일이 많습니다. PR 전 포함 범위와 `[v2-core-change]` 태그 필요 여부를 정리해야 합니다.
