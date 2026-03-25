# 12. planning/v3 canonical entity model 정의

작성 기준: `N1 planning/v3 canonical entity model 정의`, 2026-03-17(KST)
범위: `planning/v3` canonical entity / owner / route mapping 정리

---

## 1. 목적

이 문서는 `planning/v3`의 핵심 저장 단위를 route/page/store/service 기준으로 다시 정리해,
다음 사이클의 API, import-export, rollback, beta exposure 논의를 같은 owner 기준에서 진행하기 위한 canonical model 문서입니다.

이번 문서의 목적은 아래 5가지입니다.

1. `planning/v3`에서 무엇이 first-class canonical entity인지 고정한다.
2. 어떤 것은 derived/read model이고 어떤 것은 transient/support artifact인지 분리한다.
3. 각 first-class entity의 owner, key, lifecycle, reader/writer route를 고정한다.
4. `PlannerSnapshot`와 `planning/v3` entity owner 경계를 분리한다.
5. `N2`에서 다시 열어야 할 contract 쟁점을 엔티티 기준으로 넘긴다.

---

## 2. 판정 규칙

### 2.1 first-class canonical entity

아래 4가지를 동시에 만족할 때만 first-class canonical entity로 봅니다.

- 직접 저장된다.
- key 또는 singleton owner가 분명하다.
- 두 개 이상의 route/service가 같은 저장 단위를 읽거나 쓴다.
- lifecycle과 relation을 별도 contract로 다룰 필요가 있다.

### 2.2 derived/read model

아래에 해당하면 derived/read model로 내립니다.

- 다른 owner를 읽어 재계산한다.
- list/detail/table/chart 전용 projection이다.
- 캐시나 summary로 존재해도 canonical write owner가 아니다.

### 2.3 transient/support artifact

아래에 해당하면 transient/support artifact로 본다.

- preview, preflight, checklist, import preview처럼 중간 산출물이다.
- UI 상태 overlay이거나 다운로드용 payload다.
- 저장되더라도 canonical domain owner가 아니라 helper 성격이다.

---

## 3. `PlannerSnapshot`와 v3 경계

### 3.1 stable planning v2 owner

- Prisma schema에 직접 남아 있는 planning canonical owner는 현재 `PlannerSnapshot`이다.
- stable planning profile/apply 흐름은 `src/lib/planning/store/profileStore.ts`와 `PlannerSnapshot` 경계에 남아 있다.
- `planning/v3`는 이 stable owner를 흡수하지 않는다.

### 3.2 planning/v3 current persistence boundary

- 현재 `planning/v3`의 canonical owner 다수는 Prisma가 아니라 file/local store 성격이다.
- 대표 경계:
  - `.data/planning-v3/*`
  - `.data/news/*`
  - `.data/exposure/*`
  - `.data/scenarios/*`

### 3.3 boundary 원칙

- `DraftProfileRecord`는 v3 canonical owner다.
- `DraftProfileRecord`가 apply될 때 생성되는 applied profile은 v3 owner가 아니라 stable planning profile store owner다.
- `PlannerSnapshot`와 `planning/v3` entity를 하나의 canonical aggregate로 합치지 않는다.

---

## 4. first-class canonical entity inventory

## 4.1 Account

- entity name: `Account`
- owner:
  - `src/lib/planning/v3/store/accountsStore.ts`
- primary key:
  - `Account.id`
- lifecycle:
  - 생성
  - 수정
  - 삭제
  - starting balance 관련 보조 필드 수정
- 주요 reader route:
  - `/planning/v3/accounts`
  - `/planning/v3/balances`
  - `/planning/v3/transactions/batches/[id]`
- 주요 writer route:
  - `/planning/v3/accounts`
- 현재 persistence boundary:
  - `.data/planning-v3/accounts.json`
- `N2` contract 쟁점:
  - `startingBalanceKrw`와 별도 `OpeningBalance` owner를 어떻게 정리할지
  - account delete 시 batch/override와 cascade 규칙이 필요한지
  - `kind`, `currency` enum을 stable contract로 잠글지

## 4.2 OpeningBalance

- entity name: `OpeningBalance`
- owner:
  - `src/lib/planning/v3/store/openingBalancesStore.ts`
- primary key:
  - 현재 practical key는 `accountId`
  - `asOfDate`는 record 안에 포함되지만 collection key는 아직 `accountId` 하나뿐이다
- lifecycle:
  - account별 latest opening balance upsert
  - explicit delete lifecycle은 현재 없음
- 주요 reader route:
  - `/planning/v3/balances`
- 주요 writer route:
  - `/planning/v3/balances`
- 현재 persistence boundary:
  - `.data/planning-v3/opening-balances.json`
- `N2` contract 쟁점:
  - multi-date timeline을 first-class로 올릴지
  - `account.startingBalanceKrw`와 canonical owner를 어디로 둘지
  - delete/reset semantics가 필요한지

## 4.3 ImportBatch

- entity name: `ImportBatch`
- owner:
  - `src/lib/planning/v3/store/batchesStore.ts`
  - orchestration service는 `src/lib/planning/v3/service/transactionStore.ts`
- primary key:
  - `ImportBatchMeta.id`
- lifecycle:
  - CSV import로 생성
  - list/detail 조회
  - merge
  - delete
- 주요 reader route:
  - `/planning/v3/batches`
  - `/planning/v3/batches/[id]`
  - `/planning/v3/transactions/batches`
  - `/planning/v3/transactions/batches/[id]`
  - `/planning/v3/profile/draft`
- 주요 writer route:
  - `/planning/v3/import/csv`
  - `/planning/v3/transactions/batches/[id]`
- 현재 persistence boundary:
  - `.data/planning-v3/batches/index.json`
  - `.data/planning-v3/batches/<batchId>.ndjson`
- `N2` contract 쟁점:
  - batch meta와 transaction payload를 같은 export 단위로 묶을지
  - merge/delete의 rollback contract를 어디까지 가질지
  - source metadata와 account list를 batch owner에 얼마나 포함할지

## 4.4 TransactionRecord

- entity name: `TransactionRecord`
- owner:
  - persisted base row는 `src/lib/planning/v3/store/batchesStore.ts`
  - orchestration은 `src/lib/planning/v3/service/transactionStore.ts`
- primary key:
  - `[검증 필요]` current practical key는 `(batchId, txnId)` 조합이다
  - standalone global transaction id는 canonical contract로 고정되지 않았다
- lifecycle:
  - import batch 생성 시 append
  - batch merge 시 재소속 가능
  - base row 자체는 사실상 immutable에 가깝고, user correction은 override family로 덧씌운다
- 주요 reader route:
  - `/planning/v3/batches/[id]`
  - `/planning/v3/transactions/batches/[id]`
  - `/planning/v3/journal`
  - `/planning/v3/profile/draft`
  - `/planning/v3/profile/drafts/[id]/preflight`
- 주요 writer route:
  - `/planning/v3/import/csv`
  - base row 직접 수정 route는 현재 없음
- 현재 persistence boundary:
  - `.data/planning-v3/batches/<batchId>.ndjson`
- `N2` contract 쟁점:
  - global id를 둘지 `(batchId, txnId)`를 유지할지
  - raw imported row와 normalized read model을 분리할지
  - export/import 시 override family를 base row에 merge할지 분리할지

## 4.5 CategoryRule

- entity name: `CategoryRule`
- owner:
  - `src/lib/planning/v3/store/categoryRulesStore.ts`
- primary key:
  - `CategoryRule.id`
- lifecycle:
  - default seed load
  - user rule upsert
  - enabled / priority / note 조정
- 주요 reader route:
  - `/planning/v3/categories/rules`
  - `/planning/v3/batches/[id]`
  - `/planning/v3/transactions/batches/[id]`
  - profile draft generation service
- 주요 writer route:
  - `/planning/v3/categories/rules`
- 현재 persistence boundary:
  - `.data/planning-v3/category-rules.json`
- `N2` contract 쟁점:
  - default rule와 user rule를 같은 collection으로 계속 둘지
  - category taxonomy를 stable enum으로 잠글지
  - priority conflict와 disabled rule serialization을 어떻게 명시할지

## 4.6 TransactionClassificationOverride

- entity name: `TxnOverride`
- owner:
  - `src/lib/planning/v3/store/txnOverridesStore.ts`
- primary key:
  - `(batchId, txnId)`
- lifecycle:
  - upsert
  - delete
  - legacy unscoped override와 batch-scoped override 병행 읽기
- 주요 reader route:
  - `/planning/v3/batches/[id]`
  - `/planning/v3/transactions/batches/[id]`
  - `/planning/v3/profile/draft`
  - `/planning/v3/profile/drafts/[id]`
- 주요 writer route:
  - `/planning/v3/transactions/batches/[id]`
- 현재 persistence boundary:
  - `.data/planning-v3/txn-overrides/<batchId>.json`
  - legacy fallback: `.data/v3/txn-overrides.json`
- `N2` contract 쟁점:
  - legacy unscoped override를 계속 허용할지
  - `category`와 `categoryId` dual field를 어떻게 정리할지
  - override precedence를 rule/default보다 어디에 둘지

## 4.7 TransactionAccountMappingOverride

- entity name: `AccountMappingOverride`
- owner:
  - `src/lib/planning/v3/store/accountMappingOverridesStore.ts`
- primary key:
  - `(batchId, txnId)`
- lifecycle:
  - upsert only
  - account reassignment / `unassigned` 처리
- 주요 reader route:
  - `/planning/v3/transactions/batches/[id]`
  - `/planning/v3/batches/[id]`
- 주요 writer route:
  - `/planning/v3/transactions/batches/[id]`
- 현재 persistence boundary:
  - `.data/planning-v3/txn-account-overrides/<batchId>.json`
- `N2` contract 쟁점:
  - `unassigned`를 reserved value로 계속 둘지
  - account delete/rename와 override의 referential rule을 어떻게 둘지

## 4.8 TransactionTransferOverride

- entity name: `TxnTransferOverride`
- owner:
  - `src/lib/planning/v3/store/txnTransferOverridesStore.ts`
- primary key:
  - `(batchId, txnId)`
- lifecycle:
  - `forceTransfer` 또는 `forceNonTransfer` upsert
- 주요 reader route:
  - `/planning/v3/transactions/batches/[id]`
  - `/planning/v3/batches/[id]`
  - draft generation / balance computation service
- 주요 writer route:
  - `/planning/v3/transactions/batches/[id]`
- 현재 persistence boundary:
  - `.data/planning-v3/txn-transfer-overrides/<batchId>.json`
- `N2` contract 쟁점:
  - automatic transfer detection 결과와 override precedence를 어떻게 고정할지
  - override audit trail을 둘지

## 4.9 CsvDraftRecord

- entity name: `DraftV1`
- owner:
  - `src/lib/planning/v3/drafts/draftStore.ts`
  - route facade는 `src/lib/planning/v3/draft/store.ts`
