# 2026-03-13 planning-v3 next batch breakdown

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-next-batch-breakdown.md`

## 사용 skill
- `planning-gate-selector`: planning-v3 dirty worktree를 그룹별로 다시 자르고, 다음 구현 배치의 권장 검증 세트를 가장 작은 범위로 고르기 위해 사용
- `work-log-closeout`: 이번 라운드의 정적 스캔 결과, 제외 범위, 다음 배치 추천을 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 현재 dirty worktree에는 `planning-v3` 관련 변경이 대량으로 섞여 있어, 한 번에 구현/검증하면 원인 분리가 어렵습니다.
- 이번 라운드는 구현이 아니라 `planning-v3` 변경 파일만 다시 추려서 `user-facing page / API contract / store/helper / news/settings / transactions/accounts` 기준으로 묶고, 다음 실제 구현 배치 1개만 추천하는 정리 작업입니다.
- 사용자 지시대로 `quickstart/home/reports`, `runtime/docs/data-sources/ops`는 이번 분해 범위에 섞지 않았고, 실제 테스트/빌드도 실행하지 않았습니다.

## 핵심 변경
- `git status` 기준 `planning-v3` 관련 dirty 파일만 다시 추려 총 208개로 집계했습니다.
- 경로 우선 분류와 최근 `work/3/12`, `work/3/13` closeout을 함께 대조해 5개 그룹으로 재분류했습니다.
- 각 그룹에 대해 변경 이유, 예상 검증, 다른 그룹과 섞일 때 위험한 이유를 짧게 정리했습니다.
- 다음 구현 배치는 `news/settings` 전체가 아니라 그 안에서도 `alert rules 저장 의미 정렬` 1축만 남기도록 추천했습니다.
- 나머지 그룹과 `news/settings` 내부의 비핵심 축은 명시적으로 제외 범위로 적었습니다.

## 현재 묶음 현황
- 최신 검증 기준선은 `work/3/13/2026-03-13-single-owner-final-gate-rerun.md`입니다.
  - 당시 `pnpm multi-agent:guard`, `pnpm cleanup:next-artifacts`, `pnpm release:verify`, `pnpm build`, `pnpm e2e:rc`가 PASS였습니다.
  - 이번 라운드에서는 정적 스캔만 했고, 위 게이트는 재실행하지 않았습니다.
- 이번 스캔 집계:
  - `news/settings`: 95개
  - `transactions/accounts`: 88개
  - `API contract`: 12개
  - `store/helper`: 10개
  - `user-facing page`: 3개
- [추론] 그룹 분류는 현재 경로명과 최근 closeout 문맥을 우선 사용한 path-first 정리입니다. 일부 helper/test 파일은 다음 구현 배치의 실제 포함 범위에 따라 한 단계 안에서 다시 좁혀질 수 있습니다.

### user-facing page
- 변경 이유: `categories/journal/scenarios` 쪽 사용자 클라이언트 표면이 dirty 상태로 남아 있어, 화면 톤/상태/탭 구조 같은 UI 변경이 API나 store 변경과 섞여 있을 가능성이 있습니다.
- 예상 검증: `pnpm lint`, `pnpm build`, 사용자 동선이나 셀렉터가 바뀌면 `pnpm e2e:rc`
- 다른 그룹과 섞이면 위험한 이유: 같은 화면에서 보이는 이상이 실제로는 API 응답 문제인지, store 상태 문제인지, 단순 UI 회귀인지 분리하기 어려워집니다.
- 변경 파일:
```text
src/app/planning/v3/categories/rules/_components/RulesClient.tsx
src/app/planning/v3/journal/JournalClient.tsx
src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx
```

### API contract
- 변경 이유: `categories/journal/routines/scenarios/indicators` 계열은 route guard, 응답 shape, status code 같은 계약성 리스크가 중심입니다.
- 예상 검증: `pnpm test`, `pnpm build`
- 다른 그룹과 섞이면 위험한 이유: 사용자 화면까지 같이 바꾸면 실패 원인이 route contract인지 화면 소비 방식인지 분리되지 않아 rollback 단위가 커집니다.
- 변경 파일:
```text
src/app/api/planning/v3/categories/rules/[id]/route.ts
src/app/api/planning/v3/categories/rules/route.ts
src/app/api/planning/v3/indicators/specs/route.ts
src/app/api/planning/v3/journal/entries/[id]/route.ts
src/app/api/planning/v3/journal/entries/route.ts
src/app/api/planning/v3/routines/daily/route.ts
src/app/api/planning/v3/scenarios/library/route.ts
tests/planning-v3-exposure-api.test.ts
tests/planning-v3-indicators-specs-import-api.test.ts
tests/planning-v3-internal-route-contract.test.ts
tests/planning-v3-journal-api.test.ts
tests/planning-v3-routines-api.test.ts
```

### store/helper
- 변경 이유: `ops/migrate`, `goldenPipeline`, 범용 store/helper는 사용자 표면보다 계산/저장/내부 정책 변화에 가깝습니다.
- 예상 검증: `pnpm test`, 필요 시 `pnpm lint`
- 다른 그룹과 섞이면 위험한 이유: 이 축은 단위 테스트로 닫을 수 있는 부분이 많은데, 페이지/API와 같이 움직이면 검증 세트가 불필요하게 `build/e2e`까지 커집니다.
- 변경 파일:
```text
planning/v3/ops/migrate.ts
planning/v3/qa/goldenPipeline.test.ts
src/lib/planning/v3/categories/store.ts
src/lib/planning/v3/journal/store.ts
src/lib/planning/v3/routines/store.ts
src/lib/planning/v3/scenarios/library.ts
src/lib/planning/v3/security/whitelist.ts
src/lib/planning/v3/service/monteCarloCore.ts
tests/planning-v3/csv-parse.test.ts
tests/planning-v3/drafts-upload-flow.test.ts
```

### news/settings
- 변경 이유: 뉴스 설정, alert rules, digest/trends, exposure, indicators가 한 묶음으로 dirty 상태이며, 최근 closeout에서도 `저장 의미`, `alert rules apply`, `guided input`, `indicator root`가 같은 축으로 반복 확인됐습니다.
- 예상 검증: `pnpm test`, `pnpm lint`, `pnpm build`, 사용자 플로우를 건드리면 `pnpm e2e:rc`
- 다른 그룹과 섞이면 위험한 이유: 뉴스 설정 화면은 이미 `settings`, `alerts/rules`, `exposure/profile`, `indicators`가 연결돼 있어 여기에 transactions/accounts까지 섞이면 실패가 한 번에 ingestion, balances, news UI, save/apply semantics 전부로 퍼집니다.
- 변경 파일:
```text
planning/v3/alerts/rootDir.ts
planning/v3/alerts/store.test.ts
planning/v3/alerts/store.ts
planning/v3/indicators/connectors/ecos.test.ts
planning/v3/indicators/connectors/ecos.ts
planning/v3/indicators/connectors/fixture.ts
planning/v3/indicators/connectors/fred.test.ts
planning/v3/indicators/connectors/kosis.test.ts
planning/v3/indicators/connectors/kosis.ts
planning/v3/indicators/rootDir.ts
planning/v3/indicators/specOverrides.test.ts
planning/v3/indicators/specOverrides.ts
planning/v3/indicators/store/index.ts
planning/v3/indicators/store/store.test.ts
planning/v3/news/cli/newsRefresh.ts
planning/v3/news/digest.test.ts
planning/v3/news/llmAdapter.test.ts
planning/v3/news/notes.ts
planning/v3/news/recovery.test.ts
planning/v3/news/recovery.ts
planning/v3/news/rootDir.ts
planning/v3/news/scenario.test.ts
planning/v3/news/scenario/qualityGates.test.ts
planning/v3/news/select/score.ts
planning/v3/news/settings.test.ts
planning/v3/news/settings.ts
planning/v3/news/store/index.ts
planning/v3/news/store/store.test.ts
planning/v3/news/weeklyPlan.ts
src/app/api/planning/v3/exposure/profile/route.ts
src/app/api/planning/v3/news/alerts/route.ts
src/app/api/planning/v3/news/alerts/rules/route.ts
src/app/api/planning/v3/news/digest/route.ts
src/app/api/planning/v3/news/exposure/route.ts
src/app/api/planning/v3/news/items/route.ts
src/app/api/planning/v3/news/notes/[noteId]/route.ts
src/app/api/planning/v3/news/notes/route.ts
src/app/api/planning/v3/news/recovery/route.ts
src/app/api/planning/v3/news/refresh/route.ts
src/app/api/planning/v3/news/scenarios/route.ts
src/app/api/planning/v3/news/search/route.ts
src/app/api/planning/v3/news/settings/route.ts
src/app/api/planning/v3/news/sources/route.ts
src/app/api/planning/v3/news/today/route.ts
src/app/api/planning/v3/news/trends/route.ts
src/app/api/planning/v3/news/weekly-plan/route.ts
src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx
src/app/planning/v3/news/_components/NewsAlertsClient.tsx
src/app/planning/v3/news/_components/NewsDigestClient.tsx
src/app/planning/v3/news/_components/NewsExploreClient.tsx
src/app/planning/v3/news/_components/NewsTodayClient.tsx
src/app/planning/v3/news/_components/NewsTrendsClient.tsx
src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx
src/app/planning/v3/news/alerts/page.tsx
src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx
src/app/planning/v3/news/trends/page.tsx
src/lib/planning/v3/exposure/contracts.ts
src/lib/planning/v3/exposure/store.ts
src/lib/planning/v3/financeNews/contracts.ts
src/lib/planning/v3/financeNews/impactModel.ts
src/lib/planning/v3/financeNews/stressRunner.ts
src/lib/planning/v3/indicators/aliases.ts
src/lib/planning/v3/indicators/annotations.ts
src/lib/planning/v3/indicators/contracts.ts
src/lib/planning/v3/indicators/specOverrides.ts
src/lib/planning/v3/indicators/store.ts
src/lib/planning/v3/news/alerts.ts
src/lib/planning/v3/news/cli/newsRefresh.ts
src/lib/planning/v3/news/contradiction.ts
src/lib/planning/v3/news/digest.ts
src/lib/planning/v3/news/exposure.ts
src/lib/planning/v3/news/items.ts
src/lib/planning/v3/news/notes.ts
src/lib/planning/v3/news/recovery.ts
src/lib/planning/v3/news/scenarios.ts
src/lib/planning/v3/news/search.ts
src/lib/planning/v3/news/settings.ts
src/lib/planning/v3/news/sourceTransfer.ts
src/lib/planning/v3/news/sources.ts
src/lib/planning/v3/news/store.ts
src/lib/planning/v3/news/taxonomy.ts
src/lib/planning/v3/news/trend.ts
src/lib/planning/v3/news/weeklyPlan.ts
tests/e2e/news-settings-alert-rules.spec.ts
tests/planning-v3-news-alert-rules-api.test.ts
tests/planning-v3-news-alerts-api.test.ts
tests/planning-v3-news-alerts-ui.test.tsx
tests/planning-v3-news-api.test.ts
tests/planning-v3-news-digest-indicator-root.test.ts
tests/planning-v3-news-notes-api.test.ts
tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts
tests/planning-v3-news-search-api.test.ts
tests/planning-v3-news-settings-remote-host-api.test.ts
tests/planning-v3-news-settings-ui.test.tsx
tests/planning-v3-news-weekly-plan-api.test.ts
```

### transactions/accounts
- 변경 이유: accounts, balances, batches, draft/profile, import/csv, transactions, opening-balances가 한 덩어리로 남아 있어 가장 넓은 사용자 데이터 흐름을 포함합니다.
- 예상 검증: `pnpm test`, `pnpm lint`, `pnpm build`, 실제 흐름을 건드리면 `pnpm e2e:rc`
- 다른 그룹과 섞이면 위험한 이유: 이 축은 CSV import부터 batch summary, draft apply, profile 생성, account override까지 이어지므로 뉴스/settings나 generic API 축과 합치면 실패 시 rollback 지점이 거의 사라집니다.
- 변경 파일:
```text
src/app/api/planning/v3/accounts/[id]/route.ts
src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts
src/app/api/planning/v3/accounts/route.ts
src/app/api/planning/v3/balances/monthly/route.ts
src/app/api/planning/v3/batches/[id]/summary/route.ts
src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts
src/app/api/planning/v3/batches/import/csv/route.ts
src/app/api/planning/v3/batches/route.ts
src/app/api/planning/v3/draft/apply/route.ts
src/app/api/planning/v3/draft/preview/route.ts
src/app/api/planning/v3/draft/profile/route.ts
src/app/api/planning/v3/draft/scenario/route.ts
src/app/api/planning/v3/drafts/[id]/create-profile/route.ts
src/app/api/planning/v3/drafts/[id]/route.ts
src/app/api/planning/v3/drafts/route.ts
src/app/api/planning/v3/import/csv/route.ts
src/app/api/planning/v3/opening-balances/route.ts
src/app/api/planning/v3/profile/draft/route.ts
src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts
src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts
src/app/api/planning/v3/profile/drafts/[id]/route.ts
src/app/api/planning/v3/profile/drafts/route.ts
src/app/api/planning/v3/profiles/route.ts
src/app/api/planning/v3/transactions/account-overrides/route.ts
src/app/api/planning/v3/transactions/batches/[id]/account/route.ts
src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts
src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts
src/app/api/planning/v3/transactions/batches/[id]/route.ts
src/app/api/planning/v3/transactions/batches/import-csv/route.ts
src/app/api/planning/v3/transactions/batches/merge/route.ts
src/app/api/planning/v3/transactions/batches/route.ts
src/app/api/planning/v3/transactions/import/csv/route.ts
src/app/api/planning/v3/transactions/transfer-overrides/route.ts
src/app/planning/v3/accounts/_components/AccountsClient.tsx
src/app/planning/v3/balances/_components/BalancesClient.tsx
src/app/planning/v3/batches/[id]/_components/BatchSummaryClient.tsx
src/app/planning/v3/batches/_components/BatchesCenterClient.tsx
src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx
src/app/planning/v3/drafts/_components/DraftsListClient.tsx
src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx
src/app/planning/v3/import/_components/ImportCsvClient.tsx
src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx
src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx
src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx
src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx
src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx
src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx
src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx
src/app/planning/v3/transactions/page.tsx
src/lib/planning/v3/accounts/store.ts
src/lib/planning/v3/balances/monthly.ts
src/lib/planning/v3/batches/store.ts
src/lib/planning/v3/draft/service.ts
src/lib/planning/v3/draft/store.ts
src/lib/planning/v3/drafts/draftSchema.ts
src/lib/planning/v3/drafts/draftStore.ts
src/lib/planning/v3/openingBalances/store.ts
src/lib/planning/v3/profiles/store.ts
src/lib/planning/v3/providers/csv/csvProvider.ts
src/lib/planning/v3/service/aggregateMonthlyCashflow.ts
src/lib/planning/v3/service/applyDraftPatchToProfile.ts
src/lib/planning/v3/service/applyDraftToProfile.ts
src/lib/planning/v3/service/balances.ts
src/lib/planning/v3/service/buildDraftPatchFromCashflow.ts
src/lib/planning/v3/service/computeCashflowBreakdown.ts
src/lib/planning/v3/service/computeMonthlyBalances.ts
src/lib/planning/v3/service/detectTransfers.ts
src/lib/planning/v3/service/draftFromCashflow.ts
src/lib/planning/v3/service/draftPatch.ts
src/lib/planning/v3/service/draftScenarioSimulation.ts
src/lib/planning/v3/service/generateDraftPatchFromBatch.ts
src/lib/planning/v3/service/getBatchSummary.ts
src/lib/planning/v3/service/importCsvToBatch.ts
src/lib/planning/v3/service/transactionStore.ts
src/lib/planning/v3/service/transferDetect.ts
src/lib/planning/v3/service/txnId.ts
src/lib/planning/v3/store/batchesStore.ts
src/lib/planning/v3/store/draftStore.ts
src/lib/planning/v3/transactions/store.ts
tests/planning-v3-accounts-profile-remote-host-api.test.ts
tests/planning-v3-accounts-write-remote-host-api.test.ts
tests/planning-v3-draft-apply-api.test.ts
tests/planning-v3-draft-create-profile-api.test.ts
tests/planning-v3-drafts-remote-host-api.test.ts
tests/planning-v3-generateDraftPatchFromBatch.test.ts
tests/planning-v3-transactions-page-redirect.test.ts
tests/planning-v3-user-facing-remote-host-api.test.ts
tests/planning-v3-write-route-guards.test.ts
```

## 추천 다음 배치 1개
- 추천 배치: `news/settings - alert rules 저장 의미 정렬`
- 포함 후보:
  - `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
  - `src/app/api/planning/v3/news/settings/route.ts`
  - `src/app/api/planning/v3/news/alerts/rules/route.ts`
  - `src/lib/planning/v3/news/settings.ts`
  - `src/lib/planning/v3/news/alerts.ts`
  - `tests/planning-v3-news-settings-ui.test.tsx`
  - `tests/planning-v3-news-alerts-ui.test.tsx`
  - `tests/planning-v3-news-alert-rules-api.test.ts`
  - `tests/planning-v3-news-settings-remote-host-api.test.ts`
  - `tests/e2e/news-settings-alert-rules.spec.ts`
  - [가정] dirty/save 의미를 실제로 분리하는 과정에서만 `src/app/api/planning/v3/exposure/profile/route.ts`와 `src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx`를 같이 포함
