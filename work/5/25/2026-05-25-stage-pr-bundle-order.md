# 2026-05-25 stage PR 후보 순서 정리

## 변경 파일
- `work/5/25/2026-05-25-stage-pr-bundle-order.md`

## 사용 skill
- `planning-gate-selector`: 현재 변경을 데이터 소스, Next 런타임, 보안, planning UI, 문서 전용 묶음으로 나누고 각 묶음의 최소 검증 방향을 정하는 데 사용했습니다.
- `work-log-closeout`: 실제 확인한 명령, 후보 묶음, 남은 리스크를 `/work` 형식으로 남기는 데 사용했습니다.

## 변경 이유
- 현재 dirty worktree는 추적 변경 154개, 비추적 변경 110개, 총 264개로 전체 stage가 위험합니다.
- 이미 통과한 `verify`와 `build` 결과를 유지하려면 기능별 PR 후보를 나누고, 공유 파일이 많은 묶음의 선후 관계를 먼저 고정해야 합니다.
- 직전 후보 문서는 전체 196개 기준이라 WSL bridge, 데이터 소스 refresh, 신규 `/work` 기록이 반영된 최신 순서가 필요했습니다.

## 핵심 변경
- 코드 파일은 수정하지 않고 최신 `git status` 기준 PR 후보 순서를 정리했습니다.
- 기존 12개 후보 묶음을 13개 운영 후보로 재정리하고, WSL dev launcher 묶음을 독립 후보로 분리했습니다.
- 1차 미분류였던 `src/components/PlanningReportsDashboardClient.tsx`는 report/export 묶음, 삭제된 `src/lib/finlife/probeGroups.ts`는 data-source cleanup 묶음으로 배정했습니다.
- `data-freshness-public-sources`, `wsl-dev-launcher-runtime`, `standalone-runtime-assets`는 최근 검증 근거가 강해 우선 PR 후보로 둘 수 있습니다.
- `planning-workspace-refactor`, `report-export-deeplink`, `planning-core-other`는 planning 사용자 흐름에서 겹치므로 stage 전 파일 겹침을 다시 확인해야 합니다.

## 후보 순서
- 1순위 `wsl-dev-launcher-runtime`: `scripts/next_dev_safe.mjs`, bridge status test, Windows 실행 문서. 이미 focused test, lint, typecheck, smoke, verify, build 통과.
- 2순위 `data-freshness-public-sources`: `.data` snapshot, freshness report, FINLIFE/MOLIT fallback, env/doc/test. 이미 focused tests, data-source e2e, verify, build 통과.
- 3순위 `standalone-runtime-assets`: standalone runtime asset copy, print JS, prod/start helper, runtime doc/test. 이전 standalone smoke와 build 근거가 있음.
- 4순위 `dev-security-runtime`: dev API guard, middleware/config, route guard scan, security docs/report. route/security gate와 build를 함께 묶어야 함.
- 5순위 `csp-style-runtime`: CSP-safe progress, browser helper, font/layout/style primitives. UI smoke와 lint/build 근거가 필요함.
- 6순위 `planning-workspace-refactor`: planning workspace controller/panel 분리와 관련 unit/e2e. workspace 단위 파일을 빠뜨리면 import가 깨짐.
- 7순위 `report-export-deeplink`: report dashboard/export/deeplink와 print asset. planning report e2e 또는 export route focused test와 묶어야 함.
- 8순위 `planning-v3-news-transactions`: v3 news/settings/transactions/balances/batches 분리. v3 API/UI tests를 기준으로 별도 PR 후보.
- 9순위 `ops-ui`: ops dashboard/metrics 컴포넌트 분리와 UI tests. 독립 UI PR 후보.
- 10순위 `planner-home-recommend-ui`: planner wizard, home/recommend/recovery/help UI. 시각 변경 범위가 넓어 별도 UI 검증 필요.
- 11순위 `planning-core-other`: planning v2 guard/regression scripts, mini charts, shared planning helper. 위 planning 묶음과 파일 충돌을 정리한 뒤 stage.
- 12순위 `repo-config-scope-helper`: `worktree:scope`, package/lock, tsconfig/gitignore/work README. 다른 묶음에서 필요한 스크립트 의존성을 먼저 확인.
- 13순위 `docs-work-guidedoc`: `/work` 기록과 guidedoc `Zone.Identifier` 삭제. 코드 PR에 섞지 말고 문서/청소 PR로 분리.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sed -n '1,220p' work/5/25/2026-05-25-wsl-localhost-bridge-skip.md` 실행: 최신 `/work` 기록 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sed -n '1,240p' work/5/25/2026-05-25-worktree-candidate-bundles.md` 실행: 기존 후보 분류 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sed -n '1,260p' scripts/worktree_scope.mjs` 실행: scope helper 동작 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git status --short` 실행: dirty worktree 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --name-only` 실행: 추적 diff 154개 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git ls-files --others --exclude-standard` 실행: 비추적 110개 확인
- PowerShell here-string으로 읽기 전용 Node 분류 실행: total 264, tracked 154, untracked 110, 후보별 1차 count와 overlap 26개 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git status --short --untracked-files=all -- data/benefits_snapshot.json src/components/PlanningReportsDashboardClient.tsx src/lib/finlife/probeGroups.ts` 실행: 미분류 후보 중 실제 남은 항목 확인

## 남은 리스크
- 후보 순서는 경로와 최근 검증 근거 기준입니다. 실제 stage 전에는 각 후보별 `node scripts/worktree_scope.mjs ...`와 `git diff --check -- ...`를 다시 실행해야 합니다.
- `docs-work-guidedoc`의 `Zone.Identifier` 삭제는 Windows 다운로드 메타데이터 제거로 보이지만, 실제 포함 여부는 PR 전 별도 확인이 필요합니다.
- planning 관련 후보는 서로 공유 파일이 많아 단독 PR로 나눌 경우 e2e 근거가 약해질 수 있습니다.
- `package.json`과 `pnpm-lock.yaml` 변경은 여러 후보에서 필요할 수 있어 마지막에 단독으로 둘지, 필요한 기능 PR에 포함할지 다시 판단해야 합니다.

## 다음 라운드
- 1순위 후보인 `wsl-dev-launcher-runtime`의 정확한 stage 파일 목록을 `worktree:scope`로 고정하고, stage 가능한지 최종 확인합니다.
- 그 다음 `data-freshness-public-sources` 후보에서 snapshot/generated report와 코드/test/doc 변경의 포함 범위를 분리 검토합니다.
- 후보별 stage 전용 체크리스트를 만든 뒤 실제 staging은 사용자 변경과 섞이지 않도록 한 묶음씩 진행합니다.