- primary key:
  - `DraftV1.id`
- lifecycle:
  - import 기반 create
  - list/detail
  - delete
- 주요 reader route:
  - `/planning/v3/drafts`
  - `/planning/v3/drafts/[id]`
  - `/api/planning/v3/draft/preview`
- 주요 writer route:
  - `/planning/v3/import/csv`
  - `/api/planning/v3/drafts`
- 현재 persistence boundary:
  - `.data/planning_v3_drafts/<draftId>.json`
- `N2` contract 쟁점:
  - `DraftV1`와 `V3DraftRecord` preview store를 계속 이중 owner로 둘지
  - import batch와 draft 사이의 referential key를 explicit하게 둘지
  - export/import 시 source/meta/payload를 어느 shape로 잠글지

## 4.10 ProfileDraftRecord

- entity name: `DraftProfileRecord`
- owner:
  - `src/lib/planning/v3/store/draftStore.ts`
- primary key:
  - `DraftProfileRecord.id`
- lifecycle:
  - batch 기준 생성
  - list/detail
  - preflight
  - stable profile apply
  - delete
- 주요 reader route:
  - `/planning/v3/profile/drafts`
  - `/planning/v3/profile/drafts/[id]`
  - `/planning/v3/profile/drafts/[id]/preflight`
- 주요 writer route:
  - `/planning/v3/profile/drafts`
  - `/planning/v3/batches`
  - `/planning/v3/batches/[id]`
  - `/api/planning/v3/profile/drafts`
  - `/api/planning/v3/profile/drafts/[id]/apply`
- 현재 persistence boundary:
  - `.data/planning-v3/drafts/<id>.json`
  - current root dir is shared with `V3DraftRecord` / `DraftProfileRecord`
- `N2` contract 쟁점:
  - profile draft file namespace를 csv preview draft와 분리할지
  - apply 결과를 v3 owner로 둘지 stable profile owner로 둘지
  - `batchId`, evidence, assumptions, stats의 export unit을 어디까지 잠글지

## 4.11 NewsSettings

- entity name: `NewsSettings`
- owner:
  - `planning/v3/news/settings.ts`
  - route facade는 `src/lib/planning/v3/news/settings.ts`
- primary key:
  - singleton document `settings.json`
  - row key는 `source.id`, `topic.id`, `customSource.id`
- lifecycle:
  - source override update
  - topic keyword override update
  - custom source merge
- 주요 reader route:
  - `/planning/v3/news/settings`
  - `/planning/v3/news`
  - `/planning/v3/news/explore`
  - `/planning/v3/news/trends`
- 주요 writer route:
  - `/planning/v3/news/settings`
- 현재 persistence boundary:
  - `.data/news/settings.json` 계열 root
- `N2` contract 쟁점:
  - singleton settings와 row-level override patch를 어떻게 분리할지
  - custom source id governance와 dedupe 규칙
  - effective config merge 결과를 export에 포함할지

## 4.12 NewsAlertRuleOverride

- entity name: `AlertRuleOverride`
- owner:
  - `src/lib/news/alerts.ts`
  - route facade는 `src/lib/planning/v3/news/alerts.ts`
- primary key:
  - singleton override document + `rule.id`
- lifecycle:
  - override read
  - override apply
  - effective rules merge
- 주요 reader route:
  - `/planning/v3/news/settings`
  - `/planning/v3/news/alerts`
- 주요 writer route:
  - `/planning/v3/news/settings#news-settings-alert-rules`
- 현재 persistence boundary:
  - `.data/alerts/rules.override.json` 계열 root (`resolveAlertsDataDir(cwd)`)
- `N2` contract 쟁점:
  - default config(`config/news-alert-rules.json`)와 user override의 경계를 export에서 어떻게 표현할지
  - `rule.id`, `targetType`, `targetId` 안정성을 어떻게 보장할지
  - generated alert event와 override owner를 섞지 않는 규칙

## 4.13 ExposureProfile

- entity name: `ExposureProfile`
- owner:
  - `planning/v3/exposure/store.ts`
  - route facade는 `src/lib/planning/v3/exposure/store.ts`
- primary key:
  - singleton document `profile.json`
- lifecycle:
  - read
  - save overwrite
  - clear
- 주요 reader route:
  - `/planning/v3/exposure`
  - `/planning/v3/news`
  - `/planning/v3/news/settings` [간접]
- 주요 writer route:
  - `/planning/v3/exposure`
- 현재 persistence boundary:
  - `.data/exposure/profile.json`
- `N2` contract 쟁점:
  - singleton schema versioning
  - v3 exposure owner와 shared news helper owner를 어디까지 통합할지
  - partial save / reset contract를 둘지

## 4.14 ScenarioLibraryOverrides

- entity name: `ScenarioLibraryOverrides`
- owner:
  - `planning/v3/scenarios/library.ts`
  - route facade는 `src/lib/planning/v3/scenarios/library.ts`
- primary key:
  - singleton override document + `topicId`
- lifecycle:
  - override read
  - enable/order update
  - effective entry/template merge
- 주요 reader route:
  - `/planning/v3/scenarios`
  - `/planning/v3/news`
- 주요 writer route:
  - `/planning/v3/scenarios`
- 현재 persistence boundary:
  - `.data/scenarios/overrides.json`
- `N2` contract 쟁점:
  - code SSOT(default templates)와 override file을 export/import에서 어떻게 분리할지
  - standalone “scenario draft” entity를 만들지 않고 override collection으로 유지할지
  - `topicId` namespace를 stable contract로 잠글지

## 4.15 current code touchpoint snapshot (2026-03-19 audit)

이번 audit는 아래 축을 다시 읽어 owner 경계와 현재 mixed ownership을 확인했다.

- 직접 재확인한 canonical/bridge store:
  - `src/lib/planning/v3/store/accountsStore.ts`
  - `src/lib/planning/v3/store/openingBalancesStore.ts`
  - `src/lib/planning/v3/store/batchesStore.ts`
  - `src/lib/planning/v3/store/categoryRulesStore.ts`
  - `src/lib/planning/v3/store/draftStore.ts`
  - `src/lib/planning/v3/store/txnOverridesStore.ts`
  - `src/lib/planning/v3/store/accountMappingOverridesStore.ts`
  - `src/lib/planning/v3/store/txnTransferOverridesStore.ts`
  - `src/lib/planning/v3/service/transactionStore.ts`
- 직접 재확인한 projection / facade:
  - `src/lib/planning/v3/service/getBatchSummary.ts`
  - `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`
  - `src/lib/planning/v3/service/aggregateMonthlyCashflow.ts`
  - `src/lib/planning/v3/service/categorizeTransactions.ts`
  - `src/lib/planning/v3/balances/monthly.ts`
  - `src/lib/planning/v3/transactions/store.ts`
  - `src/lib/planning/v3/batches/store.ts`
  - `src/lib/planning/v3/draft/store.ts`
- 직접 재확인한 API touchpoint:
  - `/api/planning/v3/accounts`
  - `/api/planning/v3/opening-balances`
  - `/api/planning/v3/categories/rules`
  - `/api/planning/v3/batches`
  - `/api/planning/v3/batches/[id]/summary`
  - `/api/planning/v3/balances/monthly`
  - `/api/planning/v3/drafts`
  - `/api/planning/v3/profile/drafts`
  - `/api/planning/v3/transactions/batches/[id]`
  - `/api/planning/v3/news/settings`
- owner file 또는 facade만 재확인한 범위:
  - `planning/v3/news/settings.ts`
  - `planning/v3/exposure/store.ts`
  - `planning/v3/scenarios/library.ts`
  - `planning/v3/journal/store.ts`
  - `src/lib/planning/v3/profiles/store.ts`
- `2026-03-19` 시점에는 `[미확인]`이었던 `NewsAlertRuleOverride` actual owner(`src/lib/news/alerts.ts`)는 `2026-03-25` resync audit에서 다시 확인했다.

### 4.15.1 canonical write owner

- `Account`
  - `accountsStore.ts`가 현재 canonical write owner로 맞고, `/api/planning/v3/accounts`도 직접 이 store를 읽고 쓴다.
  - 다만 store 내부에는 legacy fallback read path(`.data/v3/accounts/accounts.json`)가 남아 있어 pure single-store 상태는 아니다.
- `OpeningBalance`
  - `openingBalancesStore.ts`와 `/api/planning/v3/opening-balances`가 바로 연결되어 있어 문서와 코드가 맞는다.
  - current collection key가 사실상 `accountId` 하나뿐이라는 점도 코드와 일치한다.
- `CategoryRule`
  - `categoryRulesStore.ts`와 `/api/planning/v3/categories/rules`가 직접 연결되어 있다.
  - default seed와 user rule가 같은 collection(`category-rules.json`)에 함께 merge되는 구현이 이미 코드에 있다.
- `TransactionAccountMappingOverride`
  - `accountMappingOverridesStore.ts`가 batch-scoped write owner로 clean하게 동작한다.
- `TransactionTransferOverride`
  - `txnTransferOverridesStore.ts`가 batch-scoped write owner로 clean하게 동작한다.
- `NewsSettings`
  - `planning/v3/news/settings.ts`에서 singleton settings file을 직접 읽고 쓰고, `/api/planning/v3/news/settings`는 그 facade를 그대로 사용한다.
- `ExposureProfile`
  - `planning/v3/exposure/store.ts`가 singleton `profile.json` owner로 구현돼 있다.
- `ScenarioLibraryOverrides`
  - `planning/v3/scenarios/library.ts`가 override file owner와 effective merge를 함께 담당한다.
- `JournalEntry`
  - `planning/v3/journal/store.ts`가 entry file owner로 구현돼 있다.

### 4.15.2 derived projection / read model

- `getBatchSummary.ts`
  - batch summary projection이지만 현재는 legacy `readBatchTransactions()`와 canonical `getBatchTransactions()`를 모두 비교해 더 긴 쪽을 고르는 dual-read 구현이다.
- `generateDraftPatchFromBatch.ts`
  - profile draft patch 생성은 projection/service이며, 현재 batch read는 legacy `readBatchTransactions()`를 직접 사용한다.
- `aggregateMonthlyCashflow.ts`, `categorizeTransactions.ts`
  - canonical owner가 아니라 transaction + rule + override를 재계산하는 projection이다.
- `balances/monthly.ts`와 `/api/planning/v3/balances/monthly`
  - 월별 잔액은 opening balance + account + override + batch transaction을 합성한 read model이다.
  - 현재 route는 stored batch가 있으면 우선 쓰고, 없으면 legacy transaction store를 fallback으로 읽는다.
- `/api/planning/v3/batches/[id]/summary`, `/api/planning/v3/batches`, `/api/planning/v3/transactions/batches/[id]`
  - 모두 canonical write owner 자체가 아니라 list/detail/summary projection facade다.

### 4.15.3 legacy bridge / compatibility layer