- 선정 이유:
  - 사용자 영향이 가장 명확합니다. 최근 closeout에서도 `설정 저장`과 `alert rules 적용` 의미가 섞여 보이는 점이 반복 리스크로 남아 있습니다.
  - 검증 세트가 상대적으로 좁습니다. `news/settings` 화면과 관련 API/UI 테스트, 필요 시 해당 e2e 흐름만 보면 됩니다.
  - 다른 축과의 겹침이 적습니다. transactions/accounts 전체 흐름이나 generic route contract를 건드리지 않고도 하나의 저장 의미 문제로 범위를 제한할 수 있습니다.
  - 실패 시 rollback이 쉽습니다. `NewsSettingsClient`와 연관 API 몇 개로 국한되므로, 문제가 생겨도 CSV import, balances, profile/draft 같은 넓은 축을 되돌릴 필요가 없습니다.

## 권장 검증 세트
- 다음 추천 배치 기준 권장 검증:
  - `pnpm test`
    - 이유: alert rules/settings UI 상태, API contract, helper/store 회귀를 가장 좁게 확인할 수 있습니다.
  - `pnpm lint`
    - 이유: `NewsSettingsClient`와 연관 컴포넌트에서 hook/state 분리와 사용자 문구 변경 가능성이 큽니다.
  - `pnpm build`
    - 이유: `src/app/planning/v3/news/*`, `src/app/api/planning/v3/news/*` App Router 경로가 직접 영향을 받습니다.
  - `pnpm e2e:rc`
    - 이유: 저장/적용/재로드 같은 실제 사용자 흐름과 셀렉터 회귀는 unit test만으로 닫히지 않습니다.
