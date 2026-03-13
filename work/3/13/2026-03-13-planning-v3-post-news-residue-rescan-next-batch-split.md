# 2026-03-13 planning-v3 post-news-residue-rescan-next-batch-split

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-post-news-residue-rescan-next-batch-split.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드에서 다음 실제 구현 후보별 최소 검증 세트를 다시 좁히는 데 사용
- `work-log-closeout`: residue 재분해 결과와 다음 우선순위를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest note `work/3/13/2026-03-13-planning-v3-news-notes-weekly-plan-write-contract.md`가 다음 라운드 우선순위 1번으로 `news residue가 실제로 모두 닫혔는지 재확인`과 `news 밖 기준으로 남은 dirty cluster 재분해`를 남겼다.
- current worktree에는 여전히 `planning/v3/news`, `planning/v3/alerts`, `planning/v3/indicators`와 non-news planning-v3 dirty가 넓게 남아 있어, 곧바로 구현에 들어가면 이미 닫힌 news 배치를 다시 섞을 위험이 컸다.
- 이번 라운드는 구현이 아니라 post-news residue 재분해만 수행하고, 다음 실제 구현 배치 1개만 추천하는 것이 목적이다.

## 핵심 변경
- current news residue는 `planning/v3/news/**`, `src/app/api/planning/v3/news/**`, `src/app/planning/v3/news/**`, `tests/planning-v3-news-*` 기준으로 모두 이미 닫힌 배치의 잔여 diff로 재분류됐다. 새 미완료 news 축은 확인하지 못했다.
- 재매핑 기준
  - `news read-only surface`: `digest/llmAdapter/scenario/select/store`, read-only route 8개, read-only client/page, `tests/planning-v3-news-api.test.ts`, `tests/planning-v3-news-search-api.test.ts`
  - `news write/settings surface + direct UI coverage`: `planning/v3/news/settings.ts`, `planning/v3/alerts/{rootDir,store}.ts`, alerts/settings route/UI, `tests/planning-v3-news-alerts-api.test.ts`, `tests/planning-v3-news-alert-rules-api.test.ts`, `tests/planning-v3-news-settings-remote-host-api.test.ts`, `tests/planning-v3-news-alerts-ui.test.tsx`, `tests/planning-v3-news-settings-ui.test.tsx`
  - `news refresh/recovery/internal tail`: `newsRefresh`, `recovery`, `rootDir`, refresh/recovery route, `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`, `tests/planning-v3-news-digest-indicator-root.test.ts`
  - `news notes/weekly-plan write contract`: `notes.ts`, `weeklyPlan.ts`, notes/weekly-plan route, `tests/planning-v3-news-notes-api.test.ts`, `tests/planning-v3-news-weekly-plan-api.test.ts`
- `planning/v3/alerts/{rootDir.ts,store.ts,store.test.ts}`, `planning/v3/indicators/connectors/*`, `planning/v3/indicators/{specOverrides.ts,store/index.ts,rootDir.ts}`, `tests/planning-v3-indicators-specs-import-api.test.ts`도 각각 `alerts/settings closed surface`, `indicators connector harness`, `indicators specs import/root contract` closeout에 이미 포함된 residual diff로 분류했다.

## 남은 실제 구현 후보
- `planning-v3 ops-migrate-golden-pipeline contract` (`3 files`): `planning/v3/ops/migrate.ts`, `planning/v3/ops/migrate.test.ts`, `planning/v3/qa/goldenPipeline.test.ts`
  - 변경 이유: news/alerts/indicators 바깥에서 가장 작은 internal-only cluster다.
  - 사용자 영향 여부: 내부 운영/검증 계약 중심, 직접 사용자 경로 영향은 낮다.
  - 최소 검증 세트: `pnpm exec vitest run planning/v3/ops/migrate.test.ts planning/v3/qa/goldenPipeline.test.ts`, `pnpm exec eslint planning/v3/ops/migrate.ts planning/v3/ops/migrate.test.ts planning/v3/qa/goldenPipeline.test.ts`
  - 다른 축과 섞이면 위험한 이유: txn/draft/user-facing route와 합치면 내부 마이그레이션 회귀와 사용자 흐름 회귀를 분리하기 어려워진다.
- `planning-v3 txn-accounts-batches surface` ([가정] `32 files`): accounts/balances/batches/transactions route와 list/detail client, import/override 관련 tests, `src/app/planning/v3/transactions/page.tsx`
  - 변경 이유: current branch `pr37-planning-v3-txn-overrides`와 가장 직접적으로 맞물린 큰 user-facing cluster다.
  - 사용자 영향 여부: 높음. accounts/batches/transactions write/read 흐름에 직접 닿는다.
  - 최소 검증 세트: targeted `vitest`(`tests/planning-v3-batches-import-csv-api.test.ts`, `tests/planning-v3-transactions-import-account-api.test.ts`, remote-host/account tests), `eslint`(관련 route/component/test), `pnpm build`; page/user-flow를 실제 수정하면 `pnpm e2e:rc`
  - 다른 축과 섞이면 위험한 이유: remote-host contract, page redirect, csv/import/write semantics가 한꺼번에 커져 rollback과 원인 분리가 어렵다.