- `src/lib/planning/v3/service/transactionStore.ts`
  - 문서상 orchestration service로 적혀 있지만, 실제로는 `.data/v3/transactions/batches.ndjson`, `.data/v3/transactions/records.ndjson`를 직접 읽고 쓰는 legacy persistence bridge다.
- `src/lib/planning/v3/batches/store.ts`
  - canonical batch store facade이면서 동시에 `listLegacyBatches()`를 re-export해 legacy 목록과 stored 목록을 함께 노출한다.
- `src/lib/planning/v3/draft/store.ts`
  - legacy csv draft(`../drafts/draftStore`)와 profile draft(`../store/draftStore`)를 한 facade에서 같이 re-export한다.
- `src/lib/planning/v3/store/txnOverridesStore.ts`
  - batch-scoped canonical write owner이지만, legacy unscoped fallback read와 `listLegacyOverrides()` bridge helper를 같은 module 안에 유지한다.

### 4.15.4 unresolved / mixed ownership

- `ImportBatch` / `TransactionRecord`
  - write path는 `importCsvToBatch() -> saveBatch() -> batchesStore.ts`로 canonical owner가 생겼다.
  - 하지만 `/api/planning/v3/batches`, `/api/planning/v3/batches/[id]/summary`, `/api/planning/v3/transactions/batches/[id]`, `getBatchSummary.ts`, `balances/monthly.ts`는 아직 legacy/store dual-read를 유지해 read ownership이 완전히 닫히지 않았다.
- `CsvDraftRecord` / `ProfileDraftRecord`
  - csv draft는 `src/lib/planning/v3/drafts/draftStore.ts`의 `.data/planning_v3_drafts/*.json`를 쓰고, profile draft는 `src/lib/planning/v3/store/draftStore.ts`의 `.data/planning-v3/drafts/*.json`를 쓴다.
  - route facade `src/lib/planning/v3/draft/store.ts`가 두 family를 같은 진입점으로 노출해 current owner boundary가 mixed 상태다.
- `DraftProfileRecord -> stable applied profile`
  - `src/lib/planning/v3/profiles/store.ts`는 stable `profileStore` facade만 노출한다.
  - 즉 v3 owner는 draft 단계에서 끝나고, apply 결과 owner는 여전히 stable planning v2 쪽이다.

### 4.15.5 문서와 실제 코드가 어긋나는 지점

- `ImportBatch`, `TransactionRecord`
  - 문서상 `transactionStore.ts`를 orchestration service로만 적어 두었지만, 실제 코드는 legacy persistence bridge 역할도 함께 가진다.
  - 따라서 current read ownership은 `batchesStore.ts` 단독이 아니라 `batchesStore.ts + transactionStore.ts` 혼합 상태로 보는 편이 정확하다.
- draft family
  - section 4 inventory에서는 `CsvDraftRecord`, `ProfileDraftRecord`를 따로 적었지만, 실제 route facade는 두 family를 같은 `src/lib/planning/v3/draft/store.ts`에서 동시에 노출한다.
  - `N2` 후속에서는 route contract보다 먼저 draft namespace와 export/import 단위를 다시 분리해야 한다.
- batch projection surface
  - `getBatchSummary.ts`, `generateDraftPatchFromBatch.ts`, `/api/planning/v3/balances/monthly`, `/api/planning/v3/transactions/batches/[id]`는 여전히 legacy read helper와 stored read helper를 병행 사용한다.
  - owner 정리는 write store만 보는 것으로 끝나지 않고, read projection에서 legacy bridge를 언제 끊을지까지 함께 다뤄야 한다.
- override family
  - 2026-03-19 `N2 legacy override boundary hardening` 이후 user-facing read path는 `getOverrides(batchId)`만 쓰도록 정리됐다.
  - 다만 `txnOverridesStore.ts` 내부에는 legacy unscoped bridge helper가 남아 있어 owner module 자체는 아직 pure canonical store로 완전히 닫히지 않았다.

### 4.16 current-state resync audit (2026-03-25)

`2026-03-19` snapshot을 current code와 다시 대조했을 때, canonical entity 분류의 큰 틀은 유지되지만 일부 touchpoint 설명은 stale 상태로 남아 있었다.

- still-valid owner boundary
  - `Account`, `OpeningBalance`, `ImportBatch`, `TransactionRecord`, `TxnOverride`, `AccountMappingOverride`, `TxnTransferOverride`, `DraftProfileRecord`, `NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile`, `ScenarioLibraryOverrides`를 first-class canonical owner로 두는 큰 분류는 여전히 유효하다.
  - first-class canonical entity / derived-read model / transient-support artifact 분리도 current code 기준으로 계속 유효하다.
  - `PlannerSnapshot`, stable planning profile owner, `planning/v3` owner를 같은 aggregate로 합치지 않는 boundary도 그대로 유지된다.
  - `DraftProfileRecord -> stable applied profile` handoff가 v3 owner 내부 완료가 아니라 stable `profileStore` bridge라는 판단도 그대로 유효하다.

- canonical entity current-state drift map
  - `NewsAlertRuleOverride`
    - `src/lib/news/alerts.ts`를 다시 읽어 actual owner 구현을 확인했다.
    - override owner는 `resolveAlertsDataDir(cwd)/rules.override.json` 단일 문서이고, alert event state는 별도 support artifact 경계다.
    - 따라서 section 4.12의 persistence boundary는 `.data/news/alerts/...`가 아니라 `.data/alerts/...` 계열 root로 보는 편이 current code와 맞다.
  - batch projection touchpoint
    - section 4.15.2의 `generateDraftPatchFromBatch.ts` legacy direct read 설명은 stale하다.
    - current code는 `loadStoredFirstBatchTransactions()` + `applyStoredFirstBatchAccountBinding()` 경로를 사용해 stored-first visible binding view를 draft generation 입력으로 쓴다.
    - section 4.15.2의 `getBatchSummary.ts` dual-read 설명도 stale하다.
    - current code는 `loadStoredFirstBatchTransactions()` + `getStoredFirstBatchSummaryProjectionRows()` 경로를 summary projection source-of-truth로 쓴다.

- stale or `[검증 필요]` section
  - `ImportBatch` / `TransactionRecord` read ownership은 여전히 unresolved다.
  - writer owner는 `saveBatch()` / `batchesStore.ts` 쪽으로 좁아졌지만, `transactions/store.ts`는 stored-first reader facade와 legacy bridge를 함께 품고 있다.
  - `CsvDraftRecord` / `ProfileDraftRecord` family facade도 여전히 unresolved다.
  - `src/lib/planning/v3/draft/store.ts`가 두 family를 같은 진입점으로 노출하고, `src/lib/planning/v3/store/draftStore.ts`는 `planning-v3/drafts` root와 legacy `v3/drafts` fallback을 함께 읽는다.
  - `[검증 필요]` `NewsAlertRuleOverride`는 owner 구현 자체는 확인됐지만, default config, override document, generated alert event, namespaced event-state를 export/rollback 단위로 어디까지 묶을지는 여전히 `N2` 범위다.

- current smallest viable next `N1` candidate
  - broad canonical rewrite가 아니라 `draft family owner-sync question`이 가장 작다.
  - 즉 `CsvDraftRecord` / `V3DraftRecord` / `DraftProfileRecord`를 separate first-class owner로 계속 둘지, shared facade와 shared-dir/legacy fallback을 어떤 boundary memo로 잠글지부터 다시 좁히는 cut이 적절하다.
  - 이 cut은 owner / key / lifecycle / adjacent stable bridge만 다루고, `N2` API/import-export/rollback 구현이나 batch command/read contract 재설계를 열지 않는다.

- 비범위
  - `N2` API / import-export / rollback 구현
  - route 추가/삭제 또는 visibility policy 변경
  - planning stable/public surface UI reopen
  - import/export semantics 변경
  - rollback/repair semantics 변경

- 왜 지금 바로 `N2` 구현 또는 broad rewrite가 위험한가
  - batch read ownership과 draft family facade 경계가 아직 mixed 상태라, 구현부터 열면 writer owner / reader facade / legacy bridge 기준이 다시 함께 흔들릴 수 있다.
  - current code는 stored-first narrowing이 꽤 진행됐지만 pure canonical merge가 끝난 것은 아니므로, 지금은 narrower owner-sync memo가 broad rewrite보다 안전하다.

### 4.17 draft family owner-sync question candidate memo audit (2026-03-25)

- draft family current-state owner map
  - `CsvDraftRecord (DraftV1)`
    - actual writer owner는 `src/lib/planning/v3/drafts/draftStore.ts`다.
    - current persistence boundary는 `.data/planning_v3_drafts/<draftId>.json`이다.
    - `/api/planning/v3/drafts`와 `/api/planning/v3/drafts/[id]`는 facade를 거치지 않고 이 owner를 직접 읽고 쓴다.
    - current create path도 `saveDraftFromImport() -> drafts/draftStore.createDraft()`로 닫혀 있어, current user-facing CRUD는 `DraftV1` family 단독으로 읽는 편이 맞다.
  - `V3DraftRecord`
    - current code에는 `src/lib/planning/v3/store/draftStore.ts` 안의 persisted draft shape로 남아 있다.
    - current persistence boundary는 `.data/planning-v3/drafts/<id>.json`이고, same module은 legacy fallback `.data/v3/drafts/<id>.json`도 함께 읽는다.
    - 하지만 current `/api/planning/v3/drafts*`나 `/api/planning/v3/profile/drafts*`는 이 shape를 standalone owner route로 직접 노출하지 않는다.
    - current direct consumer는 support route `/api/planning/v3/draft/preview` 쪽이며, 여기서는 `getProfileDraftBridge()` 결과를 `V3DraftRecord` bridge row처럼 읽는다.
  - `DraftProfileRecord`
    - actual writer owner도 `src/lib/planning/v3/store/draftStore.ts`다.
    - same module / same root 안에서 `createDraftFromBatch()`, `listProfileDrafts()`, `getProfileDraft()`, `deleteProfileDraft()`를 통해 다뤄진다.
    - `/api/planning/v3/profile/drafts`, `/api/planning/v3/profile/drafts/[id]`, `/api/planning/v3/profile/drafts/[id]/preflight`는 current code 기준으로 이 family를 직접 읽고 쓴다.
  - `src/lib/planning/v3/draft/store.ts`
    - current code에서 이 module은 standalone persistence owner가 아니라 shared alias/compat facade다.
    - csv draft re-export, profile draft re-export, preview/apply compatibility alias를 같은 entrypoint에 모아 두지만, canonical owner 자체를 새로 만들지는 않는다.