- [검증 필요] 로컬 재현 단계에서는 `tests/e2e/news-settings-alert-rules.spec.ts`를 먼저 좁게 쓰는 편이 합리적이지만, 저장소 공식 게이트 표기는 `pnpm e2e:rc`로 남기는 편이 안전합니다.

## 제외한 배치들
- `user-facing page`
  - 제외 이유: 현재 3개 파일만 있어도 `categories/journal/scenarios`라는 별도 사용자 표면 축이며, alert rules 저장 의미와 직접 연결되지 않습니다.
- `API contract`
  - 제외 이유: `categories/journal/routines/scenarios/indicators` route contract 정리는 사용자 영향이 덜 직접적이고, 이번 추천 배치와 합치면 원인 분리가 어려워집니다.
- `store/helper`
  - 제외 이유: 내부 로직/정책 정리 축이라 사용자 체감 이슈와 바로 연결되지 않습니다. 다음 배치에 섞으면 테스트-only 범위를 불필요하게 build/e2e까지 키웁니다.
- `transactions/accounts`
  - 제외 이유: 가장 큰 흐름이며 accounts, imports, balances, drafts, transactions가 한 번에 묶여 있어 이번 라운드 목표인 `가장 작은 1축`과 반대입니다.
- `news/settings` 내부의 비핵심 축
  - 제외 이유: 이번 추천 배치는 `alert rules 저장 의미 정렬`만 다룹니다.
  - 명시적 제외: `digest`, `trends`, `search`, `notes`, `recovery`, `weekly-plan`, `financeNews`, `indicator connector/rootDir`, `newsRefresh CLI`