- `planning-v3 draft-profile surface` ([가정] `33 files`): draft/profile route, drafts/profile client, draft/profile API/UI/store tests
  - 변경 이유: drafts/profile 계열 dirty가 route + client + API test로 크게 응집돼 있다.
  - 사용자 영향 여부: 높음. draft preview/apply/create-profile/preflight와 profile draft 목록/상세 흐름에 직접 닿는다.
  - 최소 검증 세트: targeted `vitest`(`tests/planning-v3-draft-*.test.ts`, `tests/planning-v3-profile-draft-*.test.ts`, `tests/planning-v3-profile-drafts-api.test.ts`, `tests/planning-v3/draft-store.test.ts`), `eslint`(관련 route/component/test), `pnpm build`; UI 흐름까지 바꾸면 `pnpm e2e:rc`
  - 다른 축과 섞이면 위험한 이유: profile/draft write contract와 txn/batch 또는 cross-cutting remote-host guard를 함께 열면 실패 원인을 좁히기 어렵다.
- `planning-v3 auxiliary route-guard contract` ([가정] `8~11 files`): `categories/rules`, `import/csv`, `journal/entries`, `routines/daily`, `scenarios/library` route와 `tests/planning-v3-write-route-guards.test.ts`, `tests/planning-v3-internal-route-contract.test.ts`, `tests/planning-v3-user-facing-remote-host-api.test.ts`
  - 변경 이유: same-origin/remote-host/write-guard 축이 여러 planning-v3 API로 퍼져 있는 cross-cutting cluster다.
  - 사용자 영향 여부: 중간. 직접 UI보다 write API contract와 guard consistency 영향이 크다.
  - 최소 검증 세트: targeted `vitest`(위 guard/route tests), `eslint`(관련 route/test), `pnpm build`
  - 다른 축과 섞이면 위험한 이유: accounts/drafts/user-facing route 전체에 guard 변화가 번져 실제 비즈니스 회귀와 보안/원격 host 계약 회귀가 섞인다.

## 추천 다음 구현 배치
- 추천: `planning-v3 ops-migrate-golden-pipeline contract`
- 추천 이유
  - 현재 남은 실제 후보 중 가장 작고 internal-only에 가깝다.
  - `3 files` 정도로 닫을 수 있어 rollback이 쉽고, news/alerts/indicators closed residual과도 분리된다.
  - `txn-accounts-batches`나 `draft-profile`보다 원인 분리가 쉽고, build/e2e 없이 targeted test + eslint 정도로 시작할 수 있어 다음 실제 구현 1순위로 가장 안전하다.

## 명시적 제외 범위
- 이미 닫힌 배치의 잔여 diff로 재분류돼 이번 라운드 이후 다시 열지 않을 범위
  - `news read-only surface`
  - `news write/settings surface`
  - `news refresh/recovery/internal tail`
  - `news notes/weekly-plan write contract`
  - `alerts/settings closed surface`
  - `indicators connector harness`
  - `indicators specs import/root contract`
- 이번 residue 재분해 라운드에서 구현 후보로 열지 않은 범위
  - `quickstart/home` 전체
  - `draft/profile/import/csv` 상세 구현
  - `runtime docs/scripts` 전체
  - `planning-v2/reports-ui` 전체
  - 코드 수정
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`
  - `pnpm release:verify`

## 검증
- 기준선 / 문맥 확인
  - `find work/3/14 -maxdepth 1 -type f -name "*.md" 2>/dev/null | sort | tail -n 5`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-news-notes-weekly-plan-write-contract.md`
  - `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
- residue 스캔
  - `git branch --show-current`
  - `git status --short -- planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/indicators/connectors/ecos.ts planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fixture.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.ts planning/v3/indicators/connectors/kosis.test.ts planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news tests/planning-v3-news-*.test.ts tests/planning-v3-indicators-*.test.ts`
  - `git diff --name-only -- planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news tests/planning-v3-news-*.test.ts`
  - `git status --short -- tests/planning-v3-news-*`
  - `git diff --stat -- src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx planning/v3/news/settings.ts planning/v3/news/settings.test.ts src/app/api/planning/v3/news/alerts/route.ts src/app/api/planning/v3/news/alerts/rules/route.ts src/app/api/planning/v3/news/settings/route.ts`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-readonly-surface-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-write-settings-direct-ui-regression-coverage.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-news-refresh-recovery-internal-tail.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-news-indicators-residue-rescan-next-batch-split.md`