- current API owner map
  - `/api/planning/v3/drafts`
    - `DraftV1` list/read + import-origin save route다.
  - `/api/planning/v3/drafts/[id]`
    - `DraftV1` detail/delete route다.
  - `/api/planning/v3/profile/drafts`
    - `DraftProfileRecord` create-from-batch/list route다.
  - `/api/planning/v3/profile/drafts/[id]`
    - `DraftProfileRecord` detail/delete route다.
  - `/api/planning/v3/profile/drafts/[id]/preflight`
    - `DraftProfileRecord` + stable profile store owner를 함께 읽는 support route다.
  - `/api/planning/v3/profile/drafts/[id]/apply`
    - `DraftProfileRecord`를 stable profile owner로 handoff하는 bridge route다.
  - `/api/planning/v3/draft/preview`
    - standalone owner route가 아니라 support bridge route다.
    - `getProfileDraftBridge()`로 `store/draftStore.ts` 쪽 row를 읽고, 없으면 `getLegacyDraft()`로 `DraftV1` row를 읽어 preview shape로 정규화한다.

- still-valid boundary
  - `DraftV1`와 `DraftProfileRecord`를 separate first-class owner family로 두는 큰 분류는 여전히 유효하다.
  - `src/lib/planning/v3/draft/store.ts`를 shared facade로 보고, 이것을 third canonical owner로 승격하지 않는 reading도 current code와 맞다.
  - `DraftProfileRecord -> stable applied profile` handoff가 v3 owner 내부 완료가 아니라 stable profile bridge라는 경계도 그대로 유지된다.
  - `docs/current-screens.md` 기준 stable `/planning*` route와 beta `/planning/v3/*` route SSOT는 이 draft family owner map과 충돌하지 않는다.

- mixed or `[검증 필요]` boundary
  - `src/lib/planning/v3/store/draftStore.ts`는 `V3DraftRecord`와 `DraftProfileRecord`를 같은 module / same root / same legacy fallback 경계 안에 둔다.
  - 따라서 module path만 보면 preview-style draft row와 profile draft row를 즉시 구분하기 어렵다.
  - `V3DraftRecord`는 current code에 persisted shape로 남아 있지만, current user-facing owner route family는 `DraftV1`나 `DraftProfileRecord`처럼 뚜렷하지 않다.
  - `[검증 필요]` current `V3DraftRecord`를 first-class owner로 계속 둘지, preview/apply compatibility bridge document로 더 낮춰 읽을지는 다음 owner-sync memo에서 더 좁혀야 한다.
  - `/api/planning/v3/drafts/[id]/create-profile`는 current code에서 `EXPORT_ONLY` guard를 반환하므로, active stable profile write route로 읽으면 안 된다. 이 route의 final contract 분류는 여전히 `N2` 범위다.

- current smallest viable next `N1` candidate
  - broad draft-family merge가 아니라 `V3DraftRecord bridge-only status / shared-facade wording split memo`가 가장 작다.
  - 즉 `DraftV1`와 `DraftProfileRecord`는 first-class owner로 유지하되, `V3DraftRecord`와 `src/lib/planning/v3/draft/store.ts`를 canonical owner가 아니라 bridge/facade layer로 어디까지 내려 읽을지부터 문서로 더 좁히는 cut이 적절하다.

- 비범위
  - `N2` API / import-export / rollback 구현
  - draft route 추가/삭제
  - preview / preflight 계산식 변경
  - stable profile apply semantics 변경
  - beta exposure / visibility policy 변경

- 왜 여기서 곧바로 `N2` 구현이나 broad draft-family merge로 가면 위험한가
  - current API surface는 이미 `DraftV1` family와 `DraftProfileRecord` family로 상당 부분 갈라져 있는데, module/root/bridge layer만 여전히 섞여 있다.
  - 이 상태에서 broad merge를 먼저 열면 preview support shape, stable apply bridge, export/rollback boundary를 한 번에 다시 정의해야 해서 `N1`보다 `N2` 구현 질문이 먼저 커질 수 있다.

### 4.18 `V3DraftRecord` bridge-only status / shared-facade wording split memo audit (2026-03-25)

- `V3DraftRecord` current-state role map
  - `src/lib/planning/v3/store/draftStore.ts` 안의 `V3DraftRecord`는 current code에 persisted shape로 남아 있다.
  - 다만 current route surface에서는 `DraftV1`나 `DraftProfileRecord`처럼 standalone first-class owner family로 닫히지 않는다.
  - `/api/planning/v3/draft/preview`는 `getProfileDraftBridge()` 결과를 먼저 읽고, 없으면 `getLegacyDraft()` 결과를 `toPreviewDraft()`로 정규화해 같은 preview shape로 합친다.
  - 따라서 current `V3DraftRecord`는 route owner라기보다 preview/apply compatibility bridge document로 읽는 편이 current code와 맞다.
  - `/api/planning/v3/drafts/[id]/create-profile`는 current code에서 `EXPORT_ONLY` 409만 반환하므로, active write owner route가 아니라 parked/support compat contract로 읽어야 한다.

- shared-facade wording boundary
  - `src/lib/planning/v3/draft/store.ts` 전체 module은 canonical owner가 아니라 shared alias/compat facade로 적는 편이 맞다.
  - 같은 facade 안에서도 wording을 나눠 적어야 한다.
  - `createDraft*`, `listDrafts`, `getDraft`/`getLegacyDraft` 계열은 `DraftV1` owner re-export다.
  - `createDraftFromBatch`, `listProfileDrafts`, `getProfileDraft`, `deleteProfileDraft` 계열은 `DraftProfileRecord` owner re-export다.
  - `getPreviewDraft`, `getProfileDraftBridge`는 owner re-export가 아니라 preview/apply compatibility bridge alias다.
  - 즉 이 module을 third canonical owner facade처럼 적으면 안 되고, owner re-export와 bridge alias가 공존하는 shared entrypoint라고 잠가야 한다.

- still-valid boundary
  - `DraftV1` writer owner는 계속 `src/lib/planning/v3/drafts/draftStore.ts`다.
  - `DraftProfileRecord` writer owner는 계속 `src/lib/planning/v3/store/draftStore.ts`다.
  - `DraftProfileRecord -> stable profile owner` handoff는 여전히 adjacent stable bridge이며, `V3DraftRecord` preview shape와 같은 owner로 섞어 읽지 않는다.
  - `docs/current-screens.md` 기준 stable `/planning*` route와 beta `/planning/v3/*` route SSOT는 이 bridge/facade reading과 충돌하지 않는다.

- mixed or `[검증 필요]` boundary
  - `src/lib/planning/v3/store/draftStore.ts`는 여전히 `V3DraftRecord`와 `DraftProfileRecord`를 같은 module / same root / same legacy fallback 경계 안에 둔다.
  - 따라서 persisted file root나 module path만 보면 preview bridge row와 profile draft owner row를 즉시 구분하기 어렵다.
  - `[검증 필요]` 후속 `N1`에서 더 좁힐 질문은 `V3DraftRecord`를 owner로 승격할지 여부가 아니라, same-root dual-shape persistence를 문서상 어떻게 더 분리해 둘지다.
  - `[검증 필요]` `/api/planning/v3/profile/drafts/[id]/apply`와 parked `/api/planning/v3/drafts/[id]/create-profile`를 stable profile bridge family 안에서 어디까지 같은 retention window로 볼지는 여전히 `N2` contract 범위다.

- current smallest viable next `N1` candidate
  - broad draft-family merge나 `N2` 구현이 아니라 `store/draftStore.ts same-root dual-shape persistence boundary memo`가 가장 작다.
  - 즉 `V3DraftRecord` bridge-only reading은 유지한 채, `planning-v3/drafts` root 안에서 preview bridge row와 `DraftProfileRecord` owner row를 문서상 어떤 retention boundary로 갈라 둘지만 더 좁게 잠그는 cut이 적절하다.

- 비범위
  - 실제 구현 코드 변경
  - `DraftV1` writer owner 변경
  - `DraftProfileRecord` writer owner 변경
  - draft route 추가/삭제
  - preview / preflight 계산식 변경
  - `N2` API / import-export / rollback 구현

- 왜 여기서 broad draft-family merge나 `N2` 구현으로 가면 위험한가
  - current code는 route family owner와 preview/apply bridge 해석을 좁게 분리하면 설명 가능한 상태인데, broad merge를 열면 persisted root, export unit, stable handoff contract를 한 번에 다시 정의해야 한다.
  - 특히 `create-profile`는 parked contract이고 `apply`는 adjacent stable owner bridge이므로, 둘을 같은 active writer queue로 다시 묶으면 현재 code truth보다 계약이 먼저 커진다.

### 4.19 `store/draftStore.ts` same-root dual-shape persistence-boundary memo audit (2026-03-25)

- `store/draftStore.ts` same-root dual-shape map
  - `resolveDraftsDir()`는 current primary root를 `.data/planning-v3/drafts`로 잡고, `PLANNING_V3_DRAFTS_DIR` override가 있으면 그 경로를 우선한다.
  - `resolveLegacyDraftsDir()`는 legacy fallback root를 `.data/v3/drafts`로 고정한다.
  - `resolveDraftPath(id)`는 current primary root 아래 `<sanitizeRecordId(id)>.json` 단일 path template를 만든다.
  - `createDraft()`와 `createDraftFromBatch()`는 둘 다 이 same `resolveDraftPath(id)`를 써서 current primary root 안에 기록한다.
  - `listDraftFiles()`는 primary root와 legacy root 양쪽의 `.json` 파일을 전부 모으고, dedupe 기준도 record id나 shape가 아니라 full file path다.
  - `readAllDrafts()`는 위 file list를 `readDraftFromPath()`로 읽어 `V3DraftRecord`로 normalize되는 row만 남긴다.
  - `listProfileDrafts()`도 같은 file list를 쓰지만 `readProfileDraftFromPath()`로 읽어 `DraftProfileRecord`로 normalize되는 row만 남긴다.
  - `getDraft()` / `getProfileDraft()`는 같은 sanitized id에 대해 primary path를 먼저 읽고, 없을 때만 legacy fallback path를 읽는다.
  - `deleteDraft()` / `deleteProfileDraft()`도 primary + legacy target array를 같은 순서로 순회하며 지운다.

- route meaning split on top of same root
  - `/api/planning/v3/draft/preview`는 same root/fallback를 `getProfileDraftBridge()` -> `V3DraftRecord` normalizer 경로로 소비하는 support bridge route다.
  - `/api/planning/v3/profile/drafts`와 `/api/planning/v3/profile/drafts/[id]`는 같은 root/fallback를 `DraftProfileRecord` normalizer 경로로 소비하는 owner route다.
  - 즉 current code에서 route meaning은 디렉터리 이름으로 갈리는 것이 아니라, 같은 file pool을 어떤 normalizer와 어떤 route contract가 읽느냐로 갈린다.

- still-valid owner boundary
  - `DraftV1` writer owner는 계속 `src/lib/planning/v3/drafts/draftStore.ts`다.
  - `DraftProfileRecord` writer owner는 계속 `src/lib/planning/v3/store/draftStore.ts`다.
  - `V3DraftRecord`는 current route surface 기준 standalone owner family가 아니라 preview bridge row로 읽는 편이 맞다.
  - `DraftProfileRecord -> stable profile owner` handoff는 same root issue와 별개로 adjacent stable bridge로 남는다.
  - `docs/current-screens.md` 기준 stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 persistence-boundary memo와 충돌하지 않는다.