- 범위 외 전면 제외:
  - `quickstart/home/reports`
  - `runtime/docs/data-sources/ops`

## 검증
- `ls -lt work/3/13 | sed -n '1,12p'`
- `sed -n '1,220p' work/3/13/2026-03-13-single-owner-final-gate-rerun.md`
- `rg -n "planning-v3|planning v3|v3" work/3/12 work/3/13`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-alert-rules-followup-batch-plan.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-settings-alert-rules-post-guard-breakdown.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-transactions-and-user-facing-guard-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-user-facing-guard-alignment-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-accounts-profile-remote-host-contract-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-internal-route-contract-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-drafts-remote-host-and-preview-fallback-closeout.md`
- `git diff --name-only -- 'planning/v3/**' 'src/app/planning/v3/**' 'src/app/api/planning/v3/**' 'src/lib/planning/v3/**' 'tests/planning-v3*' 'tests/e2e/news-settings-alert-rules.spec.ts'`
- `git ls-files --others --exclude-standard -- 'planning/v3/**' 'src/app/planning/v3/**' 'src/app/api/planning/v3/**' 'src/lib/planning/v3/**' 'tests/planning-v3*' 'tests/e2e/news-settings-alert-rules.spec.ts'`
- `git status --porcelain=v1 --untracked-files=all -- planning/v3 src/app/planning/v3 src/app/api/planning/v3 src/lib/planning/v3 tests/planning-v3* tests/e2e/news-settings-alert-rules.spec.ts`
- `git diff --check -- work/3/13/2026-03-13-planning-v3-next-batch-breakdown.md`
- `git status --short -- work/3/13/2026-03-13-planning-v3-next-batch-breakdown.md`

## 미실행 검증
- `pnpm test`
  - 미실행. 이번 라운드는 정적 스캔과 배치 분해만 수행했습니다.
- `pnpm lint`
  - 미실행. 코드 수정이 없었습니다.
- `pnpm build`
  - 미실행. 공유 Next 상태를 쓰는 게이트는 이번 라운드 범위 밖입니다.
- `pnpm e2e:rc`
  - 미실행. 실제 구현 배치를 고른 뒤 메인 에이전트 단독으로 실행하는 편이 맞습니다.

## 이번 라운드 완료 항목
1. `planning-v3` dirty 파일만 다시 추려 범위 외 축과 분리
2. 5개 그룹 기준의 현재 묶음 현황, 예상 검증, 혼합 리스크를 문서화
3. 다음 구현 배치를 `news/settings - alert rules 저장 의미 정렬` 1축으로 고정
4. 나머지 배치와 범위 외 축을 명시적으로 제외

## 남은 리스크
- [추론] 일부 helper/test 파일은 경로 기준으로 먼저 묶었기 때문에, 실제 구현 시작 시 포함 범위를 한 번 더 줄여야 할 수 있습니다.
- `news/settings` 내부에도 `indicators`, `digest`, `search`, `recovery`, `weekly-plan`이 넓게 남아 있어, 추천 배치를 시작할 때 이 축이 다시 커지지 않도록 포함 파일을 엄격히 잠가야 합니다.
- `transactions/accounts`와 `news/settings` 둘 다 user-facing route/API/store를 함께 포함하므로, 다음 라운드에서 파일 선택이 느슨하면 다시 두 큰 축이 섞일 위험이 있습니다.

## 다음 라운드 우선순위
1. `news/settings - alert rules 저장 의미 정렬`
2. 같은 그룹 안에서만 `section-level dirty/status 분리` 여부 재판단
3. `transactions/accounts`는 별도 라운드에서 draft/profile/import/batches를 다시 쪼개기
4. `API contract`, `store/helper`, `user-facing page`는 user-facing 흐름 배치들이 끝난 뒤 후순위로 분리
