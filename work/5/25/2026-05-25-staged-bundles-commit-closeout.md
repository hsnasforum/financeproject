# 2026-05-25 staged bundles commit closeout

## 변경 파일
- `work/5/25/2026-05-25-staged-bundles-commit-closeout.md`

## 사용 skill
- `dart-data-source-hardening`: 데이터 소스 후보의 freshness, FINLIFE, MOLIT fallback, 부분 실패 리스크가 분리 커밋으로 유지되는지 확인했습니다.
- `planning-gate-selector`: WSL dev launcher와 데이터 소스 후보의 검증 범위를 분리해 focused gate와 e2e:data-sources 근거를 정리했습니다.
- `work-log-closeout`: 실제 생성한 커밋, stage 상태, 다음 후보 리스크를 `/work` 기록으로 남겼습니다.

## 변경 이유
- WSL dev launcher와 데이터 소스 후보가 staged 상태로 남아 있으면 다음 후보를 stage할 때 기능이 섞일 수 있습니다.
- 이미 focused 검증이 끝난 두 묶음은 독립 커밋으로 분리해 stage를 비우는 편이 후속 PR 분리에 안전합니다.

## 핵심 변경
- `a9d76ef Handle missing Windows PowerShell bridge` 커밋을 생성했습니다.
- `797942b Harden public data source freshness` 커밋을 생성했습니다.
- 두 커밋 이후 `git diff --cached --name-only` 결과가 비어 있어 stage가 정리된 상태를 확인했습니다.
- 전체 dirty worktree는 아직 226개 변경이 남아 있으며, 다음 후보는 `data-source-ui-runtime` 또는 다른 UI/runtime 묶음으로 분리해야 합니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --cached --check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 node --check scripts/next_dev_safe.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/next-dev-safe-bridge-status.test.ts` 통과: 1 file, 4 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/next_dev_safe.mjs tests/next-dev-safe-bridge-status.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git commit -m "Handle missing Windows PowerShell bridge"` 통과: `a9d76ef`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/worktree_scope.mjs .data .env.example docs/api-utilization-draft.md docs/data-freshness-report.md docs/finlife-sync.md docs/schema-baselines.json docs/schema-drift-report.md scripts/data_freshness_report.mjs scripts/finlife_cli_common.mjs scripts/finlife_probe_groups.mjs scripts/finlife_probe_groups.ts scripts/finlife_sync.mjs scripts/smoke/public-apis-sample.mjs scripts/warm_if_stale.mjs src/lib/finlife/probeGroups.ts src/lib/publicApis/providers/housing.ts tests/data-freshness-report.test.ts tests/finlife-cli-diag-retry.test.ts tests/finlife-probe-aggregate.test.ts tests/finlife-sync-groups.test.ts tests/housing-provider.test.ts tests/public-apis-sample-molit.test.ts tests/warm-if-stale-env.test.ts work/5/25/2026-05-25-data-freshness-snapshot-refresh.md work/5/25/2026-05-25-housing-finlife-data-source-hardening.md work/5/25/2026-05-25-finlife-probe-timeout-hardening.md work/5/25/2026-05-25-finlife-probe-entrypoint-cleanup.md work/5/25/2026-05-25-data-source-stage-scope.md` 통과: 전체 261, 범위 내 35, 범위 밖 226
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git add -- .data .env.example docs/api-utilization-draft.md docs/data-freshness-report.md docs/finlife-sync.md docs/schema-baselines.json docs/schema-drift-report.md scripts/data_freshness_report.mjs scripts/finlife_cli_common.mjs scripts/finlife_probe_groups.mjs scripts/finlife_probe_groups.ts scripts/finlife_sync.mjs scripts/smoke/public-apis-sample.mjs scripts/warm_if_stale.mjs src/lib/finlife/probeGroups.ts src/lib/publicApis/providers/housing.ts tests/data-freshness-report.test.ts tests/finlife-cli-diag-retry.test.ts tests/finlife-probe-aggregate.test.ts tests/finlife-sync-groups.test.ts tests/housing-provider.test.ts tests/public-apis-sample-molit.test.ts tests/warm-if-stale-env.test.ts work/5/25/2026-05-25-data-freshness-snapshot-refresh.md work/5/25/2026-05-25-housing-finlife-data-source-hardening.md work/5/25/2026-05-25-finlife-probe-timeout-hardening.md work/5/25/2026-05-25-finlife-probe-entrypoint-cleanup.md work/5/25/2026-05-25-data-source-stage-scope.md` 실행
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --cached --check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git commit -m "Harden public data source freshness"` 통과: `797942b`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --cached --name-only` 실행: 결과 없음
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git log -2 --oneline` 실행: `797942b`, `a9d76ef` 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh -lc 'git status --short --untracked-files=all | wc -l'` 실행: 226

## 남은 리스크
- 전체 dirty worktree는 아직 226개 변경이 남아 있습니다. 전체 stage는 여전히 위험합니다.
- `data-source-ui-runtime` 후보에는 DataSource UI hydrate/ping, KDB status fallback, CSP-safe progress bar 변경이 섞여 있어 별도 scope 확인이 필요합니다.
- `docs/dart-rules-quality-report.md`는 generated report로 남아 있으며, 다음 full `verify` 또는 release gate에서 포함 여부를 다시 판단해야 합니다.
- 두 커밋은 로컬 커밋이며 아직 push 또는 PR 생성은 하지 않았습니다.

## 다음 라운드
- `data-source-ui-runtime` 후보의 pathspec을 확정하고, `worktree:scope`, focused test, e2e:data-sources 또는 CSP smoke 필요 여부를 판단합니다.
- 남은 planning workspace/report/UI 후보는 data-source UI 후보와 파일 충돌이 없는지 먼저 분리합니다.
- 커밋 단위가 PR 의도와 맞는지 확인한 뒤 필요하면 branch push 또는 PR 생성을 진행합니다.