- mixed or `[검증 필요]` persistence boundary
  - current primary root와 legacy fallback root는 shape별 namespace를 따로 두지 않으므로, persisted file root만 보고 owner를 추론하면 다시 섞여 읽힌다.
  - same module path `src/lib/planning/v3/store/draftStore.ts`도 `V3DraftRecord`와 `DraftProfileRecord` reader/writer를 함께 담고 있어 module path만으로 owner를 분리하기 어렵다.
  - same `<id>.json` path template를 두 shape가 공용으로 쓰므로, current code의 실질 경계는 path가 아니라 normalizer와 route meaning이다.
  - `[검증 필요]` primary root와 legacy root에 같은 sanitized id가 동시에 있을 때, `listDraftFiles()`는 file path 기준으로 둘 다 노출할 수 있지만 `getDraft()` / `getProfileDraft()`는 primary-first precedence를 사용한다.
  - `[검증 필요]` 따라서 same-id dual presence가 생기면 list/detail/delete가 서로 다른 precedence를 암묵적으로 가질 수 있는데, 이 경계는 아직 문서상 따로 잠겨 있지 않다.

- current smallest viable next `N1` candidate
  - broad draft-family merge나 `N2` 구현이 아니라 `primary-vs-legacy same-id duplicate precedence memo`가 가장 작다.
  - 즉 same root dual-shape 자체를 재설계하지 않고, same-id dual presence가 생길 때 list/detail/delete가 어떤 precedence로 읽히는지를 docs-first로 먼저 잠그는 cut이 적절하다.

- 비범위
  - 실제 구현 코드 변경
  - `DraftV1` writer owner 변경
  - `DraftProfileRecord` writer owner 변경
  - `V3DraftRecord` standalone canonical owner 승격
  - draft route 추가/삭제
  - preview / preflight 계산식 변경
  - `N2` API / import-export / rollback 구현

- 왜 여기서 broad draft-family merge나 `N2` 구현으로 가면 위험한가
  - current code는 same root를 공유해도 route meaning과 normalizer로 owner를 분리해 읽고 있는데, broad merge를 열면 file namespace, list/detail precedence, stable apply bridge, export/rollback unit을 한 번에 다시 정의해야 한다.
  - 특히 지금 바로 merge를 열면 dual-shape coexistence와 primary-vs-legacy precedence처럼 더 작은 current-state 질문이 묻히고, `N1` memo보다 큰 `N2` contract 문제로 바로 커질 수 있다.

### 4.20 `primary-vs-legacy` same-id duplicate precedence memo audit (2026-03-25)

- same-id duplicate precedence map
  - list surface
    - `listDraftFiles()`는 full file path 기준으로만 dedupe하므로, same sanitized id가 current primary root와 legacy root에 동시에 있으면 두 file path를 모두 남긴다.
    - `readAllDrafts()`와 `listProfileDrafts()`는 이 file list를 shape normalizer에 각각 태우므로, 두 파일이 모두 같은 shape로 normalize되면 same id row가 둘 다 살아남을 수 있다.
    - list 단계에는 same-id collapse나 primary-first winner selection이 없다.
    - final list order는 `createdAt` desc + id tie-break 기준이므로, same-id duplicate는 root precedence보다 createdAt 차이에 더 크게 영향을 받는다.
    - `[검증 필요]` same id와 same `createdAt`까지 겹치면 comparator가 `0`을 반환하므로, 어떤 root row가 먼저 보일지는 code 자체의 명시 규칙이라기보다 sort stability에 기대게 된다.
  - detail surface
    - `getDraft()`와 `getProfileDraft()`는 같은 sanitized id에 대해 current primary path를 먼저 읽고, 그 read/normalize 결과가 `null`일 때만 legacy fallback path를 읽는다.
    - 따라서 detail precedence는 "primary file exists"가 아니라 "primary valid row first, then legacy valid row"로 읽는 편이 맞다.
  - delete surface
    - `deleteDraft()`와 `deleteProfileDraft()`는 primary + legacy target array를 끝까지 순회하며 `unlink`를 시도한다.
    - 즉 delete 자체는 first-hit precedence가 아니라 dual-target sweep semantics에 가깝다.
    - 다만 `/api/planning/v3/profile/drafts/[id]` DELETE는 먼저 `getProfileDraft(id)`로 existence gate를 거치므로, user-visible delete flow는 primary-valid-first detail precedence를 먼저 따르고 그 다음 양쪽 파일을 함께 지운다.
  - route consumer split
    - `/api/planning/v3/draft/preview`는 `getProfileDraftBridge()`를 통해 same-id duplicate 중 primary-valid `V3DraftRecord`를 먼저 읽고, 없을 때만 legacy valid row를 읽는다.
    - `/api/planning/v3/profile/drafts/[id]`, `/api/planning/v3/profile/drafts/[id]/preflight`, `/api/planning/v3/profile/drafts/[id]/apply`도 모두 `getProfileDraft()`를 거치므로 같은 primary-valid-first detail precedence를 공유한다.
    - 반면 `/api/planning/v3/profile/drafts` list route는 duplicate same-id row를 collapse하지 않고 그대로 surface할 수 있다.

- still-valid boundary
  - `DraftV1` writer owner는 계속 `src/lib/planning/v3/drafts/draftStore.ts`다.
  - `DraftProfileRecord` writer owner는 계속 `src/lib/planning/v3/store/draftStore.ts`다.
  - `V3DraftRecord`는 current route surface 기준 standalone owner family가 아니라 preview bridge row로 읽는 편이 맞다.
  - stable `/planning*` route와 beta `/planning/v3/*` route SSOT는 이 precedence memo와 충돌하지 않는다. precedence 이슈는 beta draft-family reader surface 내부에 머문다.

- mixed or `[검증 필요]` precedence boundary
  - same-id dual presence가 생기면 list는 duplicate row를 둘 다 보여 줄 수 있지만, detail/preflight/apply/preview는 primary-valid single row만 고른다.
  - 따라서 list/detail/delete는 같은 duplicate set에 대해 서로 다른 암묵 precedence를 가질 수 있다.
  - primary file이 존재해도 normalizer를 통과하지 못하면 legacy row가 detail winner가 될 수 있으므로, precedence는 root 존재 여부보다 shape validity에 더 민감하다.
  - delete는 detail winner 한 개만 지우는 것이 아니라 primary/legacy 양쪽 target을 함께 지우므로, detail에서 보이지 않은 shadow duplicate까지 함께 사라질 수 있다.
  - `[검증 필요]` current docs는 same-id dual presence 자체를 operator-facing anomaly로 볼지, beta route가 그대로 노출할 수 있는 visible duplicate state로 볼지를 아직 따로 잠그지 않았다.

- current smallest viable next `N1` candidate
  - broad draft-family merge나 `N2` 구현이 아니라 `profile/drafts duplicate-id list exposure memo`가 가장 작다.
  - 즉 same-id duplicate가 current beta owner list route에서 실제로는 "둘 다 보일 수 있는 상태"인지, 아니면 operator/historical anomaly로만 읽어야 하는지부터 docs-first로 더 좁게 잠그는 cut이 적절하다.

- 비범위
  - 실제 구현 코드 변경
  - `DraftV1` writer owner 변경
  - `DraftProfileRecord` writer owner 변경
  - `V3DraftRecord` owner status 재정의 구현
  - draft route 추가/삭제
  - preview / preflight 계산식 변경
  - `N2` API / import-export / rollback 구현

- 왜 여기서 broad draft-family merge나 `N2` 구현으로 가면 위험한가
  - current code는 duplicate same-id에 대해 list/detail/delete가 이미 서로 다른 읽기/삭제 semantics를 갖는데, broad merge를 열면 이 차이를 설명하기 전에 namespace 정리나 export/rollback 규칙부터 다시 정의하게 된다.
  - 지금은 same-id duplicate가 어떤 surface에서 visible state인지, 어떤 surface에서 support anomaly인지부터 문서로 잠그는 편이 더 작고 안전하다.

### 4.21 `profile/drafts` duplicate-id list-exposure memo audit (2026-03-25)

- `profile/drafts` duplicate-id list exposure map
  - `/api/planning/v3/profile/drafts` GET은 `listProfileDrafts()` 결과를 duplicate collapse 없이 그대로 `data[]`에 매핑한다.
  - `/planning/v3/profile/drafts` page는 `ProfileDraftsListClient`를 통해 이 API를 직접 fetch하고, 응답 row를 추가 dedupe 없이 table row로 그린다.
  - client는 `row.draftId`를 table `key`, `data-testid`, detail href(`/planning/v3/profile/drafts/${draftId}`), delete target id에 공통으로 쓴다.
  - 따라서 same-id duplicate가 API payload에 들어오면 current beta page에도 literal duplicate row로 새어 나올 수 있다.
  - 반대로 `/api/planning/v3/profile/drafts/[id]`, `/api/planning/v3/profile/drafts/[id]/preflight`, `/api/planning/v3/profile/drafts/[id]/apply`는 모두 single `draftId`를 route param으로 받고 `getProfileDraft()` winner 한 개만 읽는다.

- still-valid boundary
  - `/planning/v3/profile/drafts`와 `/planning/v3/profile/drafts/[id]`는 `docs/current-screens.md` 기준 계속 `Public Beta` route다.
  - `DraftProfileRecord` writer owner는 계속 `src/lib/planning/v3/store/draftStore.ts`다.
  - current create path `createDraftFromBatch()`는 new UUID 기반 id를 primary root에 기록하므로, same-id duplicate는 steady-state writer flow가 아니라 primary/legacy historical coexistence class에 더 가깝다.
  - detail/preflight/apply가 single-row primary-valid-first precedence를 공유한다는 boundary도 그대로 유지된다.

- mixed or `[검증 필요]` exposure boundary
  - current list route/page는 duplicate row를 literal하게 surface할 수 있으므로, exposure 자체는 "불가능"이 아니다.
  - 하지만 list UI는 `draftId` uniqueness를 전제한 row key / href / delete target wiring을 사용하므로, same-id duplicate를 intended steady-state beta state로 읽기 어렵다.
  - 따라서 current `profile/drafts` duplicate-id 노출은 beta owner surface에 새어 나올 수 있는 historical/operator anomaly leak로 읽는 편이 current code와 더 맞다.
  - `[검증 필요]` future contract에서 이 anomaly를 list에서 그대로 보여 줄지, badge/collapse/no-data 계열로 다룰지는 canonical owner 범위를 넘는 `N2`/visibility 질문이다.

