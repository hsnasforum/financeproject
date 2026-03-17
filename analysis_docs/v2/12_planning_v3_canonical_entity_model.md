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
  - `.data/news/alerts/rules.override.json` 계열 root
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
- `V3DraftRecord` preview document
  - `src/lib/planning/v3/store/draftStore.ts`의 preview draft row
  - current public beta route에서 standalone canonical owner로 정착하지 않았다
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