- non-news 후보 스캔
  - `git status --short -- planning/v3/alerts planning/v3/indicators tests/planning-v3-indicators-*.test.ts`
  - `git diff --stat -- planning/v3/alerts planning/v3/indicators tests/planning-v3-indicators-*.test.ts`
  - `sed -n '1,220p' planning/v3/alerts/store.ts`
  - `sed -n '1,220p' planning/v3/alerts/store.test.ts`
  - `sed -n '1,120p' planning/v3/alerts/rootDir.ts`
  - `sed -n '1,220p' planning/v3/indicators/specOverrides.ts`
  - `sed -n '1,220p' planning/v3/indicators/store/index.ts`
  - `sed -n '1,120p' planning/v3/indicators/rootDir.ts`
  - `sed -n '1,260p' tests/planning-v3-indicators-specs-import-api.test.ts`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-indicators-connector-harness-hardening.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-indicators-specs-import-root-contract.md`
  - `git status --short -- planning/v3 src/app/api/planning/v3 src/app/planning/v3 tests | rg -v 'planning/v3/news|planning/v3/alerts|planning/v3/indicators|src/app/api/planning/v3/news|src/app/planning/v3/news|tests/planning-v3-news-|tests/planning-v3-indicators-'`
  - `git status --short -- src/app/api/planning/v3 src/app/planning/v3 tests/planning-v3-* tests/planning-v3/** | rg 'accounts|balances|batches|transactions|account-overrides|transfer-overrides|starting-balance|categorized|cashflow|import-csv|merge|planning-v3-(accounts|balances|batches|transactions)'`
  - `git status --short -- src/app/api/planning/v3 src/app/planning/v3 tests/planning-v3-* tests/planning-v3/** | rg 'draft|drafts|profile'`
  - `git status --short -- src/app/api/planning/v3 tests/planning-v3-* tests/planning-v3/** | rg 'remote-host|write-route-guards|internal-route-contract|user-facing-remote-host|scenarios/library|routines|journal/entries|import/csv|categories/rules'`
  - `git diff --stat -- planning/v3/ops/migrate.ts planning/v3/ops/migrate.test.ts planning/v3/qa/goldenPipeline.test.ts`
  - `sed -n '1,240p' planning/v3/ops/migrate.ts`
  - `sed -n '1,260p' planning/v3/ops/migrate.test.ts`
  - `sed -n '1,260p' planning/v3/qa/goldenPipeline.test.ts`
  - `git diff --stat -- src/app/api/planning/v3/accounts/[id]/route.ts src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts src/app/api/planning/v3/accounts/route.ts src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/batches/[id]/summary/route.ts src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/app/api/planning/v3/batches/route.ts src/app/api/planning/v3/opening-balances/route.ts src/app/api/planning/v3/transactions/account-overrides/route.ts src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts src/app/api/planning/v3/transactions/batches/import-csv/route.ts src/app/api/planning/v3/transactions/batches/merge/route.ts src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/transactions/import/csv/route.ts src/app/api/planning/v3/transactions/transfer-overrides/route.ts src/app/planning/v3/accounts/_components/AccountsClient.tsx src/app/planning/v3/balances/_components/BalancesClient.tsx src/app/planning/v3/batches/[id]/_components/BatchSummaryClient.tsx src/app/planning/v3/batches/_components/BatchesCenterClient.tsx src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-transactions-page-redirect.test.ts src/app/planning/v3/transactions/page.tsx`
  - `git diff --stat -- src/app/api/planning/v3/draft/apply/route.ts src/app/api/planning/v3/draft/preview/route.ts src/app/api/planning/v3/draft/profile/route.ts src/app/api/planning/v3/draft/scenario/route.ts src/app/api/planning/v3/drafts/[id]/create-profile/route.ts src/app/api/planning/v3/drafts/[id]/route.ts src/app/api/planning/v3/drafts/route.ts src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profiles/route.ts src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-draft-scenario-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-drafts-ui.test.tsx tests/planning-v3/draft-store.test.ts tests/planning-v3/drafts-upload-flow.test.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-legacy-drafts-ui.test.tsx`
  - `git diff --stat -- src/app/api/planning/v3/categories/rules/[id]/route.ts src/app/api/planning/v3/categories/rules/route.ts src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/journal/entries/[id]/route.ts src/app/api/planning/v3/journal/entries/route.ts src/app/api/planning/v3/routines/daily/route.ts src/app/api/planning/v3/scenarios/library/route.ts tests/planning-v3-routines-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-internal-route-contract.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`
- 실행한 검증
  - `git diff --check -- work/3/13/2026-03-13-planning-v3-post-news-residue-rescan-next-batch-split.md`
- 미실행 검증
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`
  - `pnpm release:verify`

## 남은 리스크
- 이번 라운드는 정적 residue 스캔만 수행했으므로, non-news 후보 4개 중 `txn-accounts-batches`, `draft-profile`, `auxiliary route-guard`의 정확한 세부 경계는 실제 구현 직전 한 번 더 재잠금이 필요하다.
- [가정] `alerts store/root contract`도 earlier residue split에선 `alerts/settings closed surface`로 잠겼지만, branch 전체 dirty가 길게 남아 있어 careless reopen 시 다시 미완료 축처럼 보일 수 있다.
- 오늘(`2026-03-14`) 기준 새 `/work/3/14` 문서는 없어서 전날 closeout을 기준선으로 이어받았다.

## 다음 라운드 우선순위
1. `planning-v3 ops-migrate-golden-pipeline contract`
2. `planning-v3 txn-accounts-batches surface`
3. `planning-v3 draft-profile surface`