- current smallest viable next `N1` candidate
  - draft-family duplicate/list exposure 범위 안에서는 `none for now`가 맞다.
  - current remaining question은 duplicate anomaly를 route contract나 beta visibility에서 어떻게 다룰지에 더 가까우므로, 이는 broad canonical owner memo가 아니라 future `N2`/visibility reopen trigger가 생길 때 다시 여는 편이 적절하다.

- 비범위
  - 실제 구현 코드 변경
  - duplicate collapse 로직 추가
  - list/detail/delete UI semantics 변경
  - `DraftV1` writer owner 변경
  - `DraftProfileRecord` writer owner 변경
  - `N2` API / import-export / rollback 구현
  - beta exposure / visibility policy 변경

- 왜 여기서 broad draft-family merge나 `N2` 구현으로 가면 위험한가
  - current code는 duplicate same-id가 생겨도 API/page/detail 각각이 다른 전제를 갖고 있어, 먼저 anomaly class를 좁게 적지 않으면 merge나 contract 논의가 곧바로 UI/ops/rollback 문제까지 퍼진다.
  - 지금은 canonical owner 관점에서 "이 노출은 intended steady-state가 아니라 anomaly leak"라고 잠그는 것이 가장 작은 current-state cut이다.

### 4.22 draft-family `none for now` closeout sync (2026-03-25)

- 이번 closeout에서 확정하는 것
  - `DraftV1` writer owner는 계속 `src/lib/planning/v3/drafts/draftStore.ts`로 유지한다.
  - `DraftProfileRecord` writer owner는 계속 `src/lib/planning/v3/store/draftStore.ts`로 유지한다.
  - `V3DraftRecord`는 current route surface에서 standalone owner가 아니라 bridge/support reading으로 유지한다.
  - `same-root dual-shape`, `primary-vs-legacy same-id duplicate precedence`, `profile/drafts duplicate-id list exposure`까지의 docs-first memo chain이 현재 draft-family 범위의 stop line이다.
  - draft-family 범위의 current smallest viable next candidate는 현재 `none for now`다.

- 이번 closeout에서 바뀌지 않는 것
  - 실제 구현 코드
  - draft route 추가/삭제
  - preview / preflight 계산식
  - stable `/planning*` route contract
  - beta `/planning/v3/*` visibility policy
  - `N2` API / import-export / rollback contract 구현

- current next question
  - 더 이상 draft-family 내부 micro memo를 무엇으로 더 깎을지가 아니다.
  - trigger-specific reopen이 실제로 생겼는지 여부로 읽는 편이 맞다.

- future reopen trigger
  - `N2` import-export / rollback contract question이 실제로 draft-family owner/export unit을 다시 열 때
  - beta visibility / anomaly handling policy question이 실제로 duplicate anomaly surface를 다뤄야 할 때
  - route contract나 list/detail semantics를 실제로 바꾸는 요구가 생길 때

### 4.23 `N1` remaining-boundary reselection audit (2026-03-25)

- `N1` remaining-boundary map
  - parked / `none for now`
    - draft-family memo chain은 `4.17`부터 `4.22`까지의 stop line으로 유지한다.
  - current `N1` owner-sync question
    - `ImportBatch / TransactionRecord` read ownership unresolved는 여전히 남아 있다.
    - `src/lib/planning/v3/store/batchesStore.ts`는 stored batch meta + stored transaction persistence writer owner로 읽히지만, current read stack은 여기서 닫히지 않는다.
    - `src/lib/planning/v3/service/transactionStore.ts`, `/api/planning/v3/batches`, `/api/planning/v3/batches/[id]/summary`, `/api/planning/v3/transactions/batches/[id]`, `/api/planning/v3/balances/monthly`, `getBatchSummary.ts`, `generateDraftPatchFromBatch.ts`는 stored-first reader facade와 legacy/coexistence bridge semantics를 계속 공유한다.
  - `N2`로 defer할 question
    - `NewsAlertRuleOverride`는 actual owner 확인까지는 끝났고, default config / override document / generated alert event state를 export/rollback 단위로 어디까지 묶을지가 남아 있다.
    - draft-family duplicate anomaly visibility / route contract question도 current canonical owner question이 아니라 future `N2` 또는 trigger-specific reopen 범위다.

- still-valid owner boundary
  - draft-family 범위는 current closeout 기준 `none for now`로 유지한다.
  - `NewsAlertRuleOverride` actual owner 재확인 결과도 그대로 유효하다. `src/lib/planning/v3/news/alerts.ts`는 re-export facade이고 actual override persistence는 `src/lib/news/alerts.ts` / `.data/alerts/rules.override.json` 경계다.
  - stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 remaining-boundary reading과 충돌하지 않는다. open question은 stable route IA가 아니라 beta batch read owner wording에 남아 있다.

- `N1`에 남는 질문과 `N2`로 defer할 질문
  - `N1`에 남는 질문
    - `ImportBatch / TransactionRecord` current read ownership를 stored batch writer owner와 legacy bridge 사이에서 어떤 wording으로 잠글지
  - `N2`로 defer할 질문
    - `NewsAlertRuleOverride` export/import/rollback grouping
    - batch read anomaly나 legacy coexistence를 user-facing route contract / visibility policy에서 어떻게 다룰지
    - draft-family reopen trigger가 실제로 생겼을 때의 duplicate/list-detail semantics 재정의

- current smallest viable next `N1` candidate
  - broad canonical rewrite나 `N2` 구현이 아니라 `ImportBatch / TransactionRecord stored-first read owner vs legacy bridge memo`다.
  - 이유:
    - current code는 writer owner와 stored-first reader facade가 이미 분리되어 있고, list/detail/summary/balances/draft-patch consumer가 같은 read stack을 서로 다른 route meaning으로 소비한다.
    - 따라서 먼저 read owner wording을 좁혀야 이후 `N2` contract에서 export/rollback unit을 과장하지 않는다.

- 비범위
  - 실제 구현 코드 변경
  - draft-family 내부 micro cut 재오픈
  - `N2` API / import-export / rollback 구현
  - route 추가/삭제
  - stable/public IA 재편
  - planning result-flow 재설계
  - beta visibility policy 변경

- 왜 여기서 바로 `N2` 구현이나 broad planning/v3 rewrite로 가면 위험한가
  - batch read stack은 stored owner, legacy fallback, coexistence guard, projection route가 여전히 얽혀 있어 owner wording을 잠그기 전에 `N2` 구현으로 가면 곧바로 route contract, rollback, anomaly policy까지 같이 다시 열리게 된다.
  - 지금은 `ImportBatch / TransactionRecord` read ownership만 좁게 다시 고르는 편이 가장 작은 `N1` current-state cut이다.

### 4.24 `ImportBatch / TransactionRecord` stored-first read owner vs legacy bridge memo audit (2026-03-25)

- `ImportBatch / TransactionRecord` current read-boundary map
  - stored writer owner
    - `src/lib/planning/v3/store/batchesStore.ts`는 current stored writer owner로 읽는다.
    - `ImportBatchMeta` index(`index.json`)와 `<batchId>.ndjson` stored transaction snapshot persistence를 직접 관리한다.
    - `saveBatch()`, `getBatchMeta()`, `getBatchTransactions()`, `updateStoredBatchAccountBinding()`, `deleteBatch()`는 stored persistence boundary 안에서만 닫힌다.
  - stored-first reader facade / mixed read layer
    - `src/lib/planning/v3/transactions/store.ts`는 writer owner가 아니라 shared read layer다.
    - `loadStoredFirstBatchTransactions()`가 stored complete / stored partial / hybrid legacy transactions / legacy-only를 판정하고, synthetic stored-only discovery와 explicit legacy fallback을 함께 관리한다.
    - `buildStoredFirstVisibleBatchShell()`, `getStoredFirstBatchDetailProjectionRows()`, `getStoredFirstBatchSummaryProjectionRows()`, `toStoredFirstPublicMeta()`, `applyStoredFirstBatchAccountBinding()`는 public read surface가 shared helper-owned boundary를 재사용하게 만든다.
  - legacy bridge / compat layer
    - `src/lib/planning/v3/service/transactionStore.ts`는 legacy NDJSON batch/transaction path를 직접 읽고 쓴다.
    - `listBatches()`, `readBatch()`, `readBatchTransactions()`, `updateBatchAccount()`는 current code에서도 legacy bridge/compat layer로 남아 있다.
  - stored-first reader consumer
    - `src/lib/planning/v3/service/getBatchSummary.ts`는 `loadStoredFirstBatchTransactions()` + `getStoredFirstBatchSummaryProjectionRows()` + `toStoredFirstPublicMeta()`를 통해 summary projection을 만든다.
    - `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`는 `loadStoredFirstBatchTransactions()` + `applyStoredFirstBatchAccountBinding()`을 통해 draft patch evidence input을 읽는다.

- route meaning별 current consumer map
  - `/api/planning/v3/batches`
    - legacy list와 stored candidate를 id/createdAt 기준으로 합쳐 batch-center style summary row를 만든다.
    - summary가 열리면 `getBatchSummary()`를 우선 사용하고, 실패하면 stored-first public meta fallback만 남긴다.
    - hidden public `createdAt`는 string downgrade가 아니라 omission boundary로 읽는 편이 맞다.
  - `/api/planning/v3/batches/[id]/summary`
    - current stored-first summary projection route다.
    - batch meta / createdAt public boundary와 summary projection row 입력을 `getBatchSummary()` helper에 위임한다.
  - `/api/planning/v3/transactions/batches/[id]`
    - current detail projection route다.
    - raw `data`는 stored/legacy snapshot을 유지하고, visible batch shell / derived `transactions` / `sample` / `accountMonthlyNet`만 stored-first binding view를 쓴다.
    - `failed` / `fileName` 계열만 helper-owned explicit legacy detail fallback으로 남는다.
  - `/api/planning/v3/balances/monthly`
    - current balance projection route다.
    - `loadStoredFirstBatchTransactions()` + `applyStoredFirstBatchAccountBinding()` 이후 overrides / transfer detection / monthly balance 계산을 수행한다.

- still-valid writer/read boundary
  - current unresolved question은 writer owner 변경이 아니다. `src/lib/planning/v3/store/batchesStore.ts` stored writer owner와 `src/lib/planning/v3/service/transactionStore.ts` legacy bridge 경계는 그대로 유지한다.
  - `getBatchSummary.ts`와 `generateDraftPatchFromBatch.ts`는 stored-first reader consumer이지, standalone owner나 legacy bridge 재승격 지점이 아니다.
  - stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 read-owner reading과 충돌하지 않는다. 이 memo는 beta batch-family read stack 설명에만 머문다.

- mixed or `[검증 필요]` read-owner boundary
  - `src/lib/planning/v3/transactions/store.ts`는 stored-first helper와 legacy bridge re-export를 같은 entrypoint에 두므로, module path만 보고 pure reader facade 또는 pure bridge라고 적으면 다시 섞여 읽힌다.
  - `/api/planning/v3/batches`와 `/api/planning/v3/transactions/batches`는 둘 다 legacy + stored candidate를 병합하지만, 하나는 batch-center summary row + omitted `createdAt`, 다른 하나는 transaction batch list + string `createdAt` contract를 쓴다.
  - `[검증 필요]` 이 dual list surface를 canonical owner memo에서 어디까지 한 묶음으로 적을지, 아니면 route meaning split으로 더 잘게 잠글지는 아직 후속 memo가 필요하다.

