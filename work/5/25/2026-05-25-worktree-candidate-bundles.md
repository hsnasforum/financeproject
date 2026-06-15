# 2026-05-25 worktree 후보 묶음 분류

## 변경 파일
- `work/5/25/2026-05-25-worktree-candidate-bundles.md`

## 사용 skill
- `planning-gate-selector`: 변경 파일을 planning, route/build, UI, DART/data-source, ops, release/docs 성격별 검증 묶음으로 나누는 기준으로 사용했습니다.
- `work-log-closeout`: 실제 실행한 분류 명령과 남은 stage 리스크를 `/work`에 기록했습니다.

## 변경 이유
- 현재 전체 worktree 변경이 196개까지 늘어 전체 stage가 위험합니다.
- workspace 후보 묶음은 확인됐지만, 나머지 대규모 변경도 기능별로 나누어야 PR 또는 후속 검증 단위를 정할 수 있습니다.

## 핵심 변경
- 코드 파일은 수정하지 않고 현재 worktree 변경을 기능별 후보 묶음으로 분류했습니다.
- 전체 196개 변경을 12개 후보 묶음에 모두 배정했고 미분류는 0개입니다.
- 주요 중복 분류는 42개이며, 대부분 planning 보고서/v3/workspace 파일이 `planning-core-other`와 겹치는 자연스러운 중복입니다.
- `DebugUnifiedClient.tsx`와 `PlanningRunsClient.tsx`는 `CspSafeProgressBar` 적용 diff라 `csp-style-runtime` 묶음으로 분류했습니다.
- `scripts/worktree_scope.mjs`는 `package.json`의 `worktree:scope` 스크립트와 연결된 repo ops helper로 확인했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git status --short --untracked-files=all` 실행: 전체 변경 목록 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- sh -lc 'git status --short --untracked-files=all | wc -l && git diff --name-only | wc -l && git ls-files --others --exclude-standard | wc -l'` 실행: 전체 196 / 추적 diff 113 / 비추적 83
- 읽기 전용 Node 분류 스크립트 실행: assigned=196, unmatched=0, overlaps=42
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff -- src/components/DebugUnifiedClient.tsx src/components/PlanningRunsClient.tsx scripts/worktree_scope.mjs` 실행: 미분류 후보였던 3개 파일의 성격 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node -e "const p=require('./package.json'); console.log((p.scripts && p.scripts['worktree:scope']) || 'NO_SCRIPT')"` 실행: `node scripts/worktree_scope.mjs`

## 후보 묶음
- `workspace-refactor`: 27개. planning workspace 분리, 관련 unit/e2e.
- `report-export-deeplink`: 14개. report export HTML, report dashboard 분리, compare/recommend deep link.
- `csp-style-runtime`: 17개. CSP-safe progress, browser helpers, font/layout/style/UI primitives, smoke CSP.
- `dev-security-runtime`: 36개. dev API guards, security scan, middleware/config, dev/local request tests.
- `ops-ui`: 10개. ops dashboard/metrics 컴포넌트 분리와 UI tests.
- `planner-wizard-home-recommend-ui`: 13개. planner wizard, home, recommend/recovery/help UI.
- `planning-v3-news-transactions`: 20개. planning v3 news/settings/transactions/balances/batches와 관련 tests.
- `data-sources-dart-public`: 10개. data source, DART/public data, datago, settings e2e.
- `planning-core-other`: 9개. planning v2 scripts, quickstart, mini charts, shared planning helper.
- `repo-ops-scope-helper`: 2개. `worktree_scope` helper와 `work/README.md`.
- `docs-work-guidedoc`: 35개. `/work` 기록과 guidedoc Zone.Identifier 삭제 항목.
- `repo-config`: 3개. `.gitignore`, `tsconfig.json`, `tsconfig.playwright.json`.

## 남은 리스크
- 후보 묶음은 경로 기준 1차 분류입니다. 실제 stage 전에는 각 묶음별 `worktree:scope`와 해당 게이트를 다시 실행해야 합니다.
- `docs-work-guidedoc`에는 Windows `Zone.Identifier` 삭제가 포함되어 있어 실제 삭제 의도를 별도로 확인해야 합니다.
- `dev-security-runtime`, `csp-style-runtime`, `repo-config`는 서로 영향을 줄 수 있어 분리 PR로 만들 경우 build/lint/security gate를 각각 다시 봐야 합니다.
- `report-export-deeplink`, `workspace-refactor`, `planning-core-other`는 planning v2 사용자 흐름에서 겹치므로 너무 잘게 나누면 e2e 근거가 약해질 수 있습니다.

## 다음 라운드
- 우선순위 1: `report-export-deeplink`와 `workspace-refactor`를 한 PR 후보로 묶을지, 별도 후보로 둘지 diff 의존성을 확인합니다.
- 우선순위 2: `csp-style-runtime`과 `dev-security-runtime`의 공유 파일 영향을 분리해 stage 가능한 최소 보안 묶음을 정합니다.
- 우선순위 3: `docs-work-guidedoc`에서 실제로 포함할 `/work` note와 제외해야 할 Zone.Identifier 삭제를 구분합니다.
