# 2026-03-19 N3 QA gate and golden dataset bootstrap

## 변경 파일
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
- `work/3/19/2026-03-19-n3-qa-gate-bootstrap.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 docs-only bootstrap으로 고정하고 `git diff --check`만 실행하는 최소 검증 세트를 선택했다.
- `work-log-closeout`: 실제 command inventory, gate 매핑, golden dataset inventory, 미실행 검증, 후속 배치를 `/work` 형식으로 정리했다.

## 변경 이유
- `N3` 문서가 실제 저장소에 없는 fixture 경로와 지나치게 추상적인 gate 표현을 일부 포함하고 있어, 다음 라운드에서 바로 실행 가능한 bootstrap 기준으로 맞출 필요가 있었다.
- 이번 라운드는 새 테스트나 새 script를 추가하지 않고, 이미 존재하는 command/test/fixture만 기준으로 `stable / beta / ops-dev`를 다시 매핑하는 것이 목적이었다.

## 실제 확인한 command inventory
- 공통 baseline
  - `pnpm lint`
  - `pnpm build`
  - `pnpm test`
- route inventory / SSOT
  - `pnpm planning:current-screens:guard`
  - `pnpm planning:ssot:check`
- stable public / stable planning v2
  - `pnpm e2e:rc`
  - `pnpm e2e:rc:dart`
  - `pnpm e2e:rc:data-sources`
  - `pnpm planning:v2:complete`
  - `pnpm planning:v2:compat`
  - `pnpm planning:v2:regress`
  - `pnpm planning:v2:e2e:fast`
  - `pnpm planning:v2:e2e:full`
  - `pnpm planning:v2:e2e:golden`
  - `pnpm release:verify`
- repo-wide hygiene
  - `pnpm verify`
- ops/dev bootstrap / repair
  - `pnpm v3:doctor`
  - `pnpm v3:support-bundle`
  - `pnpm v3:restore`
  - `pnpm v3:migrate`
  - `pnpm planning:v3:import:csv`

## stable / beta / ops-dev gate 매핑 결과
- `public stable`
  - 기본: `pnpm lint`, `pnpm build`, targeted `pnpm test <file...>` 또는 `pnpm test`
  - 조건부: `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`, `pnpm e2e:rc`, `pnpm e2e:rc:dart`, `pnpm e2e:rc:data-sources`, `pnpm planning:v2:complete`, `pnpm planning:v2:compat`, `pnpm planning:v2:regress`, `pnpm planning:v2:e2e:golden`, `pnpm verify`
  - final single-owner: `pnpm release:verify`
- `public beta`
  - 기본: `pnpm lint`, `pnpm build`, targeted `pnpm test <tests/planning-v3-...>` 또는 `pnpm test`
  - 조건부: `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`, `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-v3-import-to-cashflow.spec.ts tests/e2e/v3-draft-apply.spec.ts`
  - advisory: stable bridge를 함께 건드릴 때만 `pnpm e2e:rc`, `pnpm planning:v2:complete`, `pnpm planning:v2:compat`, `pnpm verify`
- `ops/dev`
  - 기본: targeted `pnpm test <file...>`
  - 조건부: `pnpm build`, `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`
  - repair/bootstrap evidence: `pnpm v3:doctor`, `pnpm v3:support-bundle`, `pnpm v3:restore`, `pnpm v3:migrate`, `pnpm planning:v3:import:csv`

## golden dataset 5 category별 실제 자산 목록
- `canonical entity fixture`
  - `tests/fixtures/planning-v3/csv/*.csv`
  - `tests/fixtures/planning-v3/drafts-upload-flow/*.json`
  - `tests/planning-v3-*Store.test.ts`
  - `tests/planning-v3-*-api.test.ts`
- `route contract fixture`
  - `tests/planning-v3-*-api.test.ts`
  - `tests/planning-v3-*-remote-host-api.test.ts`
  - `tests/planning-v3-internal-route-contract.test.ts`
  - `tests/planning-v3-write-route-guards.test.ts`
  - `tests/fixtures/compat/*`
- `projection / regression fixture`
  - `tests/fixtures/planning-v2/golden-runs/*`
  - `tests/fixtures/planning-regression/eval-latest.sample.json`
  - `tests/e2e/planning-v2-full.spec.ts`
  - `pnpm planning:v2:regress`
  - `pnpm planning:v2:e2e:golden`
  - `tests/planning-v3-aggregateMonthlyCashflow-v2.test.ts`
  - `tests/planning-v3-categorized-api.test.ts`
  - `tests/planning-v3-balances.test.ts`
  - `tests/planning-v3-computeMonthlyBalances.test.ts`
  - `tests/planning-v3-getBatchSummary.test.ts`
- `e2e scenario fixture`
  - stable: `tests/e2e/smoke.spec.ts`, `tests/e2e/flow-planner-to-history.spec.ts`, `tests/e2e/planning-quickstart-preview.spec.ts`, `tests/e2e/flow-history-to-report.spec.ts`, `tests/e2e/news-settings-alert-rules.spec.ts`, `tests/e2e/dart-flow.spec.ts`, `tests/e2e/data-sources-settings.spec.ts`
  - beta targeted: `tests/e2e/flow-v3-import-to-cashflow.spec.ts`, `tests/e2e/v3-draft-apply.spec.ts`
- `ops / repair / compatibility fixture`
  - `tests/planning/ops/*`
  - `tests/planning/migrations/*`
  - `tests/planning/storage-consistency-recovery.test.ts`
  - `tests/planning/ops/backup-api.test.ts`
  - `tests/fixtures/compat/*`
  - `pnpm v3:doctor`, `pnpm v3:support-bundle`, `pnpm v3:restore`, `pnpm v3:migrate`

## 문서 mismatch와 보정 내용
- 문서에 있던 `tests/fixtures/planning/golden/*`, `tests/planning-v2/regression/*`, `tests/backup-export-planning.test.ts`는 실제 저장소에 없어서 제거했다.
- projection/regression category에는 실제로 존재하는 `tests/fixtures/planning-v2/golden-runs/*`, `tests/fixtures/planning-regression/eval-latest.sample.json`, `pnpm planning:v2:regress`, `pnpm planning:v2:e2e:golden`, `tests/e2e/planning-v2-full.spec.ts`를 연결했다.
- route contract category에 `tests/planning-v3-write-route-guards.test.ts`를 추가해 guard coverage를 실제 파일 기준으로 명시했다.
- command role table과 tier matrix에 실제 존재하는 `pnpm e2e:rc:dart`, `pnpm e2e:rc:data-sources`, `pnpm planning:v2:regress`, `pnpm planning:v2:e2e:golden`, `pnpm v3:*` bootstrap 명령을 반영했다.
- `docs/maintenance.md`, `docs/release-checklist.md`, `analysis_docs/v2/11_post_phase3_vnext_backlog.md`는 이번 보정과 직접 충돌하지 않아 수정하지 않았다.

## 핵심 변경
- `N3` gate 문서를 실제 package script, test file, fixture inventory 기준으로 다시 매핑했다.
- stable / beta / ops-dev tier별 기본 gate와 조건부 gate를 실제 실행 가능한 명령 이름으로 좁혔다.
- golden dataset 5 category를 실제 파일과 명령 기준으로 inventory화하고, 없는 경로 참조를 제거했다.
- stable final single-owner gate는 `pnpm release:verify`로 유지하되, beta와 ops/dev에는 자동 승격하지 않는 기준을 그대로 고정했다.

## 검증
- 실행한 검증
- `git diff --check -- analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md work/3/19/2026-03-19-n3-qa-gate-bootstrap.md`
  - 결과: 통과
- 미실행 검증
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- 이유: 이번 라운드는 docs-only bootstrap이라 기본 검증을 `git diff --check`로 제한했다.

## 남은 리스크
- beta targeted Playwright는 전용 package script가 아니라 existing runner pattern(`node scripts/playwright_with_webserver_debug.mjs test <spec...>`)에 의존하므로, 후속 배치에서 실행 ownership과 호출 예시를 더 명확히 잠글 필요가 있다.
- `planning:v2:guard`, `planning:v2:engine:guard`, `planning:v2:freeze:guard`, `planning:v2:ops:*`처럼 실제로 존재하는 보조 gate 명령의 포함 기준은 아직 broad inventory 수준이다.
- 현재 워크트리에는 unrelated dirty 변경이 계속 남아 있으므로, 후속 커밋/PR에서 이번 docs-only 범위를 분리해 확인해야 한다.
- `N3`는 bootstrap 문서 정합성 기준으로는 닫혔지만, command ownership과 release mapping 세부화는 후속 배치가 필요하다.

## 다음 N3 후속 배치 제안
- `N3 gate command ownership and release mapping hardening`