- current smallest viable next `N1` candidate
  - broad batch-family rewrite나 `N2` 구현이 아니라 `batch list dual-surface route meaning memo`다.
  - 이유:
    - writer owner / stored-first reader facade / legacy bridge의 큰 층위는 이번 메모로 분리됐다.
    - current 남은 ambiguity는 같은 merged candidate set을 `/api/planning/v3/batches`와 `/api/planning/v3/transactions/batches`가 서로 다른 public contract로 소비한다는 점에 더 가깝다.

- 비범위
  - 실제 구현 코드 변경
  - `draft-family` 내부 micro cut 재오픈
  - `NewsAlertRuleOverride` export/rollback grouping 재오픈
  - `N2` API / import-export / rollback 구현
  - route 추가/삭제
  - stable/public IA 재편
  - planning result-flow 재설계
  - beta visibility policy 변경

- 왜 여기서 바로 `N2` 구현이나 broad batch-family rewrite로 가면 위험한가
  - current code는 stored writer owner, stored-first read helper, legacy bridge, route-local projection contract가 이미 다른 층위로 분리돼 있어, 이를 다시 한 덩어리로 다루면 owner wording보다 먼저 export/rollback/visibility contract가 커진다.
  - 지금은 shared read layer와 dual list surface meaning만 더 좁게 문서화하는 편이 가장 작은 `N1` current-state cut이다.

### 4.25 batch-list dual-surface route-meaning memo audit (2026-03-25)

- batch-list dual-surface route-meaning map
  - shared merged candidate set
    - `/api/planning/v3/batches`와 `/api/planning/v3/transactions/batches`는 모두 legacy list(`listLegacyBatches`)와 stored candidate(`listStoredBatchListCandidates`)를 batch id + createdAt 기준으로 병합한다.
    - 즉 source row pool은 shared read layer를 재사용하지만, route meaning과 public payload expression은 다르다.
  - `/api/planning/v3/batches`
    - current batch-center summary row surface다.
    - `src/app/planning/v3/batches/page.tsx`는 `BatchesCenterClient`를 직접 렌더링하고, 이 client는 `/api/planning/v3/batches`의 `data: BatchListRow[]`만 읽는다.
    - 각 row는 `batchId`, optional `createdAt`, optional `stats(months/txns/unassignedCategory/transfers)`를 갖는다.
    - route는 per-row `getBatchSummary()`를 우선 시도하고, 실패하면 stored-first public meta fallback만 남긴다.
  - `/api/planning/v3/transactions/batches`
    - current transaction batch list surface이자 batch-picker support surface다.
    - `src/app/planning/v3/transactions/batches/page.tsx`는 `TransactionsBatchListClient`를 렌더링하고, 이 client는 `items: BatchRow[]`를 legacy-style list contract로 읽는다.
    - `src/app/planning/v3/balances/_components/BalancesClient.tsx`는 같은 route의 `data`를 batch picker meta row(`id`, `createdAt`, `rowCount`, `ymMin`, `ymMax`)로 읽는다.
    - 따라서 이 route는 same merged candidate set 위에 `items` list contract와 `data` picker/meta contract를 함께 노출하는 compat surface로 읽는 편이 맞다.

- createdAt / summary row / omission-string policy 메모
  - `/api/planning/v3/batches`
    - summary row surface라 `createdAt`는 summary-style omission boundary를 따른다.
    - hidden public `createdAt`는 `""`로 downgrade하지 않고 key 자체를 생략한다.
    - `stats`는 `getBatchSummary()`가 열릴 때만 붙고, fallback row는 `batchId` + optional `createdAt`까지만 남을 수 있다.
  - `/api/planning/v3/transactions/batches`
    - transaction list/history consumer와 batch picker consumer가 string key를 기대하므로 `getStoredFirstPublicCreatedAtString()`을 통해 hidden public `createdAt`를 `""`로 downgrade한다.
    - `items`는 legacy-style list row(`kind`, `fileName?`, `total`, `ok`, `failed`)를 유지하고, `data`는 public meta row를 유지하되 same string `createdAt` contract를 공유한다.
  - 따라서 same merged candidate set을 읽더라도 route meaning이 다르므로 `createdAt` 표현 차이는 incidental 차이가 아니라 contract 차이다.

- still-valid shared read-layer boundary
  - writer owner는 계속 `src/lib/planning/v3/store/batchesStore.ts`다.
  - shared read layer는 계속 `src/lib/planning/v3/transactions/store.ts`다. synthetic stored-only discovery, explicit legacy fallback, public `createdAt` decision helper를 이 layer가 유지한다.
  - `getBatchSummary.ts`는 batch-center summary row route가 재사용하는 projection helper다.
  - stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 memo와 충돌하지 않는다. 두 route 모두 `docs/current-screens.md` 기준 `Public Beta` batch-family surface다.

- mixed or `[검증 필요]` route-meaning boundary
  - `/api/planning/v3/transactions/batches`는 one-route / two-payload compat surface라, `items`와 `data`를 같은 의미의 duplicate 표현으로 적으면 다시 섞여 읽힌다.
  - `TransactionsBatchListClient`는 `items`만 읽고, `BalancesClient`는 `data`만 읽으므로 current code 기준 consumer split도 이미 존재한다.
  - `[검증 필요]` `data`를 transaction batch list의 co-primary public contract로 읽을지, batch-picker support payload로 더 좁게 읽을지는 후속 memo에서 더 잠가야 한다.

- current smallest viable next `N1` candidate
  - broad batch-family rewrite나 `N2` 구현이 아니라 `transactions/batches items-vs-data compat payload memo`다.
  - 이유:
    - dual-surface route meaning 자체는 이번 메모로 분리됐다.
    - current 남은 ambiguity는 `/api/planning/v3/transactions/batches` 내부에서 `items`와 `data`가 각각 어떤 consumer tier와 contract tier를 갖는지에 더 가깝다.

- 비범위
  - 실제 구현 코드 변경
  - `draft-family` 내부 micro cut 재오픈
  - writer owner 변경
  - legacy bridge 제거 구현
  - `N2` API / import-export / rollback 구현
  - route 추가/삭제
  - stable/public IA 재편
  - beta visibility policy 변경

- 왜 여기서 바로 `N2` 구현이나 broad batch-family rewrite로 가면 위험한가
  - current dual list surface는 same merged candidate set 위에 summary row omission contract, legacy string contract, picker/meta support contract를 동시에 얹고 있다.
  - 이 상태에서 broad rewrite를 먼저 열면 owner wording보다 먼저 API shape, beta consumer expectation, visibility policy까지 함께 다시 정의하게 된다.
  - 지금은 `/api/planning/v3/transactions/batches` 내부 compat payload meaning만 더 좁게 적는 편이 가장 작은 `N1` current-state cut이다.

### 4.26 `transactions/batches` items-vs-data compat-payload memo audit (2026-03-25)

- `transactions/batches` items-vs-data compat payload map
  - `items`
    - current primary list contract다.
    - `src/app/planning/v3/transactions/batches/page.tsx`가 렌더링하는 `TransactionsBatchListClient`는 `ListResponse = { ok: true; items: BatchRow[]; nextCursor?: string }`만 검증하고, `json.items`만 읽는다.
    - `BatchRow`는 `id`, string `createdAt`, `kind`, optional `fileName`, `total`, `ok`, `failed`를 전제로 한다.
    - 따라서 `items`는 transaction batch list/history surface의 active consumer contract로 읽는 편이 맞다.
  - `data`
    - current batch-picker support/meta contract다.
    - `src/app/planning/v3/balances/_components/BalancesClient.tsx`는 같은 route의 `data`만 읽고, `id`, `createdAt`, `rowCount`, `ymMin`, `ymMax`를 가진 batch meta row로 정규화한다.
    - route 구현도 `data`를 `toStoredFirstPublicImportBatchMeta()` 결과에 string `createdAt`를 붙인 public meta row로 만든다.
    - 따라서 `data`는 list row duplicate라기보다 batch picker / support consumer를 위한 compat meta payload로 읽는 편이 current code와 맞다.

- still-valid consumer split
  - `TransactionsBatchListClient`는 `items`만 active consumer로 사용한다.
  - `BalancesClient`는 `data`만 active consumer로 사용한다.
  - `/api/planning/v3/transactions/batches` route 안에서 `items`와 `data`는 consumer tier가 이미 갈라져 있다.
  - stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 memo와 충돌하지 않는다. `docs/current-screens.md` 기준 `/planning/v3/transactions/batches`는 여전히 `Public Beta`다.

- string `createdAt` downgrade boundary 메모
  - `items`와 `data`는 모두 `getStoredFirstPublicCreatedAtString()`을 사용해 hidden public `createdAt`를 `""`로 downgrade한다.
  - 그러나 helper 공유는 visibility boundary 공유일 뿐 payload tier 동일성을 뜻하지 않는다.
  - `items`는 legacy-style list consumer contract를 보존하기 위해 string `createdAt`를 유지하고, `data`는 batch picker/meta consumer가 같은 hidden-public boundary를 재사용하도록 string `createdAt`를 유지한다.
  - 즉 same helper를 써도 같은 tier의 duplicate payload가 아니라 route-local compat split으로 읽는 편이 맞다.

- mixed or `[검증 필요]` compat payload boundary
  - `nextCursor`는 route가 여전히 반환하지만, current round에서 active consumer는 `TransactionsBatchListClient`와 `BalancesClient` 둘뿐이었고 둘 다 이를 실제로 사용하지 않는다.
  - `[검증 필요]` future pagination consumer가 `items` contract만 읽을지, `data` contract까지 함께 묶을지는 current code만으로 닫히지 않는다.
  - 따라서 지금 시점에서 `items`와 `data`를 co-primary public contract로 적기보다, active list contract와 support/meta contract로 나눠 적는 편이 더 안전하다.

- current smallest viable next `N1` candidate
  - `none for now`
  - 이유:
    - dual-surface route meaning과 `transactions/batches` 내부 compat payload tier까지 현재 active consumer 기준으로 분리됐다.
    - 남은 open point는 `nextCursor` 같은 dormant compat artifact나 future consumer contract에 가까워, broad canonical owner memo보다 trigger-specific reopen이 생길 때 다시 여는 편이 낫다.

- 비범위
  - 실제 구현 코드 변경
  - writer owner 변경
  - legacy bridge 제거 구현
  - `items` / `data` API shape 변경
  - route 추가/삭제
  - `N2` API / import-export / rollback 구현
  - stable/public IA 재편
  - beta visibility policy 변경

