# 2026-05-26 pnpm runner fallback 보강

## 변경 파일
- `scripts/pnpm_runner.mjs`
- `tests/pnpm-runner.test.ts`
- `scripts/bootstrap_local.mjs`
- `scripts/build_detached.mjs`
- `scripts/daily_refresh.mjs`
- `scripts/dart_rules_apply_patch.mjs`
- `scripts/deps_offline.mjs`
- `scripts/e2e_parallel_flake_classify.mjs`
- `scripts/e2e_run.mjs`
- `scripts/live_verify.mjs`
- `scripts/planning_v2_acceptance.mjs`
- `scripts/planning_v2_compat.mjs`
- `scripts/planning_v2_complete.mjs`
- `scripts/planning_v2_desktop_build.mjs`
- `scripts/planning_v2_desktop_install.mjs`
- `scripts/planning_v2_evidence_bundle.mjs`
- `scripts/planning_v2_final_report.mjs`
- `scripts/planning_v2_ops_run.mjs`
- `scripts/planning_v2_ops_scheduler.sh`
- `scripts/planning_v2_regression.mjs`
- `scripts/planning_v2_release.mjs`
- `scripts/release_prepare.mjs`
- `scripts/release_verify.mjs`
- `scripts/seed_debug.mjs`
- `scripts/warm_if_stale.mjs`
- `docs/dart-rules-quality-report.md`
- `docs/data-freshness-report.md`
- `docs/schema-drift-report.md`

## 사용 skill
- `planning-gate-selector`: release/ops script 변경으로 필요한 최소 검증을 `verify`, `release:verify`, `build` 중심으로 선정했습니다.
- `work-log-closeout`: `/work` 종료 기록의 표준 섹션, 실제 실행 명령, 남은 리스크, 다음 라운드 항목을 맞췄습니다.

## 변경 이유
- 일부 운영·릴리즈 helper가 bare `pnpm` 실행 파일을 직접 spawn하고 있어, `corepack pnpm <script>`로 진입해도 하위 스크립트에서 pnpm shim 부재로 실패할 수 있었습니다.
- 직전 `products:sync` 리스크 확인 중 `bootstrap:local`, `seed:debug`, `live:*`, planning v2 release/ops helper에 같은 실행성 리스크가 남아 있음을 확인했습니다.

## 핵심 변경
- `scripts/pnpm_runner.mjs`에 direct `pnpm` 우선, `corepack pnpm` fallback을 제공하는 동기/비동기/buffered/long-running process helper를 추가했습니다.
- release/ops/planning/e2e/desktop helper들이 직접 `pnpm` 또는 `pnpm.cmd`를 고르지 않고 공용 runner를 쓰도록 정리했습니다.
- bash scheduler의 기본 `PNPM_BIN`은 `corepack pnpm`으로 바꿔 shim 없는 cron/ops 환경의 기본값을 안전하게 했습니다.
- fallback 후보와 ENOENT fallback 동작을 `tests/pnpm-runner.test.ts`로 고정했습니다.
- `corepack pnpm verify` 실행으로 생성 리포트 3종의 기준시각이 갱신됐습니다.

## 검증
- `git diff --check` PASS
- `node --check <changed scripts>` PASS
- `corepack pnpm test tests/pnpm-runner.test.ts` PASS: 1 file, 2 tests
- `corepack pnpm seed:debug` PASS: FINLIFE fixture 2 products/3 options, KDB fixture fetched=2/upserted=2
- `corepack pnpm verify` PASS: 662 files / 2031 tests
- `corepack pnpm release:verify` 1차 FAIL: `multi-agent:guard`가 최신 `/work` note의 `## 다음 라운드` 누락을 지적했습니다. 본 문서로 보완 후 재실행 예정입니다.
- `corepack pnpm release:verify` PASS: `planning:v2:complete`, `multi-agent:guard`, `planning:v2:compat`, `planning:v2:regress`, `test`, advisory `planning:ssot:check` 통과
- `corepack pnpm build` PASS: Next.js production build 완료

## 남은 리스크
- 이번 커밋을 push하면 PR #24 head SHA가 다시 바뀌므로 GitHub Actions `CI`, `E2E Smoke`를 새 SHA 기준으로 확인해야 합니다.
- `release:verify` 출력에 `[v2-core-change]` 태그 권고가 남았습니다. exit는 PASS였지만 PR 제목이나 본문에서 v2 core script 영향이 보이도록 보완하는 편이 좋습니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 변경분을 커밋하고 PR #24에 push한 뒤 새 head SHA 기준 GitHub Actions `CI`, `E2E Smoke`를 확인하겠습니다.
- PR 제목 또는 본문에 `[v2-core-change]` 성격을 반영해 release gate 권고와 리뷰 가시성을 맞추겠습니다.
- 원격 검증 통과 후 PR 본문과 `/work` 기록을 최신 SHA 및 검증 결과로 맞추겠습니다.