- 왜 여기서 바로 `N2` 구현이나 broad batch-family rewrite로 가면 위험한가
  - current route는 same merged candidate set 위에 active list contract와 support/meta contract를 compat 형태로 함께 싣고 있다.
  - 이 상태에서 broad rewrite를 먼저 열면 payload tier wording보다 먼저 API shape, pagination, picker consumer, visibility 정책을 한꺼번에 다시 정의하게 된다.
  - 지금은 active consumer split까지만 잠그고, dormant compat artifact는 trigger-specific reopen이 생길 때만 다시 여는 편이 가장 작은 `N1` current-state cut이다.

### 4.27 `N1` remaining-boundary `none for now` closeout sync (2026-03-25)

- 이번 closeout에서 확정하는 것
  - draft-family 범위는 `4.17`부터 `4.22`까지의 memo chain 기준 `none for now`다.
  - `ImportBatch / TransactionRecord` current read-owner memo chain도 `4.24`부터 `4.26`까지의 current active consumer split 기준 `none for now`다.
  - `/api/planning/v3/transactions/batches`의 `items` vs `data` compat payload tier는 current code 기준 충분히 분리됐다. `items`는 active list contract, `data`는 batch-picker support/meta contract다.
  - stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다.
  - current next question은 더 이상 `N1` 내부 micro memo를 무엇으로 더 깎을지가 아니라, trigger-specific reopen 또는 `N2` 공식 contract question이 실제로 생겼는지 여부다.

- 이번 closeout에서 바뀌지 않는 것
  - 실제 구현 코드
  - route 추가/삭제
  - API shape 변경
  - writer owner 변경
  - legacy bridge 제거 구현
  - beta `/planning/v3/*` visibility policy 변경
  - `N2` API / import-export / rollback 구현

- future reopen trigger
  - `N2` import-export / rollback contract question이 batch/draft owner-export unit을 다시 열 때
  - dormant compat artifact(`nextCursor` 등)에 active consumer가 실제로 생길 때
  - `/api/planning/v3/transactions/batches`의 `items` / `data`를 co-primary public contract로 다시 읽어야 하는 요구가 생길 때
  - route / list / detail semantics를 실제로 바꾸는 요구가 생길 때

- current next recommendation
  - `none for now`
  - 이유:
    - draft-family와 batch read-surface memo chain이 current code / active consumer 기준으로 각각 stop line까지 도달했다.
    - 남은 open point는 current-state owner sync보다 future contract change 또는 consumer activation에 더 가깝다.

---

## 5. derived / read model inventory

아래는 current code 기준으로 canonical write owner가 아닌 derived/read model로 정리한다.

- `MonthlyCashflow`, `MonthlyCashflowBreakdown`
  - transaction / category rule / override 결과를 재집계한 read model
- `MonthlyAccountBalance`, `MonthlyAccountBalanceTimeline`
  - account + opening balance + transaction을 읽어 계산한 balance projection
- `CategorizedTransaction`, `CategorizedTransactionRow`
  - category rule / override 적용 결과 projection
- `TransferDetectionResult`, `TransferCandidate`
  - transfer detection 서비스 결과
- `BatchSummary`
  - batch detail/table용 summary
- `DraftPreflightResult`
  - profile draft와 base profile 비교 결과
- `effective news config`
  - `NewsSettings` + code default merge 결과
- `effective alert rules`
  - alert rule default + override merge 결과
- news digest / trend / scenario pack cache
  - news refresh 산출물 캐시
- `/planning/v3/start` checklist rows
  - file existence 기반 read-only checklist

정리:
- 위 항목은 API 응답이나 화면에서 중요하지만 first-class write owner가 아니다.
- `N2`에서는 export 대상에 포함할지 여부만 따로 결정하고, canonical entity 자체로 승격하지 않는다.

---

## 6. transient / support artifact inventory

아래는 current code 기준으로 transient/support artifact로 정리한다.

- CSV preview rows / inferred mapping / validation result
  - import 전 preview helper
- `/planning/v3/drafts/profile` download payload
  - 저장/적용 없는 profile patch download artifact
- alert event state (`ack` / `hide`)
  - generated alert event에 대한 UI overlay
  - canonical alert rule owner와 분리해야 한다
- apply preview payload (`/api/planning/v3/draft/preview`)
  - merged profile preview 전용
- start checklist의 file stat / count result
  - 운영 checklist support artifact

---

## 7. category별 판정 메모

### 7.1 account

- first-class entity로 확정
- owner: `accountsStore.ts`

### 7.2 opening balance / balance timeline

- `OpeningBalance`는 first-class
- `MonthlyAccountBalanceTimeline`은 derived/read model

### 7.3 transaction

- `TransactionRecord`는 first-class
- 단, current key는 `(batchId, txnId)` 조합으로 보는 것이 안전하다

### 7.4 batch / import batch

- `ImportBatch`는 first-class
- batch summary는 derived/read model

### 7.5 category rule / classification override

- `CategoryRule`는 first-class
- `TxnOverride`는 first-class
- account mapping / transfer override도 first-class support-owner로 유지

### 7.6 profile draft / applied profile

- `DraftProfileRecord`는 first-class
- applied profile은 v3 canonical owner가 아니라 stable planning profile store owner
- `PlannerSnapshot`는 여전히 v2/stable snapshot owner

### 7.7 scenario draft

- standalone “scenario draft” entity는 current code 기준 없음
- canonical owner는 `ScenarioLibraryOverrides`
- UI의 scenario draft row는 transient editing state로 본다

### 7.8 news alert / news settings / exposure profile

- `NewsSettings`는 first-class
- `NewsAlertRuleOverride`는 first-class
- `ExposureProfile`은 first-class
- generated alert event / event state는 derived 또는 support artifact로 분리

---

## 8. route-to-entity canonical mapping

### 8.1 transaction and batch cluster

- `/planning/v3/import/csv`
  - writer: `ImportBatch`, `TransactionRecord`, `CsvDraftRecord`
- `/planning/v3/batches`
  - reader: `ImportBatch`
- `/planning/v3/batches/[id]`
  - reader: `ImportBatch`, `TransactionRecord`, override family
- `/planning/v3/transactions/batches`
  - reader: `ImportBatch`
- `/planning/v3/transactions/batches/[id]`
  - reader/writer: `TransactionRecord`, `TxnOverride`, `AccountMappingOverride`, `TxnTransferOverride`
- `/planning/v3/journal`
  - reader: `TransactionRecord` derived projection

### 8.2 draft and profile cluster

- `/planning/v3/drafts`
  - reader: `CsvDraftRecord`
- `/planning/v3/drafts/[id]`
  - reader: `CsvDraftRecord`
- `/planning/v3/profile/draft`
  - transient preview/download helper
- `/planning/v3/profile/drafts`
  - reader/writer: `DraftProfileRecord`
- `/planning/v3/profile/drafts/[id]`
  - reader: `DraftProfileRecord`
- `/planning/v3/profile/drafts/[id]/preflight`
  - reader: `DraftProfileRecord`
  - adjacent base owner read: stable planning profile store

### 8.3 account and balance cluster

- `/planning/v3/accounts`
  - reader/writer: `Account`
- `/planning/v3/balances`
  - reader: `Account`, `OpeningBalance`, `TransactionRecord` derived balance timeline

### 8.4 news and exposure cluster

- `/planning/v3/news/settings`
  - reader/writer: `NewsSettings`, `NewsAlertRuleOverride`
  - reader: `ExposureProfile`
- `/planning/v3/news/alerts`
  - reader: `NewsAlertRuleOverride`, generated alert event, alert event state
- `/planning/v3/news`
  - reader: effective news config, scenario library templates, exposure profile, derived digest/trend pack
- `/planning/v3/exposure`
  - reader/writer: `ExposureProfile`
- `/planning/v3/scenarios`
  - reader/writer: `ScenarioLibraryOverrides`

### 8.5 stable/beta route SSOT check (2026-03-25)

- `docs/current-screens.md` 기준 `/planning`, `/planning/runs`, `/planning/reports`, `/planning/trash`는 `Public Stable`이고 `/planning/v3/*`는 `Public Beta`다.
- 이 문서의 route-to-entity map은 의도적으로 `/planning/v3/*` beta route에서 canonical owner를 읽고 쓰는 축만 적는다.
- stable planning route는 current SSOT 기준으로 stable planning/report/run surface를 읽는 별도 family로 남고, direct `planning/v3` writer route로 취급하지 않는다.
- `DraftProfileRecord` apply가 stable profile owner를 생성/갱신하더라도, 이것이 stable/public `/planning*` route를 v3 canonical owner route로 바꾸지는 않는다.

---

## 9. `N2`로 넘길 contract 쟁점

## 9.1 identity and key

- `TransactionRecord`를 global id로 승격할지 `(batchId, txnId)` 복합 key를 유지할지
- `OpeningBalance`를 `accountId` singleton으로 둘지 `(accountId, asOfDate)` sequence로 승격할지
- `ScenarioLibraryOverrides`, `NewsSettings`, `AlertRuleOverride`, `ExposureProfile` 같은 singleton entity의 export/import shape를 어떻게 통일할지

## 9.2 draft family boundary

- `CsvDraftRecord`와 preview용 `V3DraftRecord`를 하나로 통합할지
- `DraftProfileRecord`와 applied stable profile owner를 같은 transaction boundary로 묶을지 분리할지
- shared drafts dir를 record type별로 분리할지

## 9.3 override precedence

- `CategoryRule` vs `TxnOverride` vs `AccountMappingOverride` vs `TxnTransferOverride` precedence를 contract로 고정해야 한다
- legacy override path를 유지할지 제거할지 결정이 필요하다

## 9.4 export / import / rollback unit

- `ImportBatch` export가 meta-only인지, transactions+overrides bundle인지
- `DraftProfileRecord` rollback이 delete-only인지, stable profile apply rollback까지 포함하는지
- singleton config entity의 backup/restore 단위를 route별이 아니라 owner별로 정의해야 한다

## 9.5 stable v2 boundary

- `PlannerSnapshot`, `PlanningProfileRecord`, `DraftProfileRecord`의 관계를 혼합하지 않는 API rule이 필요하다
- v3 apply는 stable profile owner를 생성/갱신할 뿐, snapshot/report owner를 직접 대체하지 않는다

---

## 10. 이번 단계 결론

- `planning/v3` canonical owner는 현재 Prisma보다 file/local store 쪽에 더 많이 존재한다.
- first-class canonical entity는 direct persistence + clear key + multi-route usage가 있는 항목으로 제한했다.
- balance timeline, batch summary, preflight, effective news config, alert event state는 derived/support로 내렸다.
- `PlannerSnapshot`와 stable planning profile owner는 v3 entity set과 분리 유지한다.
- `N2`는 이 문서의 entity name, owner, key, lifecycle을 그대로 기준으로 API/import-export/rollback contract를 잠가야 한다.
