# 13. planning/v3 API / import-export / rollback contract

작성 기준: `N1 planning/v3 canonical entity model`, 2026-03-17(KST)
범위: `planning/v3` owner-based API / import-export / rollback / repair / visibility contract 정의

---

## 1. 목적

이 문서는 `planning/v3` route를 화면이나 path 이름이 아니라
canonical entity owner 기준으로 다시 묶어,
다음 단계의 API 구현, import-export, rollback/repair, visibility 정책이
같은 owner 경계 위에서만 진행되도록 고정하기 위한 문서입니다.

이번 문서의 목적은 아래 5가지입니다.

1. `planning/v3` API route를 owner 기준으로 다시 분류한다.
2. command/write route와 read/projection route, support/internal route를 구분한다.
3. import/export 가능 단위와 rollback/repair 가능 단위를 owner 기준으로 고정한다.
4. stable planning v2 owner와 `planning/v3` owner의 경계를 다시 잠근다.
5. `N3`, `N4`에서 재사용할 visibility 전제조건을 남긴다.

비범위:

- route 구현 변경
- schema migration
- stable/beta/internal 최종 공개 정책 확정
- 새 route, 새 DTO, 새 export 포맷 정의

---

## 2. 공통 규칙

### 2.1 owner-first 원칙

- canonical contract의 기준은 route path가 아니라 canonical entity owner다.
- route path가 `batches/*`, `draft/*`, `news/*` 아래에 있어도 owner는 다른 family일 수 있다.
- 같은 owner를 다루는 route는 path가 달라도 같은 export/rollback 규칙을 따라야 한다.

### 2.2 route 분류 규칙

#### command/write route

- first-class canonical owner를 생성, 수정, 삭제, 적용한다.
- rollback/repair 논의의 기준이 되는 route family다.

#### read/projection route

- canonical owner를 읽어 projection, summary, categorized view, digest를 만든다.
- export owner, rollback owner가 아니다.

#### support/internal route

- preview, preflight, refresh, recovery, checklist, annotation처럼 보조 흐름을 담당한다.
- canonical owner를 직접 소유하지 않거나, 소유하더라도 stable contract로 승격하지 않는다.

### 2.3 export / rollback / repair 기본 원칙

- export는 first-class canonical owner 단위로만 약속한다.
- projection route의 응답은 export 포맷이 아니다.
- rollback은 canonical owner의 저장 경계를 되돌리는 행위다.
- repair는 canonical owner를 다시 계산하거나 projection을 재생성하는 행위다.
- rollback과 repair는 같은 의미가 아니다.

### 2.4 stable planning v2 경계

- `PlannerSnapshot`는 `planning/v3` canonical owner가 아니다.
- stable profile store owner는 `planning/v3`의 applied target일 뿐, `planning/v3` export/rollback 묶음에 자동 포함되지 않는다.
- `planning/v3` draft/apply route가 stable profile owner를 읽거나 쓰더라도, 이 경계는 bridge로만 취급한다.

### 2.5 `reader facade` / `writer owner` / `legacy bridge`

- `writer owner`
  - canonical entity를 실제 persistence boundary에 직접 저장하는 module 또는 route다.
  - export / rollback / repair 논의는 이 축을 기준으로 닫는다.
- `reader facade`
  - owner를 직접 쓰지 않고 list/detail/summary/projection을 위해 읽기 진입점을 모아 둔 facade 또는 route다.
  - reader facade는 user-facing 진입점일 수 있어도 canonical owner와 같은 뜻이 아니다.
- `legacy bridge`
  - 이전 persistence boundary 또는 stable owner를 계속 읽기 위해 남겨 둔 compatibility layer다.
  - route 또는 facade가 writer owner와 legacy bridge를 동시에 품고 있으면, 그 surface는 아직 pure canonical contract로 승격하지 않는다.

---

## 3. owner-based route contract

## 3.1 Account / OpeningBalance / Balance projection

### canonical owner

- `Account`
- `OpeningBalance`

### route 분류

- command/write route
  - `/api/planning/v3/accounts`
  - `/api/planning/v3/accounts/[id]`
  - `/api/planning/v3/accounts/[id]/starting-balance`
  - `/api/planning/v3/opening-balances`
- read/projection route
  - `/api/planning/v3/accounts`
  - `/api/planning/v3/accounts/[id]/starting-balance`
  - `/api/planning/v3/opening-balances`
  - `/api/planning/v3/balances/monthly`
- support/internal route
  - 없음

### request intent / response contract 메모

- account route는 계좌 메타데이터와 `startingBalanceKrw`를 다룬다.
- opening-balance route는 `accountId`, `asOfDate`, `amountKrw`를 가진 기준일 잔액 row를 다룬다.
- `balances/monthly`는 `Account`, `OpeningBalance`, `TransactionRecord`를 조합한 projection이다.
- owner read route는 주로 `{ ok, items }` 또는 `{ ok, data }` family를 쓴다.
- owner write route는 `{ ok, account }`, `{ ok, openingBalance }`처럼 owner row를 바로 돌려준다.

### export 가능 단위

- `Account` owner row/set
- `OpeningBalance` owner row/set

제외:

- `balances/monthly` projection

### rollback / repair 가능 단위

- `Account` row 또는 account set 복구
- `OpeningBalance` row 또는 opening-balance set 복구
- `balances/monthly`는 rollback 대상이 아니라 재계산 대상이다

### visibility policy 전제조건

- account/opening-balance write route는 stable 공개 전에 owner key와 restore 단위가 먼저 닫혀야 한다.
- `balances/monthly`는 projection route이므로 `N3` gate에서는 canonical owner 변경보다 projection 일관성 검증을 우선 본다.

---

## 3.2 ImportBatch / TransactionRecord

### canonical owner

- `ImportBatch`
- `TransactionRecord`

### route 분류

- command/write route
  - `/api/planning/v3/batches/import/csv`
  - `/api/planning/v3/transactions/import/csv`
  - `/api/planning/v3/transactions/batches/import-csv`
  - `/api/planning/v3/transactions/batches/merge`
  - `/api/planning/v3/transactions/batches/[id]/account`
  - `/api/planning/v3/transactions/batches/[id]`
- read/projection route
  - `/api/planning/v3/batches`
  - `/api/planning/v3/batches/[id]/summary`
  - `/api/planning/v3/transactions/batches`
  - `/api/planning/v3/transactions/batches/[id]`
  - `/api/planning/v3/transactions/batches/[id]/categorized`
  - `/api/planning/v3/transactions/batches/[id]/cashflow`
  - `/api/planning/v3/transactions/batches/[id]/transfers`
- support/internal route
  - `/api/planning/v3/import/csv`

### request intent / response contract 메모

- import command는 CSV를 batch owner로 적재하거나 기존 batch에 append/merge한다.
- batch/account command는 pure legacy-only에서는 legacy batch owner의 `accountId`를 write owner metadata로 저장하고, stored-meta-only에서는 stored batch meta `accounts` primary binding만 bootstrap write 한다.
- batch read route는 stored-first facade로 batch meta와 transaction row를 읽고, stored snapshot 또는 meta가 비면 explicit legacy bridge fallback을 쓴다.
- synthetic stored-only batch는 transaction batch list/detail/summary read surface에서 discover/resolve될 수 있지만, canonical writer owner로 승격된 것은 아니다.
- batch delete command는 pure stored-meta 또는 pure synthetic stored-only surface에서만 stored-side 삭제를 수행한다. same-id legacy coexistence와 pure legacy-only surface에서는 explicit guard를 반환한다.
- categorized/cashflow/transfers는 transaction owner에 override family를 합쳐 만든 multi-owner projection이다.
- owner read route는 주로 `{ ok, items }`, `{ ok, meta, items }`, `{ ok, data }` family다.
- owner write route는 `{ ok, batch }`, `{ ok, data }`, `{ ok, deleted }` family를 쓴다.

### current command surface snapshot

- shared helper
  - `getStoredBatchCommandSurfaceState()`는 batch command surface를 `stored-meta`, `synthetic-stored-only`, `missing`으로 판정한다.
  - `getStoredBatchDeleteSurfaceState()`는 여기에 `stored-meta-legacy-coexistence`, `synthetic-stored-only-legacy-collision`, `legacy-only`를 추가해 `DELETE` 경계를 잠근다.
  - `getStoredBatchAccountCommandSurfaceState()`는 `synthetic-stored-only`, `missing`을 그대로 유지하고, stored meta가 있으면 `stored-meta-only` 또는 `stored-meta-legacy-coexistence`, legacy only면 `legacy-only`를 반환해 `POST /account` 경계를 잠근다.
- `DELETE /api/planning/v3/transactions/batches/[id]`
  - `pure stored-meta`: stored batch owner 삭제를 허용한다.
  - `pure synthetic-stored-only`: stored file 삭제를 허용한다.
  - `same-id stored-meta + legacy`: `INPUT` guard를 반환한다. stored-side만 지워도 legacy bridge가 같은 id를 계속 resolve할 수 있어 success가 삭제 범위를 과장할 수 있기 때문이다.
  - `same-id synthetic-stored-only + legacy`: `INPUT` guard를 반환한다. stored file만 제거되는 상태를 silent success로 넘기지 않는다.
  - `pure legacy-only`: detail read facade에서는 해석되더라도, 이 route의 delete owner가 아니므로 `INPUT` guard를 반환한다.
- `POST /api/planning/v3/transactions/batches/[id]/account`
  - `pure legacy-only`: legacy batch owner write를 계속 지원한다.
  - `synthetic-stored-only`: `INPUT` guard를 반환한다. same-id legacy bridge가 함께 있더라도 stored meta/index write-back 없이 canonical account writer로 승격하지 않았기 때문이다.
  - `same-id stored-meta + legacy`: route-local `stored -> legacy` sequence를 실행한다. `secondary-failure` 또는 `visible-verification-failed`는 generic `INTERNAL` failure를 반환하고, `verified-success-candidate`일 때만 reloaded stored-first batch shell + legacy-side `updatedTransactionCount` success body를 반환한다.
  - `stored-meta only`: stored meta writer bootstrap이 `ImportBatchMeta.accounts`를 갱신하고 success를 반환한다. transaction row rewrite는 하지 않으므로 `updatedTransactionCount`는 `0`으로 남는다.
  - `missing`: stored owner와 legacy owner가 모두 없으면 기존처럼 `NO_DATA`를 반환한다.

### current mixed ownership snapshot

- `writer owner`
  - `src/lib/planning/v3/service/importCsvToBatch.ts`
  - `src/lib/planning/v3/store/batchesStore.ts`
- `reader facade`
  - `src/lib/planning/v3/transactions/store.ts`
  - `src/lib/planning/v3/service/getBatchSummary.ts`
  - `/api/planning/v3/batches`
  - `/api/planning/v3/batches/[id]/summary`
  - `/api/planning/v3/transactions/batches`
  - `/api/planning/v3/transactions/batches/[id]`
  - `/api/planning/v3/transactions/batches/[id]/cashflow`
  - `/api/planning/v3/balances/monthly`
  - `/api/planning/v3/draft/profile`
- `legacy bridge`
  - `src/lib/planning/v3/service/transactionStore.ts`
  - `readBatchTransactions()`, `readBatch()`, `listBatches()` legacy NDJSON path
- 아직 pure canonical로 승격되지 않은 facade
  - transaction batch list/detail/summary는 stored-first reader에서 synthetic stored-only batch를 discover/resolve할 수 있지만, 이 상태는 여전히 read-side synthetic surface다.
  - `/api/planning/v3/transactions/batches/[id]` detail route는 batch shell `accountId`, `accountHint`와 count-style `batch.total`, `batch.ok`, `stats.total`, `stats.ok`를 stored-first/current snapshot 기준으로 읽고, raw `data`는 snapshot을 유지하면서 derived `transactions`, `sample`, `accountMonthlyNet`만 stored-first binding rows를 사용한다. `batch.failed`, `stats.failed`, `fileName`만 explicit legacy summary fallback으로 남기고, `stats.inferredMonths`는 current raw/recovered row aggregation 기준을 유지한다.
  - `getBatchSummary.ts`와 `/api/planning/v3/transactions/batches/[id]/categorized`는 `getStoredFirstBatchSummaryProjectionRows()`를 통해 stored-first binding rows를 transfer/categorize/monthly 집계 입력으로 사용한다.
  - `/api/planning/v3/transactions/batches/[id]/cashflow`는 `getStoredFirstBatchBindingAccountId()`와 `applyStoredFirstBatchAccountBinding()`을 사용해 stored-first binding rows를 account mapping override와 transfer detection 앞단에 적용한다.
  - `/api/planning/v3/transactions/batches/[id]/transfers`는 `loadStoredFirstBatchTransactions()` + `getStoredFirstBatchSummaryProjectionRows()`를 통해 detection, `stats.totalTxns`, `unassignedCount`를 stored-first visible binding view 기준으로 계산한다.
  - `/api/planning/v3/balances/monthly`는 `applyStoredFirstBatchAccountBinding()`을 적용한 뒤 stored batch가 비면 legacy read를 fallback으로 사용한다.
  - `/api/planning/v3/draft/profile`과 `generateDraftPatchFromBatch.ts`는 `loadStoredFirstBatchTransactions()` + `applyStoredFirstBatchAccountBinding()` 경로를 사용하지만, 이 read-side consumer parity가 맞춰졌다고 해서 writer owner 자체를 canonical stored writer로 재정의한 것은 아니다.
  - `/api/planning/v3/transactions/batches/[id]/account`는 pure legacy-only에서는 legacy batch owner write를, stored-meta-only에서는 stored meta bootstrap write를 사용하므로, reader facade와 writer owner가 아직 pure canonical로 합쳐지지 않았다.

### batch read owner narrowing audit

- current public reader owner map
  - `/api/planning/v3/transactions/batches/[id]` detail route는 `loadStoredFirstBatchTransactions()`를 reader 진입점으로 사용하고, batch shell `accountId`, `accountHint`, `total`, `ok`, detail `stats.total`, `stats.ok`와 derived `transactions` / `sample` / `accountMonthlyNet`을 stored-first/current snapshot 기준으로 조립한다. `stats.failed`만 batch shell `failed`와 같은 explicit legacy summary fallback을 재사용한다.
  - `getBatchSummary.ts`, `/api/planning/v3/transactions/batches/[id]/categorized`, `/api/planning/v3/transactions/batches/[id]/transfers`는 `getStoredFirstBatchSummaryProjectionRows()`를 통해 stored-first projection rows를 summary/detect/categorize 입력의 source-of-truth로 사용한다.
  - `/api/planning/v3/balances/monthly`, `/api/planning/v3/draft/profile`, `generateDraftPatchFromBatch.ts`는 `loadStoredFirstBatchTransactions()` + `applyStoredFirstBatchAccountBinding()` 경로를 따라 stored-first account binding을 public projection 기준으로 사용한다.
- public reader vs internal bridge fallback split
  - public/user-facing payload에 남아도 되는 legacy fallback은 현재 detail shell/detail stats의 `failed`와 detail shell `fileName`처럼 stored meta나 visible row snapshot이 아직 같은 public summary field를 직접 소유하지 않는 좁은 boundary뿐이다.
  - 이 fallback도 `buildStoredFirstVisibleBatchShell()` 또는 `getStoredFirstLegacyDetailSummaryFallback()` 같은 shared helper 안에서만 허용하고, route-local code가 `readBatch()` / `readBatchTransactions()` / `listBatches()`를 public default reader처럼 직접 재사용하는 것은 internal bridge 범위로만 남겨야 한다.
  - `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch.ts`, `getBatchSummary.ts`, `categorized`, `transfers`는 이미 facade/helper 경로 안에서 legacy fallback을 containment하고 있으므로, 후속 narrowing cut은 이 consumer들보다 detail shell public fallback을 먼저 줄이는 편이 더 안전하다.
- smallest safe next cut
  - 다음 owner-narrowing cut은 broad owner merge가 아니라 `/api/planning/v3/transactions/batches/[id]` detail shell의 legacy summary fallback boundary를 더 좁히는 것이다.
  - 즉, stored-first reader facade를 source-of-truth로 유지한 채 public payload에서 legacy summary가 직접 의미를 결정하는 필드를 더 줄이고, 필요한 fallback은 shared helper 내부 bridge로만 containment하는 순서가 가장 작다.
- 지금 바로 broad owner merge가 위험한 이유
  - recent `N2`에서 same-id coexistence success/failure copy와 stored-first visible binding contract는 막 닫혔지만, writer owner와 rollback/repair semantics는 여전히 mixed ownership 상태다.
  - 이 시점에 read owner까지 broad merge로 밀면 success/failure copy contract, `updatedTransactionCount` 의미, legacy bridge containment 경계가 다시 함께 흔들릴 수 있다.

### detail failed/fileName legacy fallback audit

- current failed/fileName source map
  - `batch.failed`는 `buildStoredFirstVisibleBatchShell()` 안에서만 계산되고, source-of-truth는 `read.meta.importMetadata.diagnostics.skipped` -> `legacyBatch.failed` 순서다. stored owner가 있으면 `toNonNegativeCount()` 정규화 후 그 값을 쓰고, 없을 때만 `getStoredFirstLegacyDetailSummaryFallback(read)`가 돌려준 legacy summary fallback으로 내려간다.
  - `stats.failed`는 detail route의 `toBatchDetailStats()`가 `batch.failed`를 그대로 재사용하므로 독립 source가 없다.
  - `fileName`은 같은 helper 안에서 `read.meta.importMetadata.provenance.fileName` -> `legacyBatch.fileName` 순서로 읽어 optional field로 노출한다.
  - 따라서 legacy summary fallback은 `failed`/`fileName`에 대해 truly missing case로 더 좁아졌다. `stored-complete`와 `stored-partial`은 legacy summary를 읽지 않고, `hybrid-legacy-transactions`도 current stored meta에 `importMetadata`가 있으면 stored owner를 먼저 읽는다. explicit legacy summary fallback은 결국 `legacy-only`와 `importMetadata`가 아직 없는 old stored meta hybrid class에만 남는다.
- historical fallback class split
  - `pure legacy`
    - `loadStoredFirstBatchTransactions()`가 `legacy-only` policy를 반환하는 class다. stored batch meta 자체가 없으므로 detail helper는 `batch.failed`, `stats.failed`, `fileName`, `createdAt`, `accountHint`를 legacy batch summary/provenance에서 계속 읽는다.
    - 이 class는 stored owner bootstrap이 아니라 public compat surface 문제에 가깝다. fallback을 걷어내면 현재 detail route가 정직하게 보여 주는 import diagnostics/provenance 자체가 사라지므로, 먼저 pure legacy detail surface를 언제까지 사용자 compat로 둘지부터 문서로 닫아야 한다.
  - `old stored meta without importMetadata`
    - current code에서는 주로 `hybrid-legacy-transactions` 중 `read.meta.importMetadata`가 비어 있는 historical class를 뜻한다. stored meta `rowCount`, `accounts`, `createdAt`는 이미 source-of-truth지만 `failed`와 `fileName`만 legacy summary fallback이 남는다.
    - 이 class는 pure legacy와 달리 stored owner가 "없는" 문제가 아니라 batch metadata owner가 historical schema를 아직 채우지 못한 문제다. 따라서 후속 구현 컷도 route-local fallback 제거보다 backfill/migration 여부 또는 helper-owned explicit bridge retention window를 먼저 닫아야 한다.
- 줄일 수 있는 fallback vs 유지해야 하는 fallback
  - 지금 코드 기준으로 더 줄일 수 있는 필드는 `stats.failed`의 source boundary뿐인데, 이 필드는 이미 `batch.failed` alias라서 별도 narrowing 여지가 거의 없다.
  - `batch.failed`와 `fileName`은 이제 current stored owner가 있다. 후속 narrowing cut은 fallback 제거 자체가 아니라, old stored meta나 pure legacy batch까지 어느 시점에 legacy fallback을 더 걷어낼지 판단하는 문제로 바뀌었다.
- public payload explicit bridge fallback vs internal helper bridge fallback
  - public payload explicit bridge fallback은 detail route 응답에서 사용자가 직접 보는 `batch.failed`, `stats.failed`, `fileName`이다.
  - internal helper bridge fallback은 `pickLegacyBatchFallback()`, `getStoredFirstLegacyDetailSummaryFallback()`, `buildStoredFirstVisibleBatchShell()`처럼 legacy batch를 shared helper 안에서만 읽어 public field로 투영하는 경로다.
  - 후속 cut도 route-local code가 `readBatch()` 또는 `readBatchTransactions()`를 직접 재사용해 public payload를 조립하는 방식이 아니라, helper-owned bridge containment을 유지한 채 public explicit fallback field를 줄일 수 있는지부터 따져야 한다.
- smallest safe next cut
  - 이번 라운드 기준 가장 작은 안전한 다음 cut은 owner bootstrap이 아니라 remaining legacy fallback retirement boundary audit이다.
  - 즉, `batch.failed`, `stats.failed`, `fileName`이 아직 legacy summary fallback을 유지하는 batch class를 `pure legacy`, `old stored meta without importMetadata`로 좁게 고정하고, 같은 "legacy fallback"으로 뭉개지지 않게 retention 이유를 분리해 두는 편이 가장 작다.
  - old stored meta는 direct fallback 제거보다 먼저 batch metadata backfill/migration 여부 또는 helper-owned bridge retention window를 정해야 한다.
  - pure legacy는 stored owner backfill 문제가 아니라 detail compat surface를 언제까지 유지할지, 그리고 guard/no-data/visibility policy 중 무엇으로 retire할지 먼저 정해야 한다.
  - [검증 필요] future implementation cut이 필요하다면, 위 두 historical class를 같은 route-local 조건으로 처리하지 말고 helper contract와 backlog 메모를 따로 닫아야 한다.
- 비범위
  - detail route payload shape 축소
  - stored meta schema 확장
  - import writer redesign
  - owner merge, row rewrite, index repair
  - `cashflow`, `summary`, `categorized`, `transfers`, `balances/monthly`, `draft/profile` consumer 재수정
- 지금 바로 broad fallback 제거가 위험한 이유
  - current detail shell은 latest stored owner를 먼저 읽지만, `pure legacy`와 `old stored meta without importMetadata`는 아직 fallback class로 남아 있다.
  - 이 둘에 대한 retirement boundary 없이 fallback을 성급히 제거하면, old stored batch에서는 `failed/fileName`이 silent blank/zero로 내려가고, pure legacy batch에서는 현재 정직하게 노출하던 import diagnostics/provenance가 설명 없이 사라지는 contract shrink가 된다.
  - 반대로 pure legacy와 old stored meta를 같은 migration 대상으로 문서화하면, pure legacy support 종료 판단이 필요한 surface에 backfill 가정이 섞여 다음 코드 컷이 과도하게 커질 수 있다.

### stored import diagnostics/provenance owner contract audit

- current diagnostics/provenance owner map
  - `parseCsvTransactions()`는 import 시점에 `{ stats.rows, stats.parsed, stats.skipped, errors[] }`를 계산하고, stored path는 이 중 batch-level summary인 `rows`, `parsed`, `skipped`만 `ImportBatchMeta.importMetadata.diagnostics`로 저장한다. `errors[]` 자체는 아직 persisted하지 않는다.
  - `importCsvToBatch()`는 `batchId`와 `txnId` 계산에 hash를 쓰고, persisted stored boundary에는 `ImportBatchMeta.rowCount`, `ymMin`, `ymMax`, `accounts`, optional `importMetadata`, sanitized `StoredTransaction[]`를 넘긴다.
  - `saveBatch()`와 `normalizeBatchMeta()`는 batch-level stored metadata owner로 `ImportBatchMeta.importMetadata`를 저장/복원한다. 이 slot은 `{ diagnostics: { rows, parsed, skipped }, provenance: { fileName? } }` shape만 허용한다.
  - batch `ndjson` row schema와 `normalizeStoredTransaction()`은 여전히 diagnostics/provenance를 저장하지 않는다. 즉, owner bootstrap은 index/meta boundary에만 열려 있고 row boundary는 그대로다.
  - stored import command surface인 `/api/planning/v3/transactions/batches/import-csv`와 `/api/planning/v3/batches/import/csv`는 optional `fileName` provenance를 `importCsvToBatch()` writer handoff까지 넘기고, 그 handoff는 이제 stored batch metadata owner로 persisted된다.
  - 반대로 legacy bridge owner는 `appendBatchFromCsv()`에서 `batch.failed`, `batch.fileName`, `batch.sha256`, record-level `sourceInfo.fileName` / `sourceInfo.sha256`까지 이미 저장한다.
- `failed` owner 후보 1개
  - 가장 작은 stored owner 후보는 `ImportBatchMeta`와 같은 batch-level stored metadata boundary다.
  - 이유:
    - `failed`는 persisted transaction row가 아니라 import parse-skip summary이므로 row payload에서 재구성할 수 없다.
    - detail route가 현재 `batch.failed` / `stats.failed`를 batch shell 한 곳에서 재사용하듯, batch-scoped metadata로 읽는 편이 public fallback 제거 이후에도 가장 작다.
- `fileName` owner 후보 1개
  - 가장 작은 stored owner 후보도 같은 batch-level stored metadata boundary다.
  - 이유:
    - `fileName`은 row-derived 의미가 아니라 import batch provenance다.
    - current stored transactions는 sanitize/dedupe를 거친 visible rows라 batch import provenance를 per-row로 내리는 것보다 batch metadata에 두는 편이 더 작다.
    - [미확인] stored path에서 `fileName` 외에 어떤 provenance를 함께 가져가야 충분한지는 별도 contract cut이 필요하지만, 최소한 display용 `fileName` owner는 batch-level metadata 쪽이 자연스럽다.
- 함께 소유할 때 vs 분리 소유할 때 tradeoff
  - 함께 같은 stored batch metadata boundary에 두면, detail route가 public fallback을 걷어낼 때 `batch.failed`, `stats.failed`, `fileName`을 한 helper 경계에서 동시에 re-read할 수 있어 mixed-source drift를 가장 적게 만든다.
  - 분리 소유는 의미론적으로는 가능하다. `failed`는 diagnostics summary, `fileName`은 provenance label이라 업데이트 이유가 다르기 때문이다.
  - 하지만 current code 기준으로 분리 소유를 먼저 열면 one-sided migration 상태가 생겨 `failed`만 stored-owned, `fileName`만 legacy-owned 같은 중간 contract를 다시 public payload에 남길 가능성이 크다.
- current closed prerequisites before broader fallback retirement
  - 1. stored import command가 writer에 넘길 수 있는 trusted provenance input 범위는 닫혔다. multipart `File.name`과 JSON body `fileName`이 optional trusted provenance input으로 handoff된다.
  - 2. stored batch metadata boundary가 persisted row count와 별도로 import diagnostics summary / provenance를 소유한다는 contract도 닫혔다. `ImportBatchMeta.importMetadata`가 그 source-of-truth다.
  - 3. detail shell helper는 위 batch-level metadata를 source-of-truth로 읽기 시작했다. 따라서 다음 질문은 owner bootstrap 자체가 아니라, old stored meta와 pure legacy batch에 남은 fallback retirement boundary다.
- current owner bootstrap snapshot
  - stored import route는 writer 직전 handoff뿐 아니라 persisted batch owner까지 닫혔다. `/api/planning/v3/batches/import/csv`는 multipart `File.name`과 JSON body `fileName`을 optional trusted provenance input으로 읽고, `/api/planning/v3/transactions/batches/import-csv`도 JSON body의 optional `fileName`을 `importCsvToBatch()`로 넘길 수 있다.
  - `importCsvToBatch()`는 `parseCsvTransactions()` 결과에서 `{ rows, parsed, skipped }` diagnostics summary와 optional `fileName`을 묶은 `metadataHandoff`를 만들고, 같은 shape를 `ImportBatchMeta.importMetadata`로 persisted batch owner에 연결한다.
  - detail shell `buildStoredFirstVisibleBatchShell()`은 이제 `importMetadata -> legacy summary fallback` 순서로 `batch.failed`와 `fileName`을 읽고, `stats.failed`는 계속 `batch.failed` alias로 남는다.
  - 이 bootstrap은 complete fallback retirement가 아니다. public list/detail `meta` projection은 `importMetadata`를 계속 숨기고, `pure legacy`와 `old stored meta without importMetadata`는 여전히 fallback class로 남아 있다.
- smallest safe next cut
  - 가장 작은 다음 구현 컷은 another owner bootstrap이 아니라 remaining legacy fallback retirement boundary audit이다.
  - 즉, detail shell에서 stored owner 우선 규칙은 이미 닫혔으므로, 다음 판단은 `pure legacy`와 `old stored meta without importMetadata`에 남은 fallback을 같은 historical class로 다루지 않고 각각 언제까지 유지할지, backfill/migration이 필요한지, 또는 helper-owned explicit bridge로 계속 남길지를 좁게 정하는 것이다.
- 비범위
  - detail route payload shape 변경
  - stored meta schema 실제 확장
  - import writer redesign 구현
  - legacy bridge 제거
  - owner merge, row rewrite, index repair
- 지금 바로 public fallback 제거가 위험한 이유
  - current stored path의 latest writer batches는 `failed`를 설명할 persisted diagnostics summary와 `fileName` provenance owner를 이미 갖지만, historical old stored meta와 pure legacy batches는 여전히 same helper boundary에서 fallback이 필요하다.
  - 이 상태에서 class 구분 없이 fallback을 걷어내면 historical batch contract가 silent omission/zero로 바뀌고, 반대로 class 구분 없이 bridge를 영구 유지하면 stored-owner narrowing이 더 이상 진전되지 않는다.

### old stored meta importMetadata gap retention/backfill contract audit

- current runtime class map
  - current code에는 `old stored meta without importMetadata` 전용 enum이나 schema marker가 없다. runtime에서는 `loadStoredFirstBatchTransactions()`가 `hybrid-legacy-transactions`를 반환하고, 같은 read result에서 `policy.metadataSource === "stored"`, `policy.needsLegacyDetailFallback === true`, `read.meta.importMetadata`가 비어 있을 때 이 historical gap class로 해석할 수 있다.
  - `normalizeBatchMeta()`는 missing/invalid `importMetadata`를 그냥 생략한다. 즉, current runtime은 "owner bootstrap 이전 meta"와 "slot이 malformed/stripped meta"를 absence 자체 외에는 구분하지 못한다. [미확인] historical writer 중 malformed `importMetadata`를 실제로 쓴 경로가 있었는지는 별도 증거가 필요하다.
  - 이 class는 stored owner가 전혀 없는 것이 아니다. `createdAt`, `rowCount`, `accounts`, `ymMin`, `ymMax`는 stored meta가 계속 source-of-truth이고, detail helper가 `failed`와 `fileName`만 `legacyBatch` fallback으로 메운다.
  - `saveBatch()`와 `normalizeStoredTransaction()`은 row NDJSON에 diagnostics/provenance/importMetadata를 저장하지 않는다. 따라서 current stored rows만으로는 skipped-row summary나 batch-level `fileName` provenance를 재구성할 수 없다.
- helper-owned explicit bridge retention candidate
  - 후보안 1개:
    - `buildStoredFirstVisibleBatchShell()`과 `getStoredFirstLegacyDetailSummaryFallback()` 안에서만 old stored meta gap class를 계속 bridge한다.
    - 조건은 route-local 분기 추가가 아니라 `hybrid-legacy-transactions && !meta.importMetadata`라는 shared helper 경계에만 둔다.
  - 장점:
    - 가장 작은 surface다. detail route와 verified-success response shell이 같은 helper를 재사용하므로 user-facing source rule drift를 막을 수 있다.
    - guessed metadata write 없이 current user-facing `failed/fileName` 정직성을 유지한다.
    - public `meta.importMetadata` 비노출, payload shape 유지, stored writer 무변경 원칙과도 충돌하지 않는다.
  - 단점:
    - historical one-class mixed-source semantics가 계속 남는다.
    - retention window를 문서로 잠그지 않으면 helper bridge가 사실상 indefinite debt가 될 수 있다.
- batch metadata backfill/migration candidate
  - 후보안 1개:
    - old stored meta gap class에 한해 stored index/meta에 metadata-only backfill을 수행하고, `importMetadata.diagnostics`는 current legacy batch summary의 `total/ok/failed`, `provenance.fileName`은 current legacy batch `fileName`에서 채우는 안이다.
    - 이는 candidate contract일 뿐 current code behavior가 아니다.
  - 최소 source:
    - stored meta/index row
    - same batch id로 resolve된 legacy `V3ImportBatch.total`, `ok`, `failed`, `fileName`
    - same read에서 확인한 hybrid class 조건
  - 필요한 safety proof:
    - 1. same request/read에서 stored meta와 legacy batch가 같은 `batchId`로 함께 resolve돼야 한다.
    - 2. legacy summary가 `total/ok/failed` 및 optional `fileName`을 실제로 갖고 있어야 한다.
    - 3. [검증 필요] current legacy summary가 original import summary를 여전히 대표한다는 증거가 필요하다. `mergeBatchMeta()`는 `createdAt`, `fileName`, `total`, `ok`, `failed`를 시간이 지나며 갱신할 수 있어, current legacy summary를 곧바로 stored source-of-truth로 고정하면 post-import drift를 영구화할 위험이 있다.
  - 한계:
    - current stored rows에는 skipped-row diagnostics나 batch provenance가 없으므로 stored-side proof만으로 backfill할 수 없다.
    - row-level legacy `sourceInfo.fileName`은 provenance 보조 근거가 될 수 있어도 skipped summary는 증명하지 못한다.
- 후보 tradeoff
  - helper-owned retention은 구현 비용과 contract risk가 가장 작다. 대신 gap class가 남는다.
  - metadata-only backfill은 future fallback retirement에 유리하지만, current legacy summary를 stored truth로 승격할 safety proof가 먼저 필요하다.
  - 따라서 current docs recommendation은 `retention-first, proof-before-backfill`이다.
- pure legacy와 분리해야 하는 이유
  - pure legacy는 stored owner 자체가 없어 detail compat surface를 언제 retire할지의 문제다.
  - old stored meta gap class는 stored owner가 이미 있고 optional slot만 비어 있어 metadata enrichment 또는 helper bridge retention 문제에 가깝다.
  - 둘을 같은 migration/retirement 축으로 묶으면 pure legacy support 종료 판단과 old stored meta proof/backfill 판단이 섞여 next cut이 과도하게 커진다.
- smallest safe next implementation cut
  - direct backfill이나 fallback 제거가 아니라, `src/lib/planning/v3/transactions/store.ts`에 old stored meta gap class를 명시적으로 판정하는 shared predicate/helper를 도입해 shared helper 내부 retention 경계를 먼저 코드로 드러내는 cut이 가장 작다.
  - 이 cut은 payload shape, route-local branch, stored write semantics를 바꾸지 않고 targeted tests만 추가하면 된다.
- predicate helper bootstrap
  - `getStoredFirstLegacyDetailFallbackClass()`와 `isOldStoredMetaImportMetadataGap()` bootstrap으로 old stored meta gap class를 shared helper boundary에서 먼저 드러냈다.
  - 이 bootstrap은 판정 경계만 명시하고, `batch.failed` / `stats.failed` / `fileName` fallback 제거나 backfill behavior는 바꾸지 않는다.
- helper-owned retention window tightening
  - `getStoredFirstLegacyDetailSummaryRetentionWindow()`로 old stored meta gap과 pure legacy가 helper 내부에서 어떤 compat field만 legacy summary fallback을 유지하는지 명시했다. current retained fields는 `batch.failed`, `stats.failed` alias, `fileName`뿐이다.
  - `buildStoredFirstVisibleBatchShell()`는 이 retention window를 직접 읽고, `total`/`ok`/`createdAt`/stored-first account binding 같은 다른 public shell field는 기존 current snapshot 또는 stored-first rule을 그대로 유지한다.
- 비범위
  - pure legacy detail compat surface retirement 결정
  - `src/lib/planning/v3/transactions/store.ts` user-facing behavior 변경
  - detail route payload shape 변경
  - stored meta schema 재확장
  - import writer redesign
  - `/account` route semantics 재수정
  - owner merge, row rewrite, index repair
  - QA gate / beta exposure
- 지금 바로 fallback 제거가 위험한 이유
  - current runtime은 old stored meta gap class를 explicit schema marker 없이 absence로만 식별하므로, proof 없이 helper fallback을 제거하면 historical hybrid batch가 `failed/fileName` blank/zero로 내려갈 수 있다.
  - detail route와 verified-success response shell이 같은 helper를 재사용하므로, route-local에서만 좁히는 제거는 user-facing shell semantics를 다시 분기시킬 위험이 있다.
  - backfill proof 없이 current legacy summary를 stored truth로 바로 써 버리면, original import summary가 아니라 later append/merge로 drift된 legacy summary를 영구화할 수 있다.

### hybrid-legacy-summary-retained fileName compat bridge audit

- current runtime class map
  - `getStoredFirstLegacyDetailFallbackClass()`는 `policy.needsLegacyDetailFallback === true`인 read만 class로 분류하고, `legacy-only`를 `pure-legacy`, `hybrid-legacy-transactions + metadataSource=stored + !meta.importMetadata`를 `old-stored-meta-importMetadata-gap`으로 먼저 가른 뒤 나머지를 `hybrid-legacy-summary-retained`로 둔다.
  - current `loadStoredFirstBatchTransactions()` policy 조합 기준으로 이 class는 사실상 `hybrid-legacy-transactions + stored meta present + legacy transactions present + importMetadata present`다.
  - `getStoredFirstLegacyDetailSummaryRetentionWindow()`는 이 class에서 `retainsLegacyBatchFailed=false`, `retainsLegacyStatsFailedViaBatchAlias=false`로 고정하고, `retainsLegacyBatchFileName`만 `asString(meta.importMetadata?.provenance.fileName)`이 비어 있을 때 `true`로 남긴다.
  - 즉, 이 class는 `pure legacy`나 `old stored meta gap`처럼 stored owner가 비어 있는 class가 아니라, stored diagnostics owner는 이미 있으나 optional provenance label만 blank일 수 있는 hybrid retained class다.
- 왜 `failed`는 stored owner를 따르고 `fileName`만 compat bridge가 남는가
  - `buildStoredFirstVisibleBatchShell()`은 이 class에서 `failed`를 항상 `importMetadata.diagnostics.skipped`에서 읽는다. `stats.failed`도 detail route에서 `batch.failed` alias라 별도 legacy source가 없다.
  - 같은 helper는 `fileName`을 `importMetadata.provenance.fileName -> legacyBatch.fileName` 순서로 읽고, stored provenance가 blank일 때만 legacy summary fallback을 허용한다.
  - `importCsvToBatch()`의 `normalizeImportProvenance()`는 empty `fileName`을 그냥 생략하고, `saveBatch()`는 그 optional provenance shape를 그대로 저장한다. 따라서 blank stored provenance는 old stored meta gap처럼 "owner bootstrap 미완료"의 증거가 아니라, current writer contract가 허용하는 optional input 부재일 수 있다.
  - 그래서 이 class의 남은 bridge는 `failed` bootstrap 문제가 아니라, optional provenance label을 user-facing detail shell에서 어떻게 계속 보여 줄지에 대한 helper-owned compat bridge다.
- current source/proof map
  - 이미 있는 proof:
    - `StoredImportMetadata` contract는 `diagnostics`와 optional `provenance.fileName`을 분리해 저장한다.
    - `buildStoredFirstVisibleBatchShell()`와 `getStoredFirstLegacyDetailSummaryRetentionWindow()`는 hybrid retained class에서 `failed` fallback을 끄고 `fileName`만 조건부 bridge로 남긴다.
    - `tests/planning-v3-batches-api.test.ts`는 hybrid retained class에서 stored provenance가 있을 때 `failed=stored diagnostics`, `fileName=stored provenance`를 우선하는 case를 고정한다.
    - 같은 테스트 파일은 `importMetadata.diagnostics present + stored provenance.fileName blank + legacyBatch.fileName present` subcase도 고정해, `retainsLegacyBatchFailed=false`, `retainsLegacyBatchFileName=true` 상태에서 detail output이 `failed/total/ok`는 current rule을 유지하고 `fileName`만 helper-owned compat bridge를 타는 것을 증명한다.
    - `hasHybridRetainedVisibleFileNameCompatBridge()` bootstrap으로 visible `fileName` compat bridge subset이 shared helper에서 explicit해졌고, same test file은 `stored provenance present`, `blank/present`, `blank/blank` truth table을 고정한다.
  - 아직 없는 proof:
    - blank stored provenance가 historical bootstrap gap인지, original import에서도 fileName input이 비어 있었던 정상 case인지 구분할 stored marker는 없다. [미확인]
    - current legacy `batch.fileName`을 trusted provenance source로 승격해도 된다는 migration/backfill 완료 사실은 없다.
- hybrid retained `fileName` bridge retirement-proof audit
  - current subset map
    - `stored provenance.fileName present`
      - hybrid retained class여도 visible `fileName` source는 이미 stored owner다. compat bridge debt가 아니다.
    - `stored provenance.fileName blank + legacyBatch.fileName present`
      - current runtime에서 actually visible compat bridge가 남는 subset이다. detail shell은 stored diagnostics owner를 유지한 채 `fileName`만 legacy summary continuity를 보여 준다.
    - `stored provenance.fileName blank + legacyBatch.fileName blank`
      - shared helper predicate와 `getStoredFirstLegacyDetailSummaryRetentionWindow()`는 이 subset을 더 이상 visible bridge debt로 세지 않는다. user-facing detail output도 계속 blank라 current payload behavior는 바뀌지 않는다.
  - current evidence boundary
    - runtime이 today 직접 볼 수 있는 것은 `importMetadata.diagnostics` 존재 여부, stored provenance `fileName` blank/non-blank, legacy summary `fileName` blank/non-blank뿐이다.
    - runtime은 이 blank stored provenance가 current writer의 정상 optional-input omission인지, historical route/input handoff gap인지, later migration strip인지 구분하지 못한다. `ImportCsvToBatchInput.provenance` 자체가 optional이고 `normalizeImportProvenance()`와 stored meta normalize path는 empty `fileName`을 omission으로 정규화한다.
  - 유지 가능한 compat subset 후보 1개
    - 후보안:
      - `hybrid-legacy-summary-retained + stored provenance.fileName blank + legacyBatch.fileName present` subset만 current helper-owned visible compat subset으로 간주한다.
    - 이유:
      - 이 subset만 user-facing detail shell에서 실제 label continuity를 제공한다.
      - current writer가 optional `fileName` omission을 허용하므로, 이 subset을 backfill이나 fallback removal 없이 compat surface로 남겨 두는 편이 "없는 provenance를 만들지 않는다"는 원칙과 맞다.
  - retirement candidate subset 후보 1개
    - 후보안:
      - `hybrid-legacy-summary-retained + stored provenance.fileName blank + legacyBatch.fileName blank` subset은 no-visible-bridge subset으로 보고, future helper tightening에서 retirement candidate로 본다.
    - 이유:
      - 이 subset은 이미 user-facing `fileName` continuity가 없으므로, visible compat surface 관점의 debt로 계속 셀 필요가 없다.
      - helper가 이 subset까지 indefinite bridge debt로 같이 묶으면 actual visible compat subset보다 debt가 넓게 계산된다.
  - evidence gap / tradeoff
    - visible compat subset 후보는 runtime에서 판별 가능하지만, 그 안에서도 "정상 optional-input omission"과 "historical handoff gap-like case"를 갈라 줄 positive stored marker가 없다.
    - no-visible-bridge retirement candidate는 helper/test bootstrap까지 닫혔지만, 이것이 provenance origin proof를 제공하는 것은 아니다.
    - 따라서 current docs conclusion은 `visible bridge subset only`를 compat debt로 보되, visible subset 내부의 provenance origin 판정은 아직 열지 않는 것이다.
  - retirement proof audit이 backfill보다 먼저여야 하는 이유
    - retirement proof 없이 provenance-only backfill을 먼저 열면, current writer가 정상적으로 비워 둔 optional provenance까지 guessed label로 채울 수 있다.
    - 반대로 retirement proof 없이 broad fallback 제거를 먼저 열면, visible compat subset에서 아직 필요할 수 있는 label continuity를 설명 없이 없애게 된다.
    - 즉, 먼저 "어떤 subset이 실제 bridge debt인가"를 좁혀야만 backfill과 fallback removal 모두가 과장되지 않는다.
- hybrid retained visible `fileName` bridge provenance-origin proof audit
  - current provenance-origin evidence map
    - `ImportCsvToBatchInput.provenance`는 optional이고 `normalizeImportProvenance()`는 blank `fileName`을 omission으로 정규화한다. 따라서 stored `importMetadata.provenance.fileName` blank는 current writer contract만으로도 생길 수 있다.
    - `StoredImportMetadata`는 `diagnostics`와 `provenance.fileName`을 분리해 저장하므로, runtime이 today 직접 확인할 수 있는 것은 stored diagnostics owner 유지 여부와 persisted provenance `fileName` 존재/부재뿐이다.
    - `hasHybridRetainedVisibleFileNameCompatBridge()`와 hybrid retained tests는 `stored provenance.fileName blank + legacyBatch.fileName present`일 때 visible `fileName` bridge가 남는다는 사실만 증명한다.
    - legacy summary `fileName` present는 current user-facing label continuity evidence일 뿐이고, 그 label이 original import provenance였다는 origin proof는 아니다. [미확인]
  - `normal optional omission` 후보 subset 1개
    - 후보안:
      - `hybrid-legacy-summary-retained + stored provenance.fileName blank + legacyBatch.fileName present` subset 안에는 original import에서도 `fileName` input이 비어 있었고, legacy summary label만 later continuity surface로 남은 normal optional omission case가 포함될 수 있다.
    - 근거:
      - current writer는 `fileName` omission을 허용하고 blank를 별도 sentinel 없이 omission으로 정규화한다.
      - stored metadata alone은 "비어 있었음" 이상을 말해 주지 않는다.
  - `historical handoff gap` 후보 subset 1개
    - 후보안:
      - 같은 visible bridge subset 안에는 older route/input handoff에서 provenance `fileName`이 persisted되지 않았지만 legacy summary label만 남은 historical handoff gap-like case도 포함될 수 있다.
    - 근거:
      - hybrid retained class 자체가 stored diagnostics owner와 legacy summary continuity가 섞인 historical surface라는 것은 이미 proof로 닫혔다.
      - 하지만 blank stored provenance가 exactly 어떤 historical path에서 만들어졌는지 가르는 positive marker는 없다. [검증 필요]
  - 둘을 runtime에서 구분하지 못하는 evidence gap
    - current runtime evidence는 `stored provenance.fileName blank/non-blank`와 `legacyBatch.fileName present/blank` truth table뿐이다.
    - "normal optional omission"과 "historical handoff gap"을 가르는 stored marker, migration stamp, created-at boundary, explicit handoff audit field는 현재 없다. [미확인]
    - 그래서 visible compat bridge subset은 helper/test로 고정할 수 있어도, provenance origin proof는 같은 predicate만으로 닫히지 않는다.
  - visible compat bridge subset과 historical handoff gap proof를 분리해야 하는 이유
    - visible subset proof는 "현재 어떤 batch가 user-facing `fileName` continuity debt를 지는가"를 좁히는 일이다.
    - historical handoff gap proof는 "그 debt의 origin이 실제 historical defect였는가"를 증명하는 일이라 요구 evidence가 다르다.
    - 이 둘을 섞으면 current writer가 정상적으로 허용한 optional omission까지 defect-like subset으로 과장하거나, 반대로 historical gap 가능성을 근거 없이 normal omission으로 축소하게 된다.
  - smallest safe next implementation cut 1개
    - 구현이 꼭 필요하다면 next cut은 provenance backfill이 아니라 visible bridge subset에 대해 "origin proof에 쓸 stored marker가 실제로 추가 가능한가"만 점검하는 metadata-only marker audit이다.
    - 이 cut은 helper-visible subset predicate, detail payload shape, writer contract, fallback behavior를 그대로 둔 채 evidence inventory만 늘린다.
  - 그 컷의 비범위
    - provenance-only backfill 구현
    - `fileName` fallback 제거
    - `batch.failed` / `stats.failed` fallback 제거
    - pure legacy detail compat surface retirement 결정
    - old stored meta gap backfill/migration 구현
    - detail route payload shape 변경
    - import writer redesign
    - owner merge, row rewrite, index repair
    - QA gate / beta exposure
  - 지금 바로 provenance backfill이나 `fileName` fallback 제거가 위험한 이유
    - same visible bridge subset이 normal optional omission과 historical handoff gap candidate를 동시에 포함할 수 있으므로, immediate backfill은 origin 미확정 상태에서 guessed provenance를 써 넣게 된다.
    - immediate fallback removal은 origin 미확정 상태에서 user-facing continuity debt를 먼저 지워 버려, later proof audit 없이 compat surface만 축소하는 셈이 된다.
    - current evidence boundary는 "visible bridge debt exists"까지만 닫혔지 "why blank provenance happened"까지 닫지 못했다.
- hybrid retained provenance-origin metadata-only marker audit
  - current metadata evidence inventory
    - current stored batch metadata가 provenance-origin 관련해 직접 보관하는 값은 `importMetadata.diagnostics.rows`, `parsed`, `skipped`, optional `importMetadata.provenance.fileName`뿐이다.
    - `ImportCsvToBatchInput.provenance`와 `StoredImportProvenanceHandoff`도 current code 기준으로 optional `fileName`만 다룬다. explicit `fileNameProvided` boolean, provenance source kind, handoff version/stamp 같은 origin-proof marker는 없다.
    - `normalizeImportProvenance()`는 blank `fileName`을 omission으로 정규화하고, `normalizeStoredImportMetadata()`도 `diagnostics`와 optional `provenance.fileName` 외 필드는 today 보존하지 않는다. 즉 current writer/store handoff는 origin proof marker를 실제로 넘기지도 저장하지도 않는다.
    - `buildStoredFirstVisibleBatchShell()`와 related helper는 `diagnostics`와 optional `fileName`만 읽고, public `meta` projection은 `importMetadata` 전체를 숨긴다. 따라서 metadata-only marker는 first cut에서 public payload나 detail helper output을 건드리지 않고 internal metadata boundary에만 추가할 수 있다.
  - metadata-only marker 후보 1개
    - 후보안:
      - `importMetadata.provenance.fileNameProvided: boolean`
    - 이유:
      - 이 field는 marker-aware writer가 trusted `fileName` provenance를 handoff 시점에 실제로 가졌는지 여부를 positive proof로 남긴다.
      - same batch metadata boundary 안에서 `fileName`과 같이 저장하면 provenance-origin 판단을 writer/store contract에 붙인 채 public payload는 그대로 유지할 수 있다.
      - `source kind` alone은 current `source: "csv"`와 중복돼 omission vs gap을 가르지 못하고, `handoff version`/marker stamp alone도 "marker-aware write였다"는 사실만 줄 뿐 omission vs gap을 직접 분리하지 못한다. 그래서 smallest useful marker는 explicit omission/provided boolean 쪽이다.
  - marker가 분리 가능한 subset / 분리 불가능한 subset
    - 분리 가능한 subset:
      - `fileNameProvided=false` + `provenance.fileName` absent
      - marker-aware writer가 trusted `fileName` input 없이 저장한 normal optional omission subset으로 더 좁힐 수 있다.
      - `fileNameProvided=true` + `provenance.fileName` present
      - marker-aware writer가 trusted `fileName` provenance를 실제로 저장한 subset으로 더 좁힐 수 있다.
    - 분리 불가능한 subset:
      - marker missing + `provenance.fileName` blank + legacy `batch.fileName` present
      - 이 subset은 historical handoff gap, pre-marker normal omission, later malformed/stripped metadata를 runtime에서 계속 구분하지 못한다. [미확인]
      - `fileNameProvided` marker만으로도 legacy `batch.fileName`이 original import provenance였는지, migration/backfill이 완료됐는지, current legacy label이 later append/merge drift를 겪지 않았는지는 증명하지 못한다. [검증 필요]
  - marker 추가 시 expected writer/store touchpoint
    - `src/lib/planning/v3/domain/transactions.ts`
      - `StoredImportProvenanceHandoff` / `StoredImportMetadata` contract에 marker field를 추가하는 boundary가 된다.
    - `src/lib/planning/v3/service/importCsvToBatch.ts`
      - `normalizeImportProvenance()`와 `buildStoredImportMetadataHandoff()`가 current handoff 시점의 omission/provided decision을 marker로 남기는 touchpoint가 된다.
    - `src/lib/planning/v3/store/batchesStore.ts`
      - `normalizeStoredImportMetadata()`와 `normalizeBatchMeta()`가 marker를 sanitize/persist/rehydrate하는 store boundary가 된다.
    - `src/lib/planning/v3/transactions/store.ts`
      - first cut에서는 marker를 read-side behavior에 연결하지 않아도 된다. detail helper/public payload는 existing `diagnostics`/`fileName` rule을 유지한 채 metadata boundary만 더 좁힐 수 있다.
  - smallest safe next implementation cut 1개
    - next cut이 꼭 필요하다면 provenance backfill이나 fallback 제거가 아니라, stored batch metadata에 `fileNameProvided` 같은 explicit omission/provided marker를 추가하고 writer/store normalization만 맞추는 metadata-only marker bootstrap이 가장 작다.
    - 이 cut은 new write부터 marker-aware subset을 만들 뿐, old batch에 대한 retrofit/backfill, detail payload shape, helper-visible fallback rule은 건드리지 않는다.
  - bootstrap result
    - `StoredImportMetadata.provenance.fileNameProvided` bootstrap이 열려 new stored batch metadata는 writer/store boundary에서 trusted non-empty `fileName` handoff 여부를 `true/false`로 저장할 수 있게 됐다.
    - current import routes와 writer normalization은 blank `fileName`을 omission으로 계속 접기 때문에 `false`는 omitted 또는 blank-normalized input을 뜻하고, reader behavior/public payload/compat bridge fallback은 이번 cut에서 그대로 유지한다.
    - `tests/planning-v3-batchesStore-importCsvToBatch.test.ts`는 explicit blank provenance handoff가 persisted `provenance.fileName` absent + `fileNameProvided=false`로 접힌다는 점을 직접 고정한다.
    - `tests/planning-v3-batches-import-csv-api.test.ts`는 blank JSON `fileName` input이 route boundary에서 provenance omission으로 접히고 public response shape를 넓히지 않는다는 점을 직접 고정한다.
  - blank-vs-omission semantic split audit
    - current `false` semantics map
      - current import routes는 multipart `File.name`와 optional JSON `fileName`을 `asString(...).trim()` 기준으로 읽고, blank면 provenance handoff 자체를 생략한다.
      - `normalizeImportProvenance()`도 `input.provenance.fileName`을 trim 뒤 truthy일 때만 `provenance.fileName`을 남기므로, today의 `fileNameProvided=false`는 "trusted non-empty `fileName`이 route/service normalization을 통과하지 못했다"는 canonical class다.
      - store/read boundary는 `provenance.fileName`과 `fileNameProvided`까지만 저장하고, current helper/public payload는 `fileNameProvided`를 read-side decision에 쓰지 않는다. 따라서 explicit blank는 user-facing/operator-facing separate class가 아니다.
    - `keep-equivalent` 후보안 1개
      - current recommendation은 `fileNameProvided=false`를 omitted + blank-normalized input의 shared semantic class로 계속 유지하는 것이다.
      - 장점:
        - current writer normalization, stored metadata shape, proof test와 그대로 맞물린다.
        - blank를 별도 semantic class로 노출해야 할 verified UX/operator requirement가 today 없다. [미확인]
        - helper/public payload/backfill/fallback decision을 reopen하지 않고도 provenance marker contract를 가장 좁게 유지할 수 있다.
      - 단점:
        - future marker-aware writes에서도 "caller가 truly omitted했는지"와 "caller가 blank를 보냈는지"를 runtime metadata만으로는 구분하지 못한다.
    - `split-marker` 후보안 1개
      - future proof가 꼭 필요하다면 `fileNameBlankProvided: boolean` 또는 `fileNameInputState: "omitted" | "blank" | "provided"` 같은 metadata-only marker 후보를 둘 수 있다.
      - 필요 조건:
        - route/service writer contract가 explicit blank를 omission으로 바로 접지 않고 marker-aware handoff로 보존해야 한다.
        - persisted `provenance.fileName`은 계속 absent로 두더라도, blank intent를 별도 marker에 저장하는 touchpoint를 `importCsvToBatch()`와 `batchesStore`에 추가해야 한다.
      - 장점:
        - new marker-aware writes에서는 omission과 explicit blank intent를 더 좁게 설명할 수 있다.
      - 단점:
        - current public/detail surface나 operator flow에서 separate blank class의 실익이 아직 증명되지 않았다. [검증 필요]
        - split marker만으로는 historical no-marker subset, legacy `batch.fileName` origin proof, backfill/migration 완료 사실을 닫지 못한다.
        - current helper/read path가 이 구분을 소비하지 않으므로, immediate marker expansion은 writer contract만 넓히고 visible debt는 그대로 남길 수 있다.
    - historical no-marker subset과 분리해서 다뤄야 하는 이유
      - blank-vs-omission split은 marker-aware new write semantics의 질문이고, historical no-marker subset은 pre-marker batch와 legacy-retained provenance proof의 질문이다.
      - 이 둘을 섞으면 future split marker가 old batch proof까지 해결하는 것처럼 과장되거나, 반대로 unresolved historical debt 때문에 new marker semantics 자체를 과하게 넓히게 된다.
    - smallest safe next implementation cut 1개
      - concrete operator/debug requirement가 실제로 생길 때만, writer/store boundary에 metadata-only split marker를 추가하고 reader/public payload/fallback/backfill은 그대로 두는 cut이 가장 작다.
    - 그 컷의 비범위
      - `blankProvided` 같은 새 marker 실제 구현
      - provenance-only backfill 구현
      - `fileName` fallback 제거
      - `batch.failed` / `stats.failed` fallback 제거
      - detail route payload shape 변경
      - import writer redesign
      - owner merge, row rewrite, index repair
      - QA gate / beta exposure
    - 지금 바로 marker 확장이나 fallback 제거가 위험한 이유
      - current flow에서 blank separate class의 verified product/ops gain이 없는데 marker부터 넓히면, write contract만 복잡해지고 semantic proof completion처럼 오해될 수 있다.
      - fallback 제거 리스크의 핵심은 여전히 historical no-marker subset과 provenance-origin proof debt이므로, blank-vs-omission split alone은 removal safety를 주지 못한다.
  - historical no-marker subset provenance evidence inventory audit
    - current historical no-marker subset evidence map
      - current runtime에서 historical no-marker subset은 두 갈래로 보인다.
        - `policy.mode === "hybrid-legacy-transactions" + policy.metadataSource === "stored" + !meta.importMetadata`
        - `meta.importMetadata present + meta.importMetadata.provenance.fileNameProvided missing`
      - 첫 갈래는 helper가 `old-stored-meta-importMetadata-gap`으로 직접 분류하고, 둘째 갈래는 stored metadata owner는 있으나 marker-aware write proof가 없는 pre-marker subset으로만 읽힌다.
      - `classifyHistoricalNoMarkerProvenanceEvidence()` bootstrap으로 위 두 갈래와 stored provenance `fileName` present/blank, legacy `batch.fileName` present/blank 조합을 read-only truth table helper 하나에서 재사용할 수 있게 됐다.
      - `hasHistoricalNoMarkerVisibleFileNameCompatBridge()`는 이 truth table을 재사용해, `origin-fundamentally-unresolved + legacy batch.fileName present`일 때만 current user-facing visible `fileName` compat bridge debt를 true로 좁힌다.
      - 이 helper는 evidence classification만 수행하며, current fallback/public payload/detail output behavior는 바꾸지 않는다.
      - 즉, current helper stack은 historical no-marker subset 안에서 `marker-missing-but-otherwise-stable`와 `origin-fundamentally-unresolved`를 read-only로 구분하고, visible `fileName` debt는 후자 중 legacy label이 actually present한 subset으로만 더 좁혔다.
      - runtime이 today 직접 확인할 수 있는 evidence는 `importMetadata` 존재 여부, `diagnostics.rows/parsed/skipped` 존재 여부, stored provenance `fileName` present/blank, `fileNameProvided` marker 존재/부재, legacy `batch.fileName` present/blank, 그리고 helper fallback class뿐이다.
      - runtime이 today 직접 확인할 수 없는 evidence는 historical writer version, migration/backfill 완료 stamp, malformed/stripped metadata 여부, legacy `batch.fileName`의 original import provenance 여부다. [미확인]
    - `marker-missing but otherwise stable` 후보 subset 1개
      - 후보안:
        - `importMetadata.diagnostics present + importMetadata.provenance.fileName present + fileNameProvided missing`
      - current runtime이 말할 수 있는 것:
        - stored metadata owner는 already 살아 있고, current visible `fileName`도 stored provenance에서 직접 내려갈 수 있다.
        - 이 subset은 visible bridge debt가 아니라 marker 부재 proof question에 더 가깝다.
      - current runtime이 말할 수 없는 것:
        - stored `provenance.fileName`이 original import handoff였는지, later backfill/migration/repair 결과인지 구분할 positive stamp는 없다. [검증 필요]
    - `origin fundamentally unresolved` 후보 subset 1개
      - 후보안:
        - `fileNameProvided` marker missing + legacy `batch.fileName` present + (`!importMetadata` 또는 stored `provenance.fileName` blank)
      - current runtime이 말할 수 있는 것:
        - current read는 legacy label continuity evidence를 볼 수 있고, old stored meta gap인지 hybrid retained blank provenance인지 fallback class 수준까지는 좁힐 수 있다.
        - same unresolved class 안에서도 legacy `batch.fileName` blank case는 no-visible-debt subset으로 분리할 수 있다.
      - current runtime이 말할 수 없는 것:
        - legacy `batch.fileName`이 original provenance인지, stored handoff gap인지, marker bootstrap 이전 normal omission인지, malformed/stripped metadata인지 구분할 수 없다. [미확인]
    - 둘을 runtime에서 가르는 데 부족한 evidence gap
      - `fileNameProvided` missing 이유를 설명할 historical marker, writer version, migration stamp가 없다.
      - `!importMetadata`가 genuine bootstrap-era absence인지 malformed/stripped slot인지 가르는 stored proof도 없다.
      - legacy `batch.fileName`과 stored provenance origin을 연결해 주는 immutable handoff audit field가 없다.
    - historical no-marker subset과 blank-vs-omission split을 분리해야 하는 이유
      - blank-vs-omission split은 marker-aware new write semantics의 질문이고, historical no-marker subset audit은 marker 자체가 없던 batch에서 today 무엇을 증명할 수 있는지의 질문이다.
      - 이 둘을 섞으면 future split marker가 historical proof debt를 해결하는 것처럼 과장되거나, 반대로 historical gap 때문에 new-write semantics decision까지 불필요하게 넓어진다.
    - unresolved visible debt retirement-proof audit
      - unresolved visible debt current boundary
        - current helper stack 기준 unresolved visible debt subset은 `classifyHistoricalNoMarkerProvenanceEvidence() === "origin-fundamentally-unresolved"`이면서 `hasHistoricalNoMarkerVisibleFileNameCompatBridge() === true`인 class다.
        - 즉 `legacy batch.fileName present`이고, 동시에 stored side는 `!importMetadata` old gap 또는 stored `provenance.fileName` blank + `fileNameProvided` missing인 class만 current helper-owned visible `fileName` debt로 남는다.
      - `keep-as-helper-owned-debt` 후보 subset 1개
        - 위 unresolved visible debt subset 전체는 immutable handoff proof, trusted source-bound migration/backfill completion stamp, equivalent proof-bearing audit trail이 없으면 helper-owned debt로 유지하는 편이 가장 안전하다.
      - `retirement-candidate only if proof X exists` 후보 subset 1개
        - 같은 unresolved visible debt subset이라도, current visible legacy label이 trusted original handoff 또는 audited migration/backfill 결과라는 사실을 묶어 줄 proof X가 생길 때만 retirement candidate로 좁힐 수 있다.
      - proof requirement matrix
        - current legacy `batch.fileName` 존재만으로는 retirement proof가 되지 않는다.
        - stored provenance `fileName` blank/present alone도 retirement proof가 되지 않는다.
        - historical writer/version marker alone은 era를 좁힐 수 있어도 current visible label의 provenance를 증명하지 못하므로 불충분하다.
        - migration/backfill completion stamp도 trusted source binding 없이 단독으로는 불충분하다. [검증 필요]
        - immutable handoff proof, 또는 trusted source binding을 포함한 audited migration/backfill completion proof만 retirement candidate 근거가 될 수 있다. [검증 필요]
      - `marker-missing-but-otherwise-stable`와 왜 같은 retirement path로 묶으면 안 되는지
        - 이 subset은 current visible `fileName`이 already stored provenance owner에서 내려가므로 visible debt retirement question이 아니라 marker 부재 proof question에 더 가깝다.
        - same retirement path로 묶으면 stored-owner stable subset까지 unresolved visible debt처럼 과장하게 된다.
    - unresolved visible debt proof-bearing source inventory audit
      - current proof-bearing source inventory 1개
        - current stored batch metadata/detail helper path에서 today 직접 읽는 값은 `importMetadata.diagnostics.{rows,parsed,skipped}`, `importMetadata.provenance.fileName`, `importMetadata.provenance.fileNameProvided`, helper-carried `legacy batch.fileName` 정도다.
        - domain/legacy write surface에는 `V3ImportBatch.sha256`, row-level `sourceInfo.{fileName,sha256}`가 존재하지만, current `ImportBatchMeta.importMetadata`에는 persisted source binding이 없고 `pickLegacyBatchFallback()`/historical helper path도 이를 읽지 않는다.
      - `already persisted but insufficient` source 후보들
        - `legacy batch.fileName` alone은 visible continuity label일 뿐 original handoff proof가 아니다.
        - batch-level `importMetadata.provenance.fileName` blank/present alone도 unresolved visible debt subset retirement proof가 되지 않는다.
        - batch-level `fileNameProvided` alone은 provided/omitted marker일 수 있어도 current visible legacy label provenance를 묶어 주지 못한다.
        - `diagnostics.rows/parsed/skipped` alone은 parse outcome counts일 뿐 source binding proof가 아니다.
        - legacy `batch.sha256` alone도 append/merge path에서 current label과 independently carry/update될 수 있어 immutable original-handoff proof로 쓰기 어렵다.
      - `maybe promotable only with extra binding` 후보 1개
        - legacy `batch.sha256`과 row-level `sourceInfo.sha256`는 future에 trusted import artifact stamp 후보가 될 여지는 있다.
        - 다만 current visible `legacy batch.fileName`과 same import artifact임을 stored batch metadata에 auditably bind하는 field와 audited completion source가 추가될 때만 retirement candidate proof로 승격될 수 있다.
      - `currently no usable proof source` 결론 여부
        - current codebase에서 already persisted/readable source만으로는 unresolved visible debt subset retirement에 필요한 proof X를 만들 수 없다는 쪽이 현재 결론이다.
    - unresolved visible debt source-binding design memo audit
      - current maybe-promotable source map 1개
        - current maybe-promotable candidate는 legacy `batch.sha256`과 row-level `sourceInfo.sha256` 조합이다.
        - 다만 `pickLegacyBatchFallback()`는 `sha256`를 carry하지 않고, current stored batch metadata도 `fileName`/`fileNameProvided`까지만 저장하므로 helper/read path에서 바로 proof-bearing source로 승격되지 않는다.
      - minimal source-binding requirement list 1개
        - source-binding은 batch-level stored metadata에 persisted되어 current helper/read path가 route-local 추가 조회 없이 읽을 수 있어야 한다.
        - binding은 trusted import artifact digest와 current visible label로 attest하려는 `fileName`을 같은 owner boundary 안에서 함께 묶어야 한다.
        - binding origin은 `writer-handoff`인지 `audited migration/backfill`인지처럼 provenance를 설명할 수 있어야 하고, legacy label alone에서 추론해 생성되면 안 된다. [검증 필요]
        - append/merge 이후에도 label -> digest 관계가 silent rebinding 되지 않도록, auto-carry/update 대신 explicit invalidation 또는 audited recomputation boundary가 필요하다. [검증 필요]
      - `source-binding design memo` 후보 1개
        - [가칭] batch-level persisted source-binding tuple 후보: trusted artifact digest + attested visible `fileName` label + binding origin kind.
        - 이 tuple은 new write에서는 writer handoff가 직접 채우고, historical subset에서는 audited migration/backfill completion source가 있을 때만 채우는 쪽이 가장 좁다.
        - reader/helper는 tuple이 완전할 때만 unresolved visible debt를 retirement candidate로 본다. tuple 일부만 있거나 origin kind가 없으면 helper-owned debt를 유지한다.
      - `explicit no-source closeout`로 남겨야 하는 경우의 기준 1개
        - batch-level persisted binding을 stored owner에 둘 수 없거나, append/merge 이후 digest/label drift를 false proof 없이 설명할 수 없거나, binding origin을 legacy inference와 구분해 적지 못하면 `existing candidate is not promotable` no-source closeout으로 남기는 편이 안전하다.
    - source-binding slot writer/store feasibility audit
      - writer/store touchpoint map 1개
        - current stored new write path에서는 `importCsvToBatch()`의 `metadataHandoff` 생성과 `saveBatch()` -> `normalizeBatchMeta()` -> `normalizeStoredImportMetadata()`가 batch-level metadata slot을 가장 작게 받는 touchpoint다.
        - current detail/helper reader는 `ImportBatchMeta.importMetadata`만 읽으므로, writer/store-only slot feasibility는 public payload나 row schema를 바꾸지 않고도 따로 검토할 수 있다.
      - `feasible only for new write subset` 후보안 1개
        - stored writer `importCsvToBatch()` 경로는 trusted `provenance.fileName` handoff와 batch-level `importMetadata` persist/rehydrate가 이미 있으므로, new write subset 한정으로는 source-binding slot을 가장 좁게 심을 수 있다.
        - 이 경우에도 row schema를 건드리지 않고 batch metadata에만 slot을 두는 편이 false-proof surface를 가장 작게 유지한다.
      - `append/merge blocks safe promotion` 후보안 1개
        - legacy `appendBatchFromCsv()`는 `mergeBatchMeta()`에서 incoming `fileName`/`sha256`를 current batch summary에 carry하고, merge 시 row `sourceInfo`에도 `intoBatch.fileName` + `intoBatch.sha256 || fromBatch.sha256`를 조합하므로 current visible label과 trusted artifact digest가 drift할 수 있다.
        - 따라서 append/merge path에는 explicit invalidation 또는 audited recompute rule이 없으면 same source-binding slot을 safe proof로 승격하기 어렵다.
      - false-proof risk matrix 1개
        - `new write + trusted handoff + batch metadata persist`는 feasibility 후보지만, current code에는 아직 slot과 retirement gating이 없으므로 proof completion이 아니다.
        - `legacy append current batch carry`는 summary-level label/digest auto-carry 때문에 false-proof risk가 높다.
        - `merge row sourceInfo reuse`는 visible label과 digest가 cross-batch 조합으로 재사용될 수 있어 false-proof risk가 가장 높다.
        - `historical no-marker unresolved subset`은 source 자체가 비어 있어 slot feasibility와 별개로 explicit no-source closeout 성격이 더 강하다.
    - append/merge source-binding explicit no-source closeout audit
      - append/merge false-proof touchpoint map 1개
        - `mergeBatchMeta()`는 incoming `fileName`/`sha256`를 current legacy batch summary에 carry하므로, visible legacy label과 digest가 latest append input으로 덮여도 original handoff처럼 보일 수 있다.
        - merge row 생성은 `intoBatch.fileName`과 `intoBatch.sha256 || fromBatch.sha256`를 함께 재사용하므로, current row-level `sourceInfo`도 one-artifact proof가 아니라 cross-batch carry 결과가 될 수 있다.
        - `pickLegacyBatchFallback()`와 detail helper retention은 current legacy summary `fileName`만 visible compat field로 다시 들고 오므로, append/merge summary carry가 곧바로 visible debt surface로 이어진다.
      - `explicit no-source closeout` 대상 surface 목록 1개
        - legacy `appendBatchFromCsv()` summary carry surface
        - merge row `sourceInfo` reuse surface
        - wider legacy summary carry를 그대로 읽는 `pickLegacyBatchFallback()`/detail visible `fileName` compat surface
      - `new-write-only spike allowed` boundary 1개
        - 후속 spike는 stored writer `importCsvToBatch()` -> stored batch metadata slot 경계까지만 허용한다.
        - append-only legacy writer, merge path, legacy summary carry surface에는 same source-binding proof semantics를 열지 않는다.
      - `wider surface prohibited until proof rule exists` boundary 1개
        - append/merge에 explicit invalidation rule, audited recompute rule, append/merge 전용 proof field가 생기기 전에는 wider legacy surface 전체를 no-source closeout class로 유지한다.
        - 이 금지는 historical no-marker unresolved subset과 다른 이유로 유지된다. historical no-marker는 source absence 문제이고, append/merge는 carried/reused source가 false proof로 보일 수 있는 drift 문제다.
    - new-write-only source-binding slot spike
      - `importCsvToBatch()` new write subset에서는 `ImportBatchMeta.importMetadata.sourceBinding` optional slot이 이미 bootstrap 완료 상태다.
      - current slot shape는 `artifactSha256`, `attestedFileName`, `originKind: "writer-handoff"`이며, trusted CSV text digest와 normalized visible `fileName` handoff를 같은 stored metadata owner boundary 안에 둔다.
      - normalized `fileName` present case에서만 slot이 생성되고, omitted/blank-normalized input에서는 `fileNameProvided=false`만 남긴 채 slot을 만들지 않는다.
      - append/merge/wider legacy surface는 여전히 explicit no-source closeout 상태이며, reader retirement gating과 public payload 전환도 이번 라운드 범위 밖이다.
    - sourceBinding read-only proof-candidate boundary audit
      - current reader/helper `sourceBinding` visibility map 1개
        - `toStoredFirstPublicImportBatchMeta()`는 `importMetadata` 전체를 숨기므로, batch list/detail `meta` public payload에는 `sourceBinding`이 노출되지 않는다.
        - `buildStoredFirstVisibleBatchShell()`은 `diagnostics.skipped`와 `provenance.fileName`만 읽고, `sourceBinding`은 current visible `batch.fileName`/`failed` contract 계산에 사용하지 않는다.
        - detail route도 `batch`, `stats`, `meta`, `data`를 같은 helper stack으로 만들기 때문에, current `sourceBinding` slot은 reader/helper path에 저장돼 있어도 internal-only ignored field 상태다.
      - `read-only proof candidate`로 허용 가능한 해석 1개
        - `sourceBinding` present는 new write subset에서 trusted CSV text digest와 attested visible `fileName` handoff가 `originKind: "writer-handoff"`로 batch metadata owner boundary에 함께 저장됐다는 점까지만 internal candidate로 말할 수 있다.
        - 이 해석은 helper-owned read-only comparison/audit candidate일 뿐이고, current visible contract proof나 retirement completion을 뜻하지 않는다.
      - `still not enough for retirement/fallback removal` 목록 1개
        - current slot alone으로는 `fileName` fallback 제거 proof가 되지 않는다.
        - append/merge/wider legacy surface proof로는 쓸 수 없다.
        - historical no-marker subset proof로는 쓸 수 없다.
        - unresolved visible debt retirement proof나 audited backfill completion source로는 쓸 수 없다.
        - public payload 노출 또는 user-facing copy change 근거로도 아직 부족하다.
    - sourceBinding internal read-only candidate helper bootstrap
      - `hasStoredFirstReadOnlySourceBindingCandidate()` 같은 shared helper가 추가되어, `sourceBinding` present subset을 route-local 분기 없이 helper level에서만 식별할 수 있게 되었다.
      - current helper는 `artifactSha256`, `attestedFileName`, `originKind: "writer-handoff"`, 그리고 stored `provenance.fileName` 일치까지 확인할 때만 true를 반환한다.
      - 이 helper는 internal read-only candidate present만 말하며, retirement completion, fallback removal, append/merge proof, public exposure는 여전히 말하지 않는다.
    - sourceBinding present subset truth-table / inventory memo
      - current `sourceBinding present` truth table 1개
        - `candidate-complete`: slot present + valid `artifactSha256` + non-blank `attestedFileName` + `originKind: "writer-handoff"` + stored `provenance.fileName` exact match. current helper는 이때만 true다.
        - `present-but-incomplete`: slot object는 present지만 digest invalid, `attestedFileName` blank, `originKind` invalid, stored provenance mismatch 같은 이유로 helper가 false를 반환하는 subset이다.
        - `candidate-absent`: `sourceBinding` slot 자체가 없어서 helper가 false를 반환하는 subset이다.
      - current recommendation 1개
        - docs 기준으로 `present-but-incomplete`와 `candidate-absent`를 분리해 두는 실익은 있다. 그래야 current helper false를 전부 "slot absent"로 과장해 기록하지 않고, future malformed/manual-edit/noisy stored data를 defensive audit 대상으로만 남길 수 있다. [검증 필요]
        - 다만 current new-write writer contract는 intentional incomplete subset을 만들지 않으므로, 지금 단계에서는 docs-only memo로 충분하고 별도 runtime classifier를 즉시 추가할 필요는 없다.
    - sourceBinding false-side concrete consumer need audit
      - current false-side consumer inventory 1개
        - current runtime helper/route caller 중 `present-but-incomplete`와 `candidate-absent`를 서로 다르게 읽는 concrete consumer는 확인되지 않았다.
        - detail route는 `hasStoredFirstReadOnlySourceBindingCandidate()` 자체를 소비하지 않고, batch/fileName/failed/stats/public meta contract도 false-side split과 무관하게 그대로 유지된다.
        - `getBatchSummary()`를 포함한 current summary helper path도 `sourceBinding` false side를 읽지 않고, public summary payload는 `toStoredFirstPublicMeta()` boundary만 공유한다.
        - operator/debug-oriented helper-owned internal audit/inventory surface도 current codebase 안에서는 확인되지 않았다. 즉, false-side split을 읽을 "surface exists but 아직 concrete action 없음"이 아니라 helper/route/service 기준으로는 surface 자체가 없다.
        - current tests와 docs만 false-side split을 inventory하고 있으며, runtime branch/response/logging은 이를 별도 class로 쓰지 않는다.
      - `docs-only memo sufficient` 후보안 1개
        - current recommendation은 docs-only memo sufficient다. new-write writer contract가 intentional incomplete subset을 만들지 않고, present-but-incomplete가 생겨도 지금은 defensive audit note 외에 다른 runtime 행동 차이를 만들 caller가 없기 때문이다.
      - `runtime classifier justified only if consumer X exists` 후보안 1개
        - runtime enum/classifier는 future helper-owned internal audit/inventory consumer가 실제로 생겨, `present-but-incomplete`를 `candidate-absent`와 다른 operator/debug consequence로 읽어야 할 때만 정당화된다. [검증 필요]
        - 그 future consumer도 append/merge explicit no-source closeout이나 historical no-marker unresolved subset과 같은 축으로 합쳐지면 안 되고, current `sourceBinding present` subset 내부 inventory만 읽는 좁은 helper-owned surface여야 한다.
        - 그 consumer가 없다면 false-side split 구현은 current boolean helper와 docs memo를 중복할 뿐이다.
    - sourceBinding no-current-consumer-surface post-closeout doc sync
      - current synced state 1개
        - latest closeout 기준으로 `present-but-incomplete`와 `candidate-absent` false-side split을 실제로 소비하는 helper-owned internal consumer surface는 current codebase 안에서 재확인되지 않았다.
        - current runtime에서 false-side split을 아는 곳은 tests와 docs뿐이며, helper/route/service는 여전히 current boolean helper 결과를 더 세분화해 사용하지 않는다.
        - 따라서 current next question은 "consumer surface inventory를 다시 할 것인가"가 아니라 "future internal audit/debug consumer가 새로 생길 때만 classifier 필요성을 다시 열 것인가"로 좁혀진다.
    - sourceBinding future internal audit/debug consumer emergence audit
      - future consumer emergence trigger list 1개
        - future helper-owned internal audit/debug surface가 `present-but-incomplete`를 `candidate-absent`와 다른 internal-only consequence로 읽어야 할 때만 classifier 재오픈이 정당화된다.
        - 그 consequence는 internal audit/debug inventory, malformed/manual-edit/noisy stored binding 별도 집계, operator/debug warning 같은 helper-owned read-only 의미 차이여야 하며, public payload/visible shell 변화가 없어야 한다. [검증 필요]
        - 같은 surface가 current boolean helper를 그대로 재사용하거나, docs/tests inventory만 추가하거나, public 비노출 상태를 그대로 유지한 채 별도 internal consequence를 만들지 않는다면 아직 trigger가 아니다.
      - `reopen justified` 후보안 1개
        - future internal audit/debug helper가 `sourceBinding present` subset 내부에서 `present-but-incomplete`를 별도 triage bucket으로 보관하거나 로그/진단 메시지를 다르게 남겨야 할 때만 read-only classifier가 정당화된다. [검증 필요]
      - `still docs-only sufficient` 후보안 1개
        - docs memo 보강, 테스트 fixture 추가, existing boolean helper 재사용, public payload 비노출 유지, detail/summary route unchanged 상태만으로는 여전히 docs-only memo sufficient다.
    - smallest safe next cut 1개
      - future consumer emergence trigger audit까지 닫혔으므로, 후속 컷은 broad 구현이 아니라 trigger X가 실제로 생겼는지 재확인한 뒤에만 internal-only read classifier를 검토하는 수준이 가장 작다.
      - 이 후속 컷도 append/merge path는 slot 미지원 no-source closeout 상태로 그대로 두고, historical no-marker subset과 `sourceBinding` present subset을 같은 proof class로 묶지 않아야 한다.
      - 반대로 append/merge까지 같은 slot semantics로 묶거나, current slot을 곧바로 fallback 제거 proof로 승격하면 false-proof risk가 너무 커지므로, current recommendation은 wider surface에 대해서는 `explicit no-source closeout`을 유지하는 쪽이다.
    - 그 컷의 비범위
      - `blankProvided` 같은 split marker 실제 구현
      - provenance-only backfill 구현
      - `fileName` fallback 제거
      - `batch.failed` / `stats.failed` fallback 제거
      - detail route payload shape 변경
      - import writer redesign
      - owner merge, row rewrite, index repair
      - QA gate / beta exposure
    - 지금 바로 provenance-only backfill이나 `fileName` fallback 제거가 위험한 이유
      - current slot이 있어도 append/merge drift나 historical no-marker unresolved subset을 설명하는 proof boundary는 아직 reader/helper side에서 닫히지 않았으므로, immediate backfill은 여전히 false proof 또는 guessed provenance를 밀어 넣을 수 있다.
      - fallback 제거도 current `sourceBinding` slot을 곧바로 retirement proof처럼 취급하면, unresolved visible debt subset의 last visible legacy label continuity를 먼저 지워 버릴 수 있다.
      - 따라서 current recommendation은 `append/merge explicit no-source closeout 유지, sourceBinding internal read-only proof-candidate boundary 유지, then helper-owned read-only classifier/inventory before backfill/fallback-removal`이다.
  - 그 컷의 비범위
    - metadata-only marker 실제 구현 이후 reader behavior 전환
    - provenance-only backfill 구현
    - `fileName` fallback 제거
    - `batch.failed` / `stats.failed` fallback 제거
    - pure legacy detail compat surface retirement 결정
    - old stored meta gap backfill/migration 구현
    - detail route payload shape 변경
    - import writer redesign
    - owner merge, row rewrite, index repair
    - QA gate / beta exposure
  - 지금 바로 provenance backfill이나 `fileName` fallback 제거가 위험한 이유
    - marker candidate를 문서로 정해도 existing no-marker historical subset은 그대로 unresolved이므로, immediate backfill은 여전히 guessed provenance를 쓰게 된다.
    - immediate fallback removal은 marker-aware omission subset과 unresolved historical subset을 분리하기 전에 visible continuity debt를 먼저 줄여 버린다.
    - 따라서 current recommendation은 `metadata-only marker first, proof-before-backfill, proof-before-fallback-removal`이다.
- route/helper debt를 retirement decision 없이 두는 위험
  - `buildStoredFirstVisibleBatchShell()`와 verified-success response shell은 같은 helper를 재사용하므로, blank stored provenance hybrid retained reads를 한 덩어리 debt로 계속 두면 route마다 같은 one-field mixed-source semantics가 indefinite debt로 남는다.
  - visible compat subset과 no-visible-bridge subset을 문서로라도 먼저 분리하지 않으면, future backfill audit과 helper tightening audit이 모두 "blank provenance 전체"를 한 class로 과장해 다루게 된다.
- provenance-only backfill candidate 1개
  - 후보안:
    - `hybrid-legacy-summary-retained` 중 `importMetadata.diagnostics`는 이미 있고 `provenance.fileName`만 blank인 batch에 한해, legacy `batch.fileName`을 stored `importMetadata.provenance.fileName`으로 metadata-only backfill하는 안이다.
  - 장점:
    - `failed` owner를 건드리지 않고 `fileName` compat bridge만 줄일 수 있다.
    - future detail shell에서 마지막 legacy summary bridge 하나를 제거하기 쉬워진다.
  - 단점:
    - current writer contract는 optional `fileName` 부재를 허용하므로, post-hoc backfill은 original import가 주지 않았던 provenance를 새로 만드는 셈일 수 있다.
    - legacy `mergeBatchMeta()`는 later append/merge 과정에서 `fileName`을 갱신할 수 있어, current legacy label을 backfill하면 drifted label을 stored truth로 영구화할 위험이 있다.
    - trusted provenance source와 migration 완료 증거가 아직 없다. [검증 필요]
- helper-owned retention candidate 1개
  - 후보안:
    - current helper contract를 유지해 `hybrid-legacy-summary-retained`에서는 `failed`/`stats.failed`는 stored diagnostics owner를 고수하고, `fileName`만 stored provenance가 blank일 때 legacy summary fallback을 허용한다.
  - 장점:
    - guessed provenance write 없이 current user-facing label continuity를 유지한다.
    - detail route와 verified-success response shell이 같은 helper를 재사용하므로 mixed-source drift를 가장 작게 막는다.
    - `pure legacy`, `old stored meta gap`과 달리 "provenance 한 필드만 남은 compat bridge"라는 경계를 가장 좁게 유지한다.
  - 단점:
    - hybrid retained class에 one-field mixed-source semantics가 계속 남는다.
    - blank provenance historical subset을 얼마나 오래 helper-owned debt로 둘지 별도 retirement proof가 필요하다.
- 두 후보의 tradeoff
  - provenance-only backfill은 future fallback 제거에 유리하지만, current evidence만으로는 "없는 provenance를 만들지 않는다"는 원칙을 지키기 어렵다.
  - helper-owned retention은 debt를 남기지만, blank provenance가 정상 optional-input case일 가능성을 보존한다.
  - 따라서 current recommendation은 `retention-first, proof-before-provenance-backfill`이다.
- smallest safe next implementation cut 1개
  - visible subset predicate bootstrap은 helper/test에서 닫혔다. 다음 implementation cut이 꼭 필요하다면, metadata-only provenance backfill보다 먼저 이 predicate를 future helper audits가 재사용하도록 유지하면서 visible subset 내부 provenance origin proof를 더 좁히는 cut이 가장 작다.
  - 이 cut은 payload shape, writer owner, stored schema, legacy merge semantics를 바꾸지 않는다.
- 그 컷의 비범위
  - provenance-only backfill 구현
  - `batch.failed` / `stats.failed` fallback 제거
  - pure legacy detail compat surface retirement 결정
  - old stored meta gap backfill/migration 구현
  - detail route payload shape 변경
  - import writer redesign
  - owner merge, row rewrite, index repair
  - QA gate / beta exposure
- 지금 바로 `fileName` fallback 제거가 위험한 이유
  - blank stored provenance는 current writer contract가 허용하는 optional input 부재일 수 있어, 제거 즉시 historical hybrid batch의 visible `fileName`이 silent omission으로 바뀔 수 있다.
  - 이 class는 `failed` owner proof는 이미 있지만 `fileName` provenance proof는 아직 없다. 따라서 `failed`와 같은 bootstrap 논리로 곧바로 retire하면 class 해석이 잘못 섞인다.
  - detail route와 verified-success response shell이 같은 helper를 공유하므로, route-local에서만 `fileName` fallback을 제거하면 user-facing shell semantics가 다시 갈라질 수 있다.
  - legacy `mergeBatchMeta()`는 incoming `fileName`으로 legacy summary label을 갱신할 수 있어, retirement proof 없이 provenance backfill을 먼저 열면 drifted legacy label을 stored truth로 고정할 위험도 남는다.

### canonical stored account writer bootstrap audit

- current writer owner map
  - legacy account write owner는 `src/lib/planning/v3/service/transactionStore.ts`의 `updateBatchAccount()`다. 이 경로는 legacy `batches.ndjson`에 `accountId`, `accountHint`를 append-write한다.
  - stored batch owner는 `src/lib/planning/v3/store/batchesStore.ts`의 `saveBatch()`를 통해 `ImportBatchMeta.accounts`를 저장하고, stored-meta-only bootstrap에서는 `updateStoredBatchAccountBinding()`이 `index.json`의 `ImportBatchMeta.accounts`만 부분 갱신한다.
- affected readers
  - `getStoredFirstBatchBindingAccountId()`와 `applyStoredFirstBatchAccountBinding()`가 stored meta `accounts[0].id`를 legacy batch `accountId`보다 먼저 읽는다.
  - `/api/planning/v3/transactions/batches/[id]/cashflow`, `/api/planning/v3/balances/monthly`, `/api/planning/v3/draft/profile`, `generateDraftPatchFromBatch.ts`는 이 stored-first binding을 직접 소비한다.
  - `/api/planning/v3/transactions/batches/[id]` detail route는 `getStoredFirstBatchDetailProjectionRows()`와 `applyStoredFirstDetailProjectionAccountBinding()`을 통해 raw `data`와 derived projection을 분리하고, batch shell `accountId`, `accountHint`도 stored-first binding을 우선 노출한다.
  - `getBatchSummary.ts`, `/api/planning/v3/transactions/batches/[id]/categorized`, `/api/planning/v3/transactions/batches/[id]/transfers`는 `getStoredFirstBatchSummaryProjectionRows()`를 통해 raw `loaded.transactions` 대신 stored-first binding rows를 summary/categorize/detection 입력으로 사용한다.
- bootstrap result
  - `stored-meta-only bootstrap`은 열렸고, same-id legacy owner가 없는 batch에 한해 `/account` route가 stored meta `accounts`를 갱신하는 writer helper를 사용한다.
- smallest safe next cut
  - 다음 구현 컷은 same-id stored/legacy coexistence나 legacy migration으로 바로 넓히지 말고, consumer precedence 차이를 먼저 줄이거나 coexistence 전용 cut으로 분리하는 편이 안전하다.
- 비범위
  - same-id stored/legacy coexistence account writer 통합
  - legacy writer migration 또는 legacy batch side accountId backfill
  - stored transaction row rewrite, index repair, owner merge
- 지금 바로 broad 구현이 위험한 이유
  - recent `N2`로 detail shell, detail derived projection, cashflow, summary helper의 stored-first account binding read contract는 대부분 맞춰졌지만, same-id coexistence command owner는 여전히 하나로 합쳐지지 않았다.
  - stored writer를 열어도 legacy public writer가 그대로 남아 있으면 canonical owner가 둘로 보일 수 있어, coexistence/migration cut 없이 broad enable을 하면 command semantics가 다시 흔들린다.

### same-id stored/legacy coexistence account writer audit

- current coexistence writer/reader map
  - same-id coexistence에서도 visible reader는 `getStoredFirstBatchBindingAccountId()` 기준으로 stored meta `accounts[0].id`를 먼저 읽는다.
  - `/api/planning/v3/transactions/batches/[id]` detail shell/derived projection, `/api/planning/v3/transactions/batches/[id]/cashflow`, `getBatchSummary.ts`, `/api/planning/v3/transactions/batches/[id]/categorized`, `/api/planning/v3/transactions/batches/[id]/transfers`, `/api/planning/v3/balances/monthly`, `/api/planning/v3/draft/profile`, `generateDraftPatchFromBatch.ts`는 이 stored-first binding을 우선 소비한다.
  - 반면 account write owner는 여전히 둘로 나뉜다. stored 쪽은 `updateStoredBatchAccountBinding()`, legacy 쪽은 `updateBatchAccount()`이며 persistence boundary와 rollback 단위가 다르다.
- success semantics risk
  - legacy writer만 열면 visible reader는 계속 stored binding을 먼저 보여 줄 수 있어, `POST /account` success가 현재 보이는 배치 계좌 변경을 과장한다.
  - stored writer만 열면 legacy batch `accountId`, `accountHint`와 legacy bridge fallback은 이전 값을 남길 수 있어, stored-meta-only bootstrap처럼 single-owner success로 읽히지 않는다.
  - explicit mirror write를 추가해도 dual-write partial failure, rollback order, 어느 owner를 canonical success로 볼지에 대한 contract가 아직 닫히지 않았다.
- smallest safe next cut
  - same-id coexistence의 다음 구현 컷은 `coexistence explicit mirror write`보다 `reader-visible boundary tightening`이 더 안전하다.
  - 즉, command success를 새로 열기보다 coexistence surface가 canonical account writer 미확정 상태라는 점을 helper, route, 문서에서 더 명시적으로 고정하는 편이 낫다.
- 비범위
  - coexistence explicit mirror write
  - legacy writer deprecation execution
  - stored/legacy owner merge, row rewrite, index repair
- 지금 바로 broad merge가 위험한 이유
  - stored-meta-only bootstrap과 달리 coexistence는 단일 owner만 건드리는 cut이 아니다.
  - read facade는 이미 stored-first로 정렬됐지만 persistence owner와 historical legacy fallback은 둘로 남아 있어, migration 없이 broad merge를 열면 partial success/failure와 visible state contract가 동시에 흔들린다.

### same-id stored/legacy coexistence explicit mirror write audit

- recommended sequence
  - future mirror write가 열린다면 `stored -> legacy` 한 순서만 남긴다.
  - 1차 owner는 `updateStoredBatchAccountBinding()`이고, 2차 owner는 `updateBatchAccount()`다.
  - 이유:
    - visible reader가 이미 stored-first binding을 우선 노출하므로, first write owner와 visible state를 맞출 수 있다.
    - stored side는 `index.json` rewrite owner라 pre-write snapshot을 잡아 두면 같은 boundary 안에서 compensating rollback을 설계할 여지가 있다.
    - 반면 legacy side는 `batches.ndjson` append-write라 현재 helper 집합 기준으로는 compensating delete/restore contract가 더 약하다.
- rejected sequence
  - `legacy -> stored`
    - legacy append-write가 먼저 성공하고 stored write가 실패하면 visible reader는 계속 예전 stored binding을 먼저 보여 주므로, success와 partial success가 모두 더 쉽게 과장된다.
    - 실패 후에는 legacy `accountId`, `accountHint`, `createdAt` drift가 hidden fallback metadata로 남을 수 있고, 이를 같은 route cut 안에서 안전하게 취소하는 helper도 없다.
  - `[미확인]` best-effort dual-write
    - 둘 중 하나만 성공했을 때 ordered rollback source-of-truth가 없고, 어느 owner를 canonical success로 볼지도 닫히지 않아 route contract가 가장 불안정하다.
- rollback ordering contract
  - precondition:
    - first write 전에 stored meta pre-write snapshot을 확보한다. 최소 단위는 `ImportBatchMeta.accounts` primary ordering이며, 기존 visible binding 복원이 가능해야 한다.
  - execution order:
    - 1. stored write를 먼저 시도한다.
    - 2. stored write가 성공한 경우에만 legacy write를 시도한다.
  - secondary failure handling:
    - 1. legacy write가 실패하면 success를 반환하지 않는다.
    - 2. 즉시 stored pre-write snapshot 복원 rollback을 시도한다.
    - 3. rollback 성공 여부와 무관하게 same request에서는 success를 반환하지 않는다.
  - rollback failure handling:
    - rollback이 실패하거나, post-failure state에서 두 owner가 pre-write 상태로 돌아갔는지 증명하지 못하면 `operator/manual repair required` 상태로 승격한다.
    - `[검증 필요]` legacy append-write failure가 partial append ambiguity를 남길 수 있는지와, 이를 route 안에서 확정할 post-write verification helper는 아직 없다.
- partial failure state taxonomy
  - `first-write-failed`
    - stored write가 실패하고 legacy write는 시작하지 않은 상태다.
    - user-facing route는 `INTERNAL` failure를 반환하고 success를 열지 않는다.
  - `second-write-failed-rollback-recovered`
    - stored write는 성공했지만 legacy write가 실패했고, stored rollback으로 pre-write visible binding이 복원된 상태다.
    - route는 여전히 `INTERNAL` failure를 반환한다. partial success나 warning success는 허용하지 않는다.
  - `repair-required`
    - legacy write 실패 뒤 stored rollback도 실패했거나, post-failure state에서 owner alignment 복구를 증명하지 못한 상태다.
    - route는 `INTERNAL` failure를 반환하고 operator/manual repair가 필요하다고 본다.
- route-level user-facing failure 원칙
  - 두 owner write가 모두 성공하기 전에는 success를 반환하지 않는다.
  - write 시작 이후의 secondary failure / rollback failure는 `INPUT`, `NO_DATA`가 아니라 `INTERNAL` failure family로 처리한다.
  - rollback이 성공했더라도 same request를 success로 downgrade하지 않는다.
  - repair-required 상태에서는 user-facing payload가 `계좌 연결이 적용됐다`는 의미를 암시하면 안 된다.
- operator/manual repair가 필요한 상태
  - stored tentative write 이후 legacy write가 실패하고, stored rollback도 실패한 상태
  - `[검증 필요]` rollback은 성공했더라도 post-failure verification이 없어 두 owner가 다시 aligned됐는지 증명하지 못하는 상태
- 비범위
  - same-id coexistence explicit mirror write 실제 구현
  - partial-failure retry UX 또는 operator repair flow UI 추가
  - legacy writer deprecation execution, stored/legacy owner merge, row rewrite, index repair
- 지금 바로 broad dual-write가 위험한 이유
  - `updateStoredBatchAccountBinding()`과 `updateBatchAccount()`는 서로 다른 persistence boundary를 따로 쓴다. 하나는 index rewrite, 다른 하나는 append-write라 shared transaction이 없다.
  - visible reader는 이미 stored-first라서, 어느 write가 먼저 실패하느냐에 따라 user-facing drift와 hidden fallback drift의 모양이 달라진다.
  - 따라서 rollback ordering contract 없이 mirror write를 곧바로 열면 command route가 `계좌 연결 성공`의 의미를 과장하거나, rollback 없이 partial failure를 남길 가능성이 높다.

### same-id stored/legacy coexistence legacy append verification audit

- current legacy append verification 한계
  - `updateBatchAccount()`의 second step은 `appendNdjsonLine(resolveBatchesPath(), updated)`로 끝나며, 이는 `fs.appendFile()` 기반 append-write다.
  - stored side `updateStoredBatchAccountBinding()`와 달리 atomic rename/write helper를 쓰지 않으므로, append 예외가 났을 때 route는 현재 helper만으로 `legacy write가 전혀 적용되지 않았다`를 증명할 수 없다.
  - `readNdjsonRows()`는 parse 실패 line을 조용히 건너뛰므로, partial append나 malformed tail이 남아도 상위 reader는 이를 `invalid trailing bytes`가 아니라 `읽을 수 없는 line 무시`로 처리한다.
- append failure 직후 route가 증명할 수 있는 것
  - 현재 route는 append 예외가 나면 `legacy write 미적용 확정`이 아니라 `legacy append status unknown`으로만 다룰 수 있다.
  - 즉 same-id coexistence mirror write에서 stored rollback이 성공해도, legacy side가 정말 pre-write 상태인지 route 안에서 증명할 기존 helper가 없다.
  - 이 상태는 `second-write-failed-rollback-recovered`로 곧바로 내리기보다 `[검증 필요]` 또는 `repair-required`로 분류하는 편이 안전하다.
- post-write verification read source 후보
  - candidate 1: `readBatches()` 또는 `readBatchTransactions(batchId)`
    - 장점: latest parsed legacy batch row가 목표 `accountId`, `accountHint`를 반영하는지 positive verification을 할 수 있다.
    - 한계: malformed trailing line은 `readNdjsonRows()` 단계에서 무시되므로, `새 row가 안 보인다`만으로 no-write를 증명하지 못한다.
  - candidate 2: `batches.ndjson` raw tail verification helper
    - 목표: append 직후 target batch id 기준 마지막 raw line이 완전한 JSON line인지, malformed trailing bytes가 남았는지, parsed latest row와 tail 상태가 일치하는지 확인한다.
    - 이유: 현재 codebase에는 parse 실패 line을 surface로 올리는 helper가 없어 append ambiguity를 route contract 안에서 닫지 못한다.
- bootstrap result
  - `verifyLegacyBatchAccountAppendPostWrite()` helper가 추가돼 parsed latest legacy batch row와 raw tail 상태를 함께 읽는다.
  - 이 helper는 `parsed-row-committed`, `malformed-tail`, `no-committed-row-observed`를 구분하지만, 여전히 complete no-write proof 자체를 보장하지는 않는다.
  - `classifySameIdCoexistencePostWriteFailure()` worker는 이 helper 결과와 stored rollback 시도/성공 여부를 받아 `repair-required` 또는 `rollback-recovery-unproven`만 보수적으로 계산한다.
  - `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`는 verification helper, conservative classification worker, operator evidence snapshot helper를 한 번에 조합하지만, 아직 `/account` route behavior 자체를 바꾸지는 않는다.
  - `readStoredCurrentBatchBindingEvidence()`는 stored meta `accounts[0].id` 기준 current binding summary를 읽고, route-local worker가 explicit input 없이도 최소 stored-side evidence를 자동 수집하게 한다.
  - `compareStoredPreWriteSnapshotToCurrentBinding()`은 stored pre-write snapshot `accountId`와 current stored binding summary만 비교해 `matched-prewrite`, `drifted-from-prewrite`, `snapshot-missing`을 반환한다.
- partial append ambiguity 분류 원칙
  - legacy append 예외가 발생하면 route 또는 future mirror-write worker는 `verifyLegacyBatchAccountAppendPostWrite()`로 상태를 먼저 좁혀야 한다.
  - `malformed-tail` 또는 `no-committed-row-observed`는 여전히 complete no-write proof가 아니므로, stored rollback이 성공했더라도 user-facing success는 금지하고 `INTERNAL` failure + operator/manual repair 필요 상태로 다루는 편이 안전하다.
  - `[검증 필요]` post-write verification helper가 추가되면 `parsed legacy row committed`, `malformed tail`, `no committed row observed`를 더 세밀하게 나눌 수 있는지는 후속 구현에서 다시 확인해야 한다.
- smallest safe next cut
  - verification helper bootstrap과 post-write classification worker bootstrap은 열렸지만, next cut도 아직 `mirror write implementation`은 아니다.
  - 최소 범위는 future mirror-write worker나 route-local worker가 이 helper/worker를 실제 secondary failure path에 연결하고, `rollback-recovery-unproven`을 어떤 operator flow로 승격할지 닫는 것이다.
- 비범위
  - mirror write 실제 구현
  - `/account` route behavior 변경
  - retry UX, operator repair UI, legacy writer deprecation, row rewrite, index repair, owner merge
- 지금 바로 mirror write 구현이 위험한 이유
  - append 예외 뒤에도 legacy append 상태를 확정할 helper가 없으면, stored rollback 성공 여부만으로 owner realignment를 증명할 수 없다.
  - same-id coexistence는 visible reader가 stored-first라 hidden legacy drift가 바로 드러나지 않을 수 있어, verification contract 없이 mirror write를 열면 false recovery 또는 false failure를 route가 구분하지 못한다.

### same-id coexistence operator/manual repair flow contract

- `repair-required` definition
  - `classifySameIdCoexistencePostWriteFailure()`가 `repair-required`를 반환하는 상태는 operator가 persistence correction 또는 explicit repair 판단을 바로 검토해야 하는 상태다.
  - 최소 조건:
    - stored rollback 미시도
    - stored rollback 실패
    - legacy verification이 `parsed-row-committed`
    - legacy verification이 `malformed-tail`
  - 공통점은 stored/legacy owner 중 적어도 한쪽이 pre-write 상태에서 벗어났을 가능성을 현재 worker 집합만으로 안전하게 닫지 못한다는 점이다.
- `rollback-recovery-unproven` definition
  - stored rollback은 시도되었고 성공했지만, legacy verification이 `no-committed-row-observed`라 complete no-write proof가 없는 상태다.
  - 이는 `repair 완료`가 아니라 `회복 미증명` 상태다. 자동 복구나 success closeout로 해석하지 않고 operator verification 대기 상태로만 본다.
  - `rollback-recovery-unproven`은 `repair-required`보다 약한 경고이지만, user-facing success를 허용하는 상태는 아니다.
- user-facing failure family 원칙
  - `repair-required`와 `rollback-recovery-unproven` 모두 user-facing route는 `INTERNAL` failure family를 유지한다.
  - 두 상태 모두 `계좌 연결이 적용됨`, `복구 완료`, `안전하게 되돌림` 같은 success 또는 recovery 확정 문구를 반환하면 안 된다.
  - future route-local worker가 이 상태를 소비하더라도, API response는 operator evidence 수집 전까지 warning success나 partial success로 downgrade하지 않는다.
- operator/manual repair 최소 조건
  - `repair-required`
    - operator가 stored current binding과 legacy parsed latest row를 다시 대조하고, malformed tail 여부 또는 committed legacy row 여부를 확인해야 한다.
    - persistence correction, manual append 정리, retry 차단 여부를 사람이 결정해야 한다.
  - `rollback-recovery-unproven`
    - operator가 최소 evidence를 다시 확인해 same-id owner가 pre-write 상태로 돌아갔는지 수동 검토해야 한다.
    - 단, 이 상태만으로 즉시 rewrite나 delete를 수행하는 계약은 아직 열지 않는다.
- operator/manual repair evidence checklist
  - `batchId`
  - target `accountId`
  - `storedRollbackAttempted`, `storedRollbackSucceeded`
  - `legacyVerification.status`
  - `latestParsedBatch.accountId`, `latestParsedBatch.accountHint`, `latestParsedBatch.createdAt` if available
  - `buildSameIdCoexistenceOperatorEvidenceSnapshot()` output if available
    - outcome, reason, `successAllowed: false`, `legacyVerification.noWriteProof`, optional stored current binding summary
  - `readStoredCurrentBatchBindingEvidence()` output if available
    - current stored binding `accountId` summary only
  - `compareStoredPreWriteSnapshotToCurrentBinding()` output if available
    - pre-write snapshot `accountId`와 current stored binding summary의 일치/불일치 정도만 보여 준다.
  - `[검증 필요]` stored pre-write snapshot과 current stored binding 비교 결과
  - `[검증 필요]` raw tail verification helper가 더 제공할 수 있는 malformed trailing bytes summary
- future route-local worker payload 원칙
  - 내부 worker payload에는 outcome(`repair-required` 또는 `rollback-recovery-unproven`), reason, `successAllowed: false`, `legacyVerification.status`, rollback 시도/성공 여부, latest parsed legacy batch summary 정도만 남긴다.
  - `buildSameIdCoexistenceOperatorEvidenceSnapshot()`은 이 internal payload의 최소 bootstrap이며, raw NDJSON line이나 filesystem path는 싣지 않는다.
  - `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`는 이 internal payload 조립 bootstrap일 뿐, current user-facing route response와 success semantics를 직접 바꾸는 worker는 아니다.
  - `buildSameIdCoexistenceOperatorRepairPayload()`는 route-local worker result를 outcome, reason, `successAllowed: false`, rollback flags, `legacyVerification`, optional stored current binding, optional stored pre-write compare까지 포함한 operator repair payload로 평탄화하지만, current `/account` route behavior나 success semantics는 여전히 바꾸지 않는다.
  - user-facing payload에는 raw NDJSON line, raw tail bytes, filesystem path, operator-only evidence detail을 직접 노출하지 않는다.
  - `rollback-recovery-unproven`을 `rollback-recovered`처럼 보이게 만드는 축약 필드는 남기지 않는다.
- 비범위
  - mirror write 실제 구현
  - `/account` route behavior 변경
  - retry UX / operator UI
  - legacy writer deprecation
  - row rewrite / index repair / owner merge

### same-id coexistence mirror-write route integration audit

- current route-local integration boundary
  - current `/api/planning/v3/transactions/batches/[id]/account` route는 `getStoredBatchAccountCommandSurfaceState()`가 `stored-meta-legacy-coexistence`를 반환하면 route-local `stored -> legacy` sequence를 실행한다.
  - 이 branch는 `runSameIdCoexistenceStoredThenLegacyRouteLocalSequence()`로 ordered write/rollback trace를 만들고, `secondary-failure`에서는 generic `INTERNAL` failure로 바로 내려간다.
  - `writes-completed`도 곧바로 success를 열지 않고 `runSameIdCoexistencePostWriteSuccessSplitWorker()`와 `buildSameIdCoexistenceVerifiedSuccessResponseShell()`을 거친 뒤에만 success body를 조립한다.
- helper stack consumption boundary
  - `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`는 secondary failure가 이미 발생한 뒤 `batchId`, target `accountId`, `storedRollbackAttempted`, `storedRollbackSucceeded`, optional stored pre-write/current binding evidence를 받아 legacy append verification과 conservative classification을 조합한다.
  - `buildSameIdCoexistenceOperatorRepairPayload()`는 그 worker result를 operator repair payload로 평탄화할 뿐, first write success나 route-level success closeout 여부는 판단하지 않는다.
  - 따라서 current helper stack은 `stored -> legacy` write sequence를 직접 시작하는 code가 아니라, future route-local second-step failure branch가 재사용할 verification/evidence/payload layer다.
- current guard path에 아직 없는 input
  - stored pre-write snapshot capture result
  - stored first write attempted/succeeded result
  - legacy append second write attempted/failure result
  - stored rollback attempted/succeeded result after second-step failure
  - `[검증 필요]` legacy append exception을 route-local worker에 넘길 최소 error summary shape
- smallest safe next implementation cut
  - next cut은 current coexistence guard branch를 바로 success path로 바꾸는 것이 아니라, same branch 안에 `stored -> legacy` write sequencing만 담당하는 route-local integration wrapper를 추가하는 것이다.
  - 그 wrapper는 pre-write snapshot capture, stored first write, legacy second write, second-write failure 시 stored rollback 시도까지 담당하고, 이 secondary failure branch에서만 `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`와 `buildSameIdCoexistenceOperatorRepairPayload()`를 호출하는 편이 가장 작다.
  - user-facing route response는 이 cut에서도 success를 서둘러 열지 않고, secondary failure가 발생하면 기존 contract대로 `INTERNAL` failure + operator/manual repair payload 경계만 유지해야 한다.
- bootstrap result
  - `runSameIdCoexistenceStoredThenLegacyRouteLocalSequence()` helper가 route branch에 연결돼 stored pre-write snapshot capture, stored first write, legacy second write, second-write failure 시 stored rollback trace와 secondary failure worker input 조립까지 한 곳에서 수행한다.
  - 같은 helper는 legacy second write 예외를 raw error 대신 `stage`, conservative `code`, safe `message`만 담은 internal error summary로 남기지만, route는 이 summary를 user-facing payload로 직접 노출하지 않는다.
  - `toSameIdCoexistenceUserFacingInternalFailure()` helper는 `secondary-failure` sequencing result를 generic `INTERNAL` code와 safe message로만 축약하고, `legacySecondWriteError`, `operatorRepairPayload`, `secondaryFailure.failure` detail은 user-facing route로 직접 올리지 않는다.
  - `runSameIdCoexistencePostWriteSuccessSplitWorker()`와 `buildSameIdCoexistenceVerifiedSuccessResponseShell()`도 같은 branch에 연결돼 `verified-success-candidate`일 때만 success body를 조립한다.
- current route가 계속 broad success route로 열리면 안 되는 이유
  - coexistence branch만 좁게 열렸을 뿐, success closeout과 operator repair closeout은 아직 same-id surface 전용 helper stack에 묶여 있다.
  - 따라서 current route change를 다른 command surface나 wider mirror-write semantics로 일반화하면, ordered write/rollback trace가 없는 branch에서 response semantics를 다시 과장할 위험이 있다.

### same-id coexistence `writes-completed` success contract audit

- `writes-completed`가 현재 증명하는 것
  - `runSameIdCoexistenceStoredThenLegacyRouteLocalSequence()`의 `writes-completed`는 stored first write가 updated meta를 반환했고, legacy second write가 updated legacy batch를 반환했으며, secondary failure branch로 내려가지 않았다는 사실만 증명한다.
  - 이 result만으로는 future route가 실제 stored-first reader facade를 다시 읽었는지, 그리고 user-facing batch/account binding이 target `accountId`로 보이는지까지는 아직 증명하지 않는다.
- visible reader parity 기준
  - detail shell/derived, `cashflow`, `getBatchSummary.ts`는 `loadStoredFirstBatchTransactions()`와 `getStoredFirstBatchBindingAccountId()` 또는 그 projection helper를 공유한다.
  - 따라서 same-id coexistence success contract의 최소 visible-reader verification도 broad consumer sweep이 아니라, 같은 stored-first reader facade를 post-write 시점에 다시 읽어 target `accountId`가 visible binding으로 보이는지 확인하는 cut으로 좁히는 편이 가장 작다.
  - `[검증 필요]` categorized/transfers, balances/draft 계열까지 route success 직전에 따로 재검증해야 하는지는 후속 cut에서 다시 확인한다. 현재 계약은 shared stored-first reader facade 기준만 우선 잠근다.
- success contract 초안
  - `writes-completed`는 곧바로 user-facing success가 아니라 `success candidate`로만 취급한다.
  - future route integration은 아래 최소 조건을 모두 만족할 때만 success를 열어야 한다.
    - 1. sequencing wrapper result가 `writes-completed`다.
    - 2. post-write `loadStoredFirstBatchTransactions(batchId)` re-read가 성공한다.
    - 3. `getStoredFirstBatchBindingAccountId(reloaded)`가 target `accountId`와 일치한다.
    - 4. success response batch shell도 이 same stored-first reloaded snapshot 기준으로 조립된다.
  - 위 조건 중 하나라도 빠지면 current generic `INTERNAL` failure contract를 유지하거나, route는 계속 explicit guard로 남는 편이 안전하다.
- bootstrap result
  - `verifySameIdCoexistencePostWriteVisibleBinding()` helper가 추가돼 `loadStoredFirstBatchTransactions(batchId)`와 `getStoredFirstBatchBindingAccountId(reloaded)`를 재사용해 `visible-binding-matched`, `visible-binding-drifted`, `visible-binding-missing`만 좁게 반환할 수 있게 됐다.
  - 이 helper는 success semantics를 직접 열지 않고, future route가 `writes-completed` success candidate를 post-write stored-first visible binding 기준으로 다시 확인하는 step으로만 쓴다.
  - `runSameIdCoexistencePostWriteSuccessSplitWorker()`는 `writes-completed` sequencing result와 위 verification helper를 조합해 `verified-success-candidate` 또는 `visible-verification-failed`만 internal으로 분기하고, visible verification failure는 generic `INTERNAL` envelope로만 축약한다.
- future route integration success/failure split boundary
  - future route는 sequencing wrapper 호출 직후에 `secondary-failure`와 `writes-completed`를 먼저 분기한다.
  - `secondary-failure`는 기존 `toSameIdCoexistenceUserFacingInternalFailure()` mapper로 바로 내려간다.
  - `writes-completed`는 바로 success response를 만들지 않고, post-write stored-first visible binding verification을 거친 뒤에만 success branch로 넘어가야 한다.
- smallest safe next cut
  - next cut은 route success semantics를 바로 여는 것이 아니라, `writes-completed`를 받아 post-write stored-first visible binding을 재확인하는 작은 verification helper 또는 route-local verification step을 추가하는 것이다.
  - 이 cut은 `loadStoredFirstBatchTransactions()`와 `getStoredFirstBatchBindingAccountId()` 재사용까지만 다루고, batch response body 전체 재설계나 broad consumer recheck는 비범위로 남기는 편이 가장 작다.
- current route integration boundary
  - failure-side helper stack과 success-side post-write visible verification helper는 same-id coexistence branch에만 연결되어 있다.
  - 이 branch는 `verified-success-candidate`일 때만 success candidate를 만들고, `visible-verification-failed`는 generic `INTERNAL` failure로 되돌린다.

### same-id coexistence route response assembly audit

- current success body snapshot
  - `stored-meta-only` success body는 `toStoredMetaOnlyResponseBatch()`를 통해 `{ id, createdAt, kind, total, ok, failed, accountId, accountHint }`를 만들고, `updatedTransactionCount`는 항상 `0`으로 둔다.
  - `legacy-only` success body는 `updateBatchAccount()`가 돌려준 `updated.batch`를 그대로 `batch`로 쓰고, `updatedTransactionCount`는 legacy changed record count를 그대로 노출한다.
- coexistence verified success가 재사용해야 할 shape
  - same-id coexistence verified success는 stored-meta-only shape를 그대로 재사용하기보다, post-write reloaded stored-first reader facade 기준 batch shell을 source-of-truth로 삼는 편이 안전하다.
  - 이유:
    - visible reader는 already stored-first binding을 기준으로 detail shell/derived, `cashflow`, `summary`를 조립한다.
    - stored-meta-only helper는 `rowCount` 중심 단순 shell이라 same-id coexistence에서 detail shell이 now 쓰는 current snapshot `total` / `ok` + explicit legacy fallback `failed`, optional `fileName` 규칙과 어긋날 수 있다.
  - 따라서 verified success response body 초안은 detail route batch shell과 같은 source rule을 따르는 것이 가장 작다.
    - `id`: reloaded batch id
    - `createdAt`: shared public createdAt boundary
    - `kind`: `"csv"`
    - `total`, `ok`: reloaded current transaction snapshot 기준
    - `failed`, optional `fileName`: explicit legacy summary fallback
    - `accountId`, `accountHint`: reloaded stored-first visible binding
- `batch` payload source-of-truth
  - source-of-truth는 `updateStoredBatchAccountBinding()` return value나 `updateBatchAccount().batch` 단독 값이 아니라, post-write `loadStoredFirstBatchTransactions(batchId)` re-read 결과여야 한다.
  - account binding은 `getStoredFirstBatchBindingAccountId(reloaded)` 기준으로 읽고, count-style `total` / `ok`는 reloaded visible row count를, `failed` / `fileName`만 same stored-first reader facade의 explicit legacy fallback 규칙을 재사용하는 편이 route drift를 줄인다.
- `updatedTransactionCount` 의미
  - coexistence verified success에서도 `updatedTransactionCount`는 legacy second write가 계산한 changed record count 의미를 유지하는 편이 가장 작다.
  - 이 필드는 stored meta binding write count나 visible reader projection 전체의 변화량으로 재정의하지 않는다.
  - 즉 same-id coexistence success에서 이 숫자는 `legacy-side affected row count`일 뿐, `현재 사용자에게 보이는 모든 row가 몇 건 바뀌었는지`를 보장하는 필드는 아니다.
  - visible binding이 target `accountId`로 재검증돼 `verified-success-candidate`가 되더라도, legacy records가 이미 target `accountId`를 가지고 있으면 `updatedTransactionCount`는 `0`일 수 있다.
  - 따라서 zero-count coexistence success도 route-local success branch에서 허용되며, `updatedTransactionCount === 0`은 visible binding failure가 아니라 legacy changed row count가 없었다는 뜻으로만 해석해야 한다.
- success/failure split boundary
  - `secondary-failure`는 기존 generic `INTERNAL` failure mapper로 바로 내려간다.
  - `writes-completed`는 `runSameIdCoexistencePostWriteSuccessSplitWorker()`로 먼저 보낸다.
  - `verified-success-candidate`일 때만 reloaded stored-first batch shell과 legacy-side `updatedTransactionCount`를 조립하는 success response candidate branch로 넘어간다.
  - `visible-verification-failed`는 success body를 조립하지 않고 conservative `INTERNAL` failure branch로 되돌린다.
- bootstrap result
  - `buildStoredFirstVisibleBatchShell()` helper가 detail route batch shell source rule을 shared helper로 고정한다.
  - `buildSameIdCoexistenceVerifiedSuccessResponseShell()` helper는 `verified-success-candidate`를 입력으로 받아 reloaded stored-first batch shell과 legacy-side `updatedTransactionCount`를 함께 조립하고, current `/account` route coexistence branch가 이 helper를 그대로 재사용한다.
- smallest safe next cut
  - next cut은 coexistence route-local success branch를 broader command surface로 일반화하는 것이 아니라, current success/failure copy와 operator evidence handoff를 더 명시적으로 다듬는 것이다.
  - response field source-of-truth는 이미 shared helper에 고정했고, wider route wiring이나 success 노출 확대는 계속 별도 후속으로 남기는 편이 가장 작다.
- 지금 바로 route behavior를 여는 것이 위험한 이유
  - response body helper 없이 same-id coexistence success를 열면 `batch` payload를 stored meta/legacy batch 중 어디에서 읽는지 route-local로 다시 흩어질 가능성이 높다.
  - `updatedTransactionCount` 의미도 stored-side write와 visible-reader projection까지 합친 숫자처럼 오해될 수 있어, success semantics뿐 아니라 response semantics도 과장될 위험이 남아 있다.

### same-id coexistence success/failure copy contract audit

- current success copy 원칙
  - current `/api/planning/v3/transactions/batches/[id]/account` coexistence success body는 별도 success message를 추가하지 않고 `{ ok, batch, updatedTransactionCount }`만 반환한다.
  - same-id coexistence에서는 stored-first visible batch shell과 legacy-side changed row count를 이미 서로 다른 field로 나눠 담고 있으므로, route-level success copy를 더 얹어 `계좌 연결이 몇 건 바뀌었다` 또는 `모든 row가 바뀌었다`처럼 과장하는 편이 더 위험하다.
  - zero-count verified success(`updatedTransactionCount === 0`)도 visible binding이 target `accountId`로 재검증되면 그대로 success에 남는다. 이 경우 `updatedTransactionCount`는 legacy changed row count가 없었다는 뜻일 뿐, visible binding success 부재를 뜻하지 않는다.
- current failure copy 원칙
  - `secondary-failure`와 `visible-verification-failed`는 둘 다 generic `INTERNAL` failure family와 safe message `배치 계좌 연결에 실패했습니다.`만 user-facing으로 반환한다.
  - 이 generic failure는 legacy second-write error summary, operator repair payload, rollback trace, verification detail을 의도적으로 숨긴다.
  - 이유는 same-id coexistence failure detail이 operator/manual repair 판단용 internal evidence에 가깝고, raw detail을 user-facing copy에 섞으면 false recovery 또는 false diagnosis를 유도할 수 있기 때문이다.
- `updatedTransactionCount`와 user-facing 의미 분리
  - `updatedTransactionCount`는 user-facing payload에 남아 있어도 copy source-of-truth가 아니다.
  - 이 숫자를 `현재 사용자에게 보이는 거래가 실제로 바뀐 건수`, `계좌 연결이 적용된 건수`, `visible binding success 정도`로 읽히게 만드는 문구는 피해야 한다.
  - zero-count verified success와 `visible-verification-failed`는 모두 `updatedTransactionCount` 숫자만으로 구분할 수 없고, route는 success/failure split을 helper stack으로만 결정한다.
- operator evidence handoff boundary
  - operator evidence와 repair payload는 `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()` 및 `buildSameIdCoexistenceOperatorRepairPayload()` 내부 결과로만 남기고, current user-facing response에는 직접 싣지 않는다.
  - current route는 generic `INTERNAL` failure family만 user-facing으로 유지하고, operator/manual repair evidence handoff는 internal boundary에만 남긴다.

### 3.2 current-state resync audit (2026-03-25)

- `N2` current-state drift map
  - already synced / still-valid current-state boundary
    - stored writer owner는 `src/lib/planning/v3/service/importCsvToBatch.ts` + `src/lib/planning/v3/store/batchesStore.ts` 조합으로 유지된다.
    - stored-first reader facade, legacy bridge, dual-surface route meaning, `/api/planning/v3/transactions/batches`의 `items` vs `data` compat payload tier는 current code 기준 `N1` memo chain에서 이미 current-state input으로 닫혔다. 이번 `N2` resync에서는 이를 다시 contract 구현 질문으로 재오픈하지 않는다.
    - `sourceBinding` new-write-only slot과 `hasStoredFirstReadOnlySourceBindingCandidate()` helper는 계속 internal read-only proof candidate boundary에 머문다. current route/helper caller 중 false-side split을 concrete runtime consequence로 소비하는 surface는 여전히 확인되지 않는다.
    - historical no-marker / hybrid retained provenance / visible `fileName` bridge boundary도 여전히 helper-owned read-only inventory로 유지된다. append/merge explicit no-source closeout, public payload 비노출, fallback 즉시 제거 금지 기준도 current code와 맞는다.
    - `/api/planning/v3/transactions/batches/[id]/account` same-id stored-meta + legacy surface는 current code 기준 route-local `stored -> legacy` sequence, post-write visible binding verification, reloaded stored-first success shell까지 연결돼 있다. `secondary-failure`와 `visible-verification-failed`는 계속 generic `INTERNAL` failure로만 user-facing 노출된다.
  - stale or `[검증 필요]` section
    - `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 2026-03-22 same-id coexistence guard 계열 메모는 current code보다 한 단계 전 상태다. 지금은 pre-route-integration history로 읽어야 한다.
    - 이 문서의 current summary bullet 중 `POST /account`를 `DELETE`와 같은 explicit guard 상태로 묶어 읽는 표현은 stale였고, 이번 resync에서 current route behavior 기준으로 보정한다.
    - `sourceBinding` future internal audit/debug consumer, operator/manual repair의 user-facing flow, dormant compat artifact 재활성화는 여전히 `[검증 필요]` 또는 parked 범위다.
  - route SSOT
    - stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 resync 판단과 충돌하지 않는다. current route change는 없고, `docs/current-screens.md`의 batch-family beta page inventory도 그대로 유지된다.

- already-synced boundary
  - stored writer owner / stored-first reader facade / legacy bridge 분리
  - batch list dual-surface route meaning과 `items` vs `data` compat payload tier
  - `sourceBinding` present subset no-current-consumer surface
  - historical no-marker / hybrid retained visible `fileName` bridge helper boundary
  - same-id coexistence `/account` route-local sequencing + verified success / generic failure split

- current smallest viable next `N2` candidate
  - `ImportBatch / TransactionRecord current-state closeout docs-only sync`
  - 이유:
    - current code와 `v2/13`의 active 3.2 boundary는 대부분 이미 맞춰졌고, 이번 resync에서 남은 drift도 stale summary wording 정리에 가깝다.
    - 다음 질문은 broad `N2` 구현이 아니라, current-state stop line과 reopen trigger를 문서에 잠그는 closeout 쪽이 더 작다.

- 그 컷의 비범위
  - 실제 구현 코드 변경
  - route 추가/삭제
  - API shape 변경
  - writer owner 변경
  - legacy bridge 제거 구현
  - `N2` import/export/rollback 구현 본작업
  - stable/public IA 재편
  - beta visibility policy 변경

- 왜 여기서 바로 broad `N2` 구현이나 planning/v3 rewrite로 가면 위험한가
  - current 3.2는 sourceBinding parked axis, historical no-marker helper boundary, same-id coexistence response split, stored-first reader facade가 서로 다른 층위로 이미 분리돼 있다.
  - 이 상태에서 broad 구현을 먼저 열면 export unit, rollback semantics, operator flow, dormant compat artifact, public visibility policy를 한 번에 다시 정의하게 되어 false-proof와 contract drift 위험이 커진다.

### 3.2 current-state closeout sync (2026-03-25)

- 이번 closeout에서 확정하는 것
  - stored writer owner / stored-first reader facade / legacy bridge 분리는 current `3.2` contract input으로 유지한다.
  - batch list dual-surface route meaning과 `/api/planning/v3/transactions/batches`의 `items` vs `data` compat payload tier 분리는 current code 기준 충분히 닫힌 상태로 유지한다.
  - `sourceBinding` present subset은 current no-current-consumer / internal read-only candidate 상태로 유지한다.
  - historical no-marker / hybrid retained visible `fileName` bridge는 helper-owned boundary로 유지한다.
  - `/api/planning/v3/transactions/batches/[id]/account` same-id stored-meta + legacy surface는 route-local `stored -> legacy` sequence, verified success, generic `INTERNAL` failure split까지를 current stop line으로 유지한다.
  - 2026-03-22 same-id coexistence guard 계열 메모는 current contract가 아니라 pre-route-integration history로 읽는다.
  - stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다.

- 이번 closeout에서 바뀌지 않는 것
  - 실제 구현 코드 변경
  - route 추가/삭제
  - API shape 변경
  - writer owner 변경
  - legacy bridge 제거 구현
  - `sourceBinding` classifier 구현
  - operator/manual repair user-facing flow 구현
  - dormant compat artifact 활성화 구현
  - `N2` import/export/rollback 본작업
  - stable/public IA 재편
  - beta visibility policy 변경

- current next question
  - 더 이상 `3.2` 내부 micro memo가 아니다.
  - `3.2` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 또는 다음 `N2` 공식 contract question으로만 넘긴다.

- future reopen trigger
  - export 가능 단위, rollback/repair 단위, route response semantics를 실제로 바꾸는 다음 `N2` 공식 contract question
  - `sourceBinding` false-side를 실제로 소비하는 internal audit/debug consumer 등장
  - operator/manual repair의 user-facing flow 또는 failure detail exposure 요구
  - dormant compat artifact나 list/detail semantics를 다시 public contract로 다뤄야 하는 요구

- 왜 여기서 closeout-first가 맞는가
  - current `3.2` boundary는 helper-owned read-only axis, same-id route response split, dual-surface read contract가 서로 다른 층위로 충분히 분리돼 있다.
  - 이 상태에서 다음 micro memo를 억지로 만들면 historical memo와 current contract가 다시 섞이고, broad `N2` question을 잘못 micro cut처럼 오인하게 된다.

### 후속 구현 handoff cut

- `batch read owner narrowing`
  - 범위: `getBatchSummary.ts`, `/api/planning/v3/transactions/batches/[id]`, `/api/planning/v3/balances/monthly`, `generateDraftPatchFromBatch.ts`, `/api/planning/v3/draft/profile`
  - 목적: public/user-facing read surface의 기본 reader를 `batchesStore.ts` 계열로 좁히고, legacy batch read는 명시적인 internal bridge fallback으로만 남긴다.
  - 비범위: CSV import write contract, merge lineage, delete/restore contract 재설계

### contract 메모

- `ImportBatch` / `TransactionRecord`는 canonical writer가 이미 생겼어도 read facade가 legacy bridge를 같이 품고 있으므로, `N2` 문서에서는 아직 single-owner read contract로 적지 않는다.
- 최근 `N2`에서 `DELETE`는 same-id coexistence와 pure legacy boundary를 explicit guard로 잠갔고, `POST /account`는 same-id stored-meta + legacy surface에서 route-local sequencing + verified success / generic failure split까지 current code 기준 연결됐다.
- 최근 `N2`에서 detail shell, detail derived projection, `cashflow`, `getBatchSummary.ts`, `categorized`, `transfers`, `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch.ts`는 stored-first account binding helper 또는 projection helper를 재사용하도록 정리됐다.
- detail route는 raw `data`를 그대로 유지하고, derived `transactions` / `sample` / `accountMonthlyNet`만 stored-first binding rows를 사용한다.
- 이는 reader facade, writer owner, legacy bridge가 아직 하나의 canonical command owner로 합쳐지지 않았기 때문이다. broad owner merge, stored meta write-back, legacy write contract 확장은 후속 범위다.
- categorized/transfers support surface와 balances/draft 계열의 read-side consumer parity가 맞춰졌어도, same-id coexistence writer merge, dual-write, row rewrite, index repair는 여전히 비범위다.
- 후속 구현은 batch writer owner를 바꾸는 대신, user-facing read facade에서 legacy bridge를 containment하는 순서로 끊는 편이 안전하다.

### export 가능 단위

- `ImportBatch` + 해당 batch에 속한 `TransactionRecord` 묶음

제외:

- batch summary
- categorized rows
- cashflow projection
- transfer detection 결과

### rollback / repair 가능 단위

- batch owner 단위 삭제/복구
- batch import 재실행 또는 재적재
- projection route(`summary`, `categorized`, `cashflow`, `transfers`) 재계산

[검증 필요]

- `transactions/batches/merge`의 되돌리기 contract는 merged batch owner와 source batch lineage를 어떤 형식으로 남기는지 추가 정의가 필요하다.

### visibility policy 전제조건

- transaction write/import route는 owner key와 merge lineage가 닫히기 전 stable 공개 금지
- projection route는 공개 가능하더라도 export/rollback owner처럼 문서화하지 않는다

---

## 3.3 CategoryRule / override family

### canonical owner

- `CategoryRule`
- `TxnOverride`
- `AccountMappingOverride`
- `TxnTransferOverride`

### route 분류

- command/write route
  - `/api/planning/v3/categories/rules`
  - `/api/planning/v3/categories/rules/[id]`
  - `/api/planning/v3/transactions/account-overrides`
  - `/api/planning/v3/transactions/transfer-overrides`
  - `/api/planning/v3/batches/[id]/txn-overrides`
- read/projection route
  - `/api/planning/v3/categories/rules`
  - `/api/planning/v3/transactions/batches/[id]/categorized`
  - `/api/planning/v3/transactions/batches/[id]/cashflow`
  - `/api/planning/v3/transactions/batches/[id]/transfers`
  - `/api/planning/v3/balances/monthly`
- support/internal route
  - `/api/planning/v3/transactions/overrides`

### request intent / response contract 메모

- category rule route는 rule list CRUD를 담당한다.
- batch-scoped override owner route는 `/batches/[id]/txn-overrides`, `/transactions/account-overrides`, `/transactions/transfer-overrides`로 나뉜다.
- categorized/cashflow/transfers와 `balances/monthly`는 category rule + override family를 읽어 projection을 다시 계산한다.
- `transactions/overrides`는 dev-only internal bridge route이며, batchId가 있을 때의 batch-scoped read와 batchId가 없을 때의 legacy unscoped read/write를 같이 품는다.
- `transactions/overrides`를 public canonical read facade나 stable public contract의 기준으로 읽으면 안 된다.
- write route는 `{ ok, override }`, `{ ok, data }`, `{ ok, deleted }` family를 쓴다.

### current mixed ownership snapshot

- `writer owner`
  - `src/lib/planning/v3/categories/store.ts`의 `CategoryRule` owner
  - `src/lib/planning/v3/store/txnOverridesStore.ts`의 batch-scoped `TxnOverride` owner와 legacy unscoped compat bridge
  - `src/lib/planning/v3/store/accountMappingOverridesStore.ts`의 batch-scoped `AccountMappingOverride` owner
  - `src/lib/planning/v3/store/txnTransferOverridesStore.ts`의 batch-scoped `TxnTransferOverride` owner
- `reader facade`
  - `/api/planning/v3/categories/rules`
  - `/api/planning/v3/batches/[id]/txn-overrides`
  - `/api/planning/v3/transactions/account-overrides`
  - `/api/planning/v3/transactions/transfer-overrides`
  - `getBatchSummary.ts`
  - `generateDraftPatchFromBatch.ts`
  - `/api/planning/v3/balances/monthly`
  - `/api/planning/v3/transactions/batches/[id]/categorized`
  - `/api/planning/v3/transactions/batches/[id]/cashflow`
  - `/api/planning/v3/transactions/batches/[id]/transfers`
- `legacy bridge`
  - `listLegacyUnscopedTxnOverrides()`
  - `upsertLegacyUnscopedTxnOverride()`
  - `deleteLegacyUnscopedTxnOverride()`
  - `/api/planning/v3/transactions/overrides`의 `scope: "legacy-unscoped"` read/write path
- 아직 pure canonical로 승격되지 않은 facade
  - `categorized` / `cashflow` / `transfers` / `balances/monthly` / `summary` / `draft patch`는 `CategoryRule` + 세 batch-scoped override store를 함께 읽는 multi-owner projection stack이다.
  - `txnOverridesStore.ts`는 batch-scoped owner와 legacy unscoped bridge를 같이 들고 있지만, `accountMappingOverridesStore.ts`와 `txnTransferOverridesStore.ts`는 batch-scoped owner만 가진다.
  - `transactions/overrides` route는 dev-only + localhost guard route이므로, current contract 문서의 public canonical read facade로 재사용하면 안 된다.
  - same `planning-v3/txn-*overrides` 계열 파일 루트나 projection consumer 공존만으로 세 override store를 single owner로 합쳐 읽으면 안 된다.

### 후속 구현 handoff cut

- `override family current-state closeout docs-only sync`
  - 범위: `3.3` current-state memo chain, `transactions/overrides` dev bridge tier, 세 override store owner wording
  - 목적: batch-scoped owner set과 legacy unscoped bridge, multi-owner projection reader stack을 current code 기준으로 closeout sync 한다.
  - 비범위: override precedence 재설계, category semantics 확장, route/API shape 변경

### current-state resync audit (2026-03-25)

- `3.3 override family` current-state boundary map
  - `CategoryRule` owner는 `categories/store.ts` + `/api/planning/v3/categories/rules*`에 남는다.
  - batch-scoped override owner는 `TxnOverride`, `AccountMappingOverride`, `TxnTransferOverride`로 세 store에 분리돼 있다.
  - public/beta projection reader는 `getBatchSummary.ts`, `generateDraftPatchFromBatch.ts`, `/api/planning/v3/transactions/batches/[id]/categorized`, `/cashflow`, `/transfers`, `/api/planning/v3/balances/monthly`가 세 override store와 `CategoryRule`을 함께 읽는 multi-owner stack이다.
  - `/api/planning/v3/transactions/overrides`는 dev-only internal bridge route이고, `scope: "batch-scoped"`와 `scope: "legacy-unscoped"`를 같이 품는다.
- still-valid writer/read boundary
  - batch-scoped override persistence 자체는 계속 canonical public 기준이다.
  - legacy unscoped override는 `txnOverridesStore.ts` 안의 compat bridge로만 남고, `accountMapping` / `transfer` override에는 같은 legacy shape가 없다.
  - stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 resync 판단과 충돌하지 않는다. `docs/current-screens.md`에는 projection consumer인 `/planning/v3/transactions/batches*`만 있고 override command route는 user route inventory에 없다.
- stale or `[검증 필요]` mixed-ownership boundary
  - 기존 `writer owner = txnOverridesStore.ts` 한 줄은 stale하다.
  - 기존 `reader facade` 목록은 account-mapping / transfer override store와 `balances/monthly`, `transfers` projection을 충분히 반영하지 못한다.
  - 기존 `support/internal route = 없음` 문구는 stale하다. current code 기준 `/api/planning/v3/transactions/overrides`는 support/internal dev route로 읽는 편이 맞다.
  - current unresolved question은 override precedence 재설계가 아니라, mixed ownership snapshot을 current code 기준으로 다시 잠그는 wording resync다.
- current smallest viable next `N2` candidate는 broad 구현이 아니라 `override-family current-state closeout docs-only sync`다.
- broad `N2` 구현이나 override-family rewrite로 바로 가면 위험하다. current 문제는 owner/reader tier wording drift인데, 여기서 precedence나 API redesign까지 같이 열면 `3.4`/`3.5`와 다른 contract tier를 다시 한 큐에 합치게 된다.

### current-state closeout sync (2026-03-25)

- 이번 closeout에서 확정하는 것은 `CategoryRule` owner + 세 batch-scoped override owner(`TxnOverride`, `AccountMappingOverride`, `TxnTransferOverride`) + `txnOverridesStore.ts` 안의 legacy unscoped compat bridge 구분, `/api/planning/v3/transactions/overrides`의 dev-only support/internal route tier, `getBatchSummary.ts` / `generateDraftPatchFromBatch.ts` / `/api/planning/v3/transactions/batches/[id]/categorized` / `/cashflow` / `/transfers` / `/api/planning/v3/balances/monthly`의 multi-owner projection stack이라는 현재 stop line이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, override precedence 재설계, category semantics 확장, route 추가/삭제, API shape 변경, legacy bridge 제거 구현, `3.4` draft family / applied profile boundary 재개, `3.5` NewsSettings / AlertRule / Exposure / Scenario library 재개, `N2` import/export/rollback 본작업, stable/public IA 재편, beta visibility policy 변경이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다. `docs/current-screens.md` 기준 override command route는 user inventory 밖에 남고, projection consumer인 `/planning/v3/transactions/batches*`만 beta inventory에 있다.
- current next question은 더 이상 `3.3` 내부 wording resync가 아니다. `3.3` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 또는 다음 `N2` 공식 contract question으로만 넘긴다.
- future reopen trigger는 override precedence나 export/rollback unit을 실제로 바꾸는 `N2` 공식 question, dev-only bridge route를 public/beta contract로 다시 읽어야 하는 요구, route response semantics나 API shape를 실제로 바꾸는 요구, legacy bridge 제거/수선 flow 구현 요구로만 둔다.

### export 가능 단위

- `CategoryRule` set
- `TxnOverride` set
- `AccountMappingOverride` set
- `TxnTransferOverride` set

제외:

- categorized rows
- transfer grouping result
- cashflow projection

### rollback / repair 가능 단위

- rule/override item 또는 set 단위 복구
- categorized/cashflow/transfers projection 재계산

### visibility policy 전제조건

- batch-scoped override가 public contract의 기준이다.
- legacy unscoped override route는 internal/dev 전용으로 남기거나 별도 bridge로만 다뤄야 한다.
- override precedence가 닫히기 전에는 categorized/cashflow projection을 stable 계산식처럼 노출하지 않는다.

---

## 3.4 Draft family / applied profile boundary

### canonical owner

- `CsvDraftRecord (DraftV1)`
- `DraftProfileRecord`

### adjacent stable owner

- stable profile store owner

### route 분류

- command/write route
  - `/api/planning/v3/drafts`
  - `/api/planning/v3/drafts/[id]`
  - `/api/planning/v3/profile/drafts`
  - `/api/planning/v3/profile/drafts/[id]`
  - `/api/planning/v3/profile/drafts/[id]/apply`
- read/projection route
  - `/api/planning/v3/drafts`
  - `/api/planning/v3/drafts/[id]`
  - `/api/planning/v3/profile/draft`
  - `/api/planning/v3/profile/drafts`
  - `/api/planning/v3/profile/drafts/[id]`
  - `/api/planning/v3/profiles`
- support/internal route
  - `/api/planning/v3/draft/preview`
  - `/api/planning/v3/draft/profile`
  - `/api/planning/v3/draft/apply`
  - `/api/planning/v3/draft/scenario`
  - `/api/planning/v3/profile/drafts/[id]/preflight`
  - `/api/planning/v3/drafts/[id]/create-profile`

### request intent / response contract 메모

- draft owner route는 import 결과나 patch 초안을 저장/삭제한다.
- profile draft route는 stable profile에 적용되기 전의 patch candidate를 다룬다.
- preview / preflight / scenario route는 draft owner를 읽어 계산 결과를 보여 주는 support route다.
- `/api/planning/v3/drafts/[id]/create-profile`는 current code에서 `EXPORT_ONLY` 409만 반환하는 parked compat route이므로, active write owner route로 읽지 않는다.
- `profiles` route는 stable profile owner 목록을 읽는 bridge route다.
- apply route는 `DraftProfileRecord` owner를 stable profile owner로 넘기는 경계다.
- apply 응답은 stable profile id나 merged profile diff를 돌려주지만, 이것이 draft export 포맷이 되지는 않는다.

### current mixed ownership snapshot

- `writer owner`
  - `src/lib/planning/v3/drafts/draftStore.ts` for `CsvDraftRecord (DraftV1)`
  - `src/lib/planning/v3/store/draftStore.ts` for `DraftProfileRecord`
- `reader facade`
  - `src/lib/planning/v3/draft/store.ts`
  - `/api/planning/v3/drafts`
  - `/api/planning/v3/profile/drafts`
  - `/api/planning/v3/profile/drafts/[id]`
  - `/api/planning/v3/draft/preview`
  - `/api/planning/v3/profile/drafts/[id]/preflight`
- `legacy bridge`
  - `src/lib/planning/v3/draft/store.ts`가 csv draft와 profile draft를 같은 facade에서 같이 re-export한다.
  - `/api/planning/v3/profile/drafts/[id]/apply`
  - `/api/planning/v3/drafts/[id]/create-profile`
  - stable profile owner facade `src/lib/planning/v3/profiles/store.ts`
- 아직 pure canonical로 승격되지 않은 facade
  - csv draft root(`.data/planning_v3_drafts`)와 profile draft root(`.data/planning-v3/drafts`)가 분리되어 있는데 facade는 한 family처럼 노출한다.
  - `/api/planning/v3/draft/profile`은 profile draft owner가 아니라 legacy batch read 기반 support route다.
  - apply/create-profile 계열은 draft owner write가 아니라 stable profile owner bridge다.

### 후속 구현 handoff cut

- `draft-family / applied-profile boundary current-state closeout docs-only sync`
  - 범위: `3.4` current-state memo chain, shared facade tier, apply bridge boundary, parked compat route, support/internal draft route tier
  - 목적: writer owner split, stable profile bridge, support/internal route tier를 current code 기준으로 closeout sync 한다.
  - 비범위: stable profile apply result schema 재설계, preview/preflight 계산식 변경, route/API shape 변경

### contract 메모

- `DraftProfileRecord`는 canonical owner지만 apply 결과는 stable profile owner로 넘어가므로, apply route는 draft export/rollback contract에 포함하지 않는다.
- `CsvDraftRecord`와 `DraftProfileRecord`를 각각 first-class로 유지하더라도, shared facade를 canonical owner로 오해하지 않게 route 문구와 handoff 문서를 분리해야 한다.

### current-state closeout sync (2026-03-25)

- 이번 closeout에서 확정하는 것은 `CsvDraftRecord (DraftV1)` / `DraftProfileRecord` writer owner split, `src/lib/planning/v3/draft/store.ts` shared facade tier, `/api/planning/v3/profile/drafts/[id]/apply`의 stable profile bridge boundary, `/api/planning/v3/drafts/[id]/create-profile`의 parked `EXPORT_ONLY` compat route 상태, `/api/planning/v3/draft/*` / `/api/planning/v3/profile/draft` / `/api/planning/v3/profile/drafts/[id]/preflight`의 support/internal tier, `/api/planning/v3/profiles`의 stable profile owner bridge 성격이라는 현재 stop line이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, draft apply result schema 재설계, preview/preflight 계산식 변경, route 추가/삭제, API shape 변경, legacy bridge 제거 구현, `3.5` NewsSettings / AlertRule / Exposure / Scenario library 재개, `N2` import/export/rollback 본작업, stable/public IA 재편, beta visibility policy 변경이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다. `docs/current-screens.md` 기준 beta inventory에는 `/planning/v3/profile/drafts`, `/planning/v3/profile/drafts/[id]`, `/planning/v3/profile/drafts/[id]/preflight`가 있고, support/internal draft routes는 user inventory 밖에 남는다.
- current next question은 더 이상 `3.4` 내부 wording resync가 아니다. `3.4` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 또는 다음 `N2` 공식 contract question으로만 넘긴다.
- future reopen trigger는 draft owner와 stable profile owner 사이 export/rollback unit을 실제로 바꾸는 `N2` 공식 question, parked compat route 활성화 요구, support/internal draft route를 public/beta contract로 올리는 요구, route response semantics나 API shape를 실제로 바꾸는 요구로만 둔다.

### export 가능 단위

- draft owner record 또는 draft set
- profile draft record 또는 profile draft set

제외:

- preview payload
- preflight result
- merged profile preview
- apply 결과로 생성된 stable profile

### rollback / repair 가능 단위

- draft owner 삭제/복구
- profile draft owner 삭제/복구
- preview / preflight 재실행

금지:

- draft rollback으로 stable profile apply 결과를 되돌린다고 약속하지 않음

### visibility policy 전제조건

- apply route는 stable profile owner 경계가 명시되기 전 stable 공개 금지
- support/internal route는 beta/internal helper로만 유지하고 canonical export owner로 승격하지 않는다

---

## 3.5 NewsSettings / AlertRule / Exposure / Scenario library

### canonical owner

- `NewsSettings`
- `NewsAlertRuleOverride`
- `ExposureProfile`
- `ScenarioLibraryOverrides`

### route 분류

- command/write route
  - `/api/planning/v3/news/settings`
  - `/api/planning/v3/news/alerts/rules`
  - `/api/planning/v3/news/exposure`
  - `/api/planning/v3/exposure/profile`
  - `/api/planning/v3/scenarios/library`
- read/projection route
  - `/api/planning/v3/news/settings`
  - `/api/planning/v3/news/alerts/rules`
  - `/api/planning/v3/news/exposure`
  - `/api/planning/v3/exposure/profile`
  - `/api/planning/v3/scenarios/library`
  - `/api/planning/v3/news/digest`
  - `/api/planning/v3/news/items`
  - `/api/planning/v3/news/search`
  - `/api/planning/v3/news/today`
  - `/api/planning/v3/news/trends`
  - `/api/planning/v3/news/scenarios`
- support/internal route
  - `/api/planning/v3/news/alerts`
  - `/api/planning/v3/news/notes`
  - `/api/planning/v3/news/refresh`
  - `/api/planning/v3/news/recovery`
  - `/api/planning/v3/news/sources`
  - `/api/planning/v3/news/weekly-plan`

### request intent / response contract 메모

- settings / rules / exposure / scenario library route는 singleton config owner를 읽고 쓴다.
- `news/exposure`와 `exposure/profile`은 같은 `ExposureProfile` family를 다루는 route로 본다.
- digest, trends, today, search, scenarios, items는 config owner를 읽어 만든 projection이다.
- `news/alerts`는 alert event state(`ack`, `hide`)를 다루는 support artifact route다.
- `news/notes`는 analyst/user note overlay route이며 canonical owner로 올리지 않는다.
- config owner write route는 대체로 `{ ok, data }` 또는 `{ ok, profile }` family를 쓴다.

### export 가능 단위

- `NewsSettings`
- `NewsAlertRuleOverride`
- `ExposureProfile`
- `ScenarioLibraryOverrides`

제외:

- digest/trends/today/search/items 결과
- alert event state
- notes
- refresh/recovery 결과
- weekly-plan projection

### rollback / repair 가능 단위

- singleton config owner 복구
- projection 재생성
- alert event state와 notes는 support artifact이므로 rollback owner로 약속하지 않음

### visibility policy 전제조건

- singleton config write route는 beta/internal 우선
- digest/trends 같은 projection 공개는 가능하더라도 config write와 같은 release gate로 다루지 않음
- `news/exposure`와 `exposure/profile`의 response wrapper 차이는 유지될 수 있지만, export/rollback semantics는 같은 owner family로 잠근다

### current-state resync audit (2026-03-25)

- `3.5 singleton config family` current-state boundary map
  - `NewsSettings`: `/api/planning/v3/news/settings`은 same-origin + CSRF guard 아래에서 같은 route가 read/write를 함께 담당하는 owner family route다. GET response의 `sources`/`topics`는 default/override/effective composition을 포함하지만, export/rollback owner는 계속 `NewsSettings` 하나로 읽는다.
  - `NewsAlertRuleOverride`: `/api/planning/v3/news/alerts/rules`도 같은 route가 read/write를 함께 담당하는 owner family route다. `defaults`/`overrides`/`effective`는 read composition tier이며 별도 owner unit으로 승격하지 않는다.
  - `ExposureProfile`: `/api/planning/v3/news/exposure`와 `/api/planning/v3/exposure/profile`은 둘 다 같은 `ExposureProfile` owner family를 읽고 쓴다. 현재 code 기준 wrapper divergence(`{ ok, data }` vs `{ ok, profile }`)는 compat surface로 허용되지만, 별도 export/rollback unit이나 별도 owner family로 읽지 않는다.
  - `ScenarioLibraryOverrides`: `/api/planning/v3/scenarios/library`은 same-origin + CSRF guard 아래에서 same route가 read/write를 함께 담당하는 owner family route다. `rows`는 default/override/effective projection을 담지만 owner unit은 계속 `ScenarioLibraryOverrides` 하나로 잠근다.
- still-valid command/read/support split
  - command/read route는 `/api/planning/v3/news/settings`, `/api/planning/v3/news/alerts/rules`, `/api/planning/v3/news/exposure`, `/api/planning/v3/exposure/profile`, `/api/planning/v3/scenarios/library` 다섯 개 그대로 유지한다.
  - projection/read artifact route는 `/api/planning/v3/news/digest`, `/api/planning/v3/news/items`, `/api/planning/v3/news/search`, `/api/planning/v3/news/today`, `/api/planning/v3/news/trends`, `/api/planning/v3/news/scenarios`로 읽는다. 이들은 singleton config owner를 참고해 digest/search/trend/scenario pack 같은 read model을 만드는 projection tier이지, 같은 export/rollback owner set이 아니다.
  - support/internal artifact route는 `/api/planning/v3/news/alerts`, `/api/planning/v3/news/notes`, `/api/planning/v3/news/recovery`, `/api/planning/v3/news/sources`, `/api/planning/v3/news/refresh`, `/api/planning/v3/news/weekly-plan`로 유지한다. alert event state, analyst/user note overlay, repair/import helper, refresh action, weekly-plan artifact는 singleton config owner family와 같은 contract tier로 합치지 않는다.
- stale or `[검증 필요]` grouping boundary
  - `news/exposure`와 `exposure/profile`의 wrapper divergence는 current code 기준으로는 허용되는 compat divergence지만, future export/rollback payload를 하나로 잠그려면 별도 `N2` 공식 question이 필요하다.
  - `/api/planning/v3/news/sources`는 `NewsSettings`와 연결된 source transfer/import helper route이지만, current code상 owner route라기보다 support/internal transfer tier다. 이를 `NewsSettings` canonical export/import route로 승격하는 판단은 아직 `[검증 필요]`다.
  - `/api/planning/v3/news/weekly-plan`은 자체 read/write artifact shape를 갖지만, current code만으로 `NewsSettings`/`ScenarioLibraryOverrides`와 같은 singleton config owner set으로 묶을 근거는 부족하다.
- current unresolved question은 singleton config family redesign이 아니라 current mixed route/owner tier wording resync다. current smallest viable next `N2` candidate는 broad 구현이 아니라 `singleton-config-family current-state closeout docs-only sync`다.
- 비범위는 실제 구현 코드 변경, `3.2`/`3.3`/`3.4` closeout 재오픈, singleton config family 재설계, route 추가/삭제, API shape 변경, wrapper shape 통합 구현, `N2` import/export/rollback 본작업, stable/public IA 재편, beta visibility policy 변경이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 resync 판단과 충돌하지 않는다. `docs/current-screens.md` 기준 user inventory에는 `/planning/v3/news/settings`와 `/planning/v3/exposure`가 있고, support/internal news routes는 inventory 밖에 남는다.
- broad `N2` 구현이나 config family rewrite로 바로 가면 위험하다. 현재 남은 질문은 owner grouping, wrapper divergence, helper/support tier를 current-state wording으로 분리해 잠그는 문제인데, 이를 구현 question과 한 큐로 합치면 export/rollback unit과 support route tier가 다시 섞인다.

### current-state closeout sync (2026-03-25)

- 이번 closeout에서 확정하는 것은 `NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile`, `ScenarioLibraryOverrides` 네 owner family, `/api/planning/v3/news/settings` / `/news/alerts/rules` / `/news/exposure` / `/exposure/profile` / `/scenarios/library`의 command/read owner route tier, `/api/planning/v3/news/digest` / `/news/items` / `/news/search` / `/news/today` / `/news/trends` / `/news/scenarios`의 projection/read model tier, `/api/planning/v3/news/alerts` / `/news/notes` / `/news/recovery` / `/news/sources` / `/news/refresh` / `/news/weekly-plan`의 support/internal tier, 그리고 `news/exposure`와 `exposure/profile` wrapper divergence를 compat divergence로만 남기고 별도 owner/export unit으로 올리지 않는 현재 stop line이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, `3.2` / `3.3` / `3.4` closeout 재오픈, singleton config family 재설계, route 추가/삭제, API shape 변경, wrapper shape 통합 구현, export/rollback grouping 구현, `N2` import/export/rollback 본작업, stable/public IA 재편, beta visibility policy 변경이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다. `docs/current-screens.md` 기준 user page inventory에는 `/planning/v3/news/settings`와 `/planning/v3/exposure`가 있고, support/internal news API routes는 page inventory 밖에 남는다.
- current next question은 더 이상 `3.5` 내부 wording resync가 아니다. `3.5` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 확인 또는 `N2` 종료 판단으로만 넘긴다.
- future reopen trigger는 singleton config owner export/rollback grouping을 실제로 바꾸는 `N2` 공식 question, `news/exposure`와 `exposure/profile` wrapper semantics를 실제로 통합해야 하는 요구, `/api/planning/v3/news/sources`나 `/api/planning/v3/news/weekly-plan`을 owner set/public beta contract로 승격해야 하는 요구, route response semantics나 API shape를 실제로 바꾸는 요구로만 둔다.

### post-3.2 remaining-family reselection audit (2026-03-25)

- already-parked boundary
  - `3.2 ImportBatch / TransactionRecord` current-state closeout은 `none for now`로 유지한다.
  - `3.4 Draft family / applied profile boundary`는 `N1` memo chain과 current code 기준으로 apply route의 stable profile bridge 경계, `/api/planning/v3/drafts/[id]/create-profile`의 parked compat status, support/internal draft route tier가 이미 비교적 좁게 잠겨 있어 post-3.2 기준 current smallest official `N2` cut으로는 다시 고르지 않는다.
- still-open or `[검증 필요]`
  - `3.3 CategoryRule / override family`의 current mixed ownership snapshot은 stale하다. batch-scoped writer surface는 `txnOverridesStore.ts` 하나가 아니라 `accountMappingOverridesStore.ts`, `txnTransferOverridesStore.ts`까지 포함하고, summary / categorized / cashflow / transfers / balances / draft-profile projection이 세 store를 함께 읽는다.
  - dev-only `/api/planning/v3/transactions/overrides` route는 `onlyDev()` + localhost guard 아래에서 `scope: "batch-scoped"`와 `scope: "legacy-unscoped"`를 같이 다루므로, current code 기준 public canonical read facade로 읽으면 안 된다.
  - `3.5 NewsSettings / AlertRule / Exposure / Scenario library`는 owner 구현 확인 이후에도 export/rollback grouping과 singleton config family wrapper divergence(`news/exposure` vs `exposure/profile`)를 함께 다뤄야 해서 `3.3`보다 더 큰 질문으로 남는다.
- current smallest viable next `N2` candidate는 broad 구현이 아니라 `3.3 override family current-state resync / batch-scoped owner vs legacy unscoped bridge containment`이다.
- 비범위는 writer owner 변경, route 추가/삭제, API shape 변경, legacy bridge 제거 구현, `N2` import/export/rollback 본작업, stable/public IA 재편, beta visibility policy 변경이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 reselection 판단과 충돌하지 않는다. `docs/current-screens.md`의 beta inventory에는 `/planning/v3/profile/drafts`, `/planning/v3/exposure`, `/planning/v3/news/settings`, `/planning/v3/transactions/batches*`가 있고, dev-only override route는 inventory 밖에 남는다.
- broad `N2` 구현이나 planning/v3 rewrite로 바로 가면 위험하다. 현재 남은 family는 current-state owner wording split(`3.3`)과 future export/rollback grouping question(`3.5`)이 섞여 있어, 여기서 cut을 넓히면 다시 다른 contract tier를 한 큐에 합치게 된다.

### post-3.3 remaining-family reselection audit (2026-03-25)

- already-parked boundary
  - `3.2 ImportBatch / TransactionRecord` current-state closeout은 `none for now`로 유지한다.
  - `3.3 CategoryRule / override family` current-state closeout도 `none for now`로 유지한다.
- still-open or `[검증 필요]`
  - `3.4 Draft family / applied profile boundary`는 current code 기준으로 writer owner split(`CsvDraftRecord`, `DraftProfileRecord`), shared facade `src/lib/planning/v3/draft/store.ts`, `/api/planning/v3/profile/drafts/[id]/apply`의 stable profile bridge boundary, `/api/planning/v3/drafts/[id]/create-profile`의 parked `EXPORT_ONLY` compat route, support/internal draft route tier가 이미 비교적 좁게 정렬돼 있다.
  - `3.5 NewsSettings / AlertRule / Exposure / Scenario library`는 owner 구현 확인과 별개로 `NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile`, `ScenarioLibraryOverrides` export/rollback grouping, `news/exposure` vs `exposure/profile` wrapper divergence, singleton config family contract를 같이 다뤄야 해서 `3.4`보다 더 큰 질문으로 남는다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 reselection 판단과 충돌하지 않는다. `docs/current-screens.md` 기준 beta inventory에는 `/planning/v3/profile/drafts*`, `/planning/v3/news/settings`, `/planning/v3/exposure`가 있고, support/internal draft routes는 user inventory 밖에 남는다.
- current smallest viable next `N2` candidate는 broad 구현이 아니라 `3.4 draft family / applied profile boundary current-state closeout docs-only sync`다.
- 비범위는 구현 코드 변경, route 추가/삭제, API shape 변경, precedence 재설계, legacy bridge 제거 구현, `N2` import/export/rollback 본작업, stable/public IA 재편, beta visibility policy 변경이다.
- broad `N2` 구현이나 planning/v3 rewrite로 바로 가면 위험하다. `3.4`는 route tier와 stable profile bridge boundary closeout으로 좁게 다룰 수 있지만, `3.5`는 singleton config family grouping과 wrapper divergence를 함께 품고 있어 같은 라운드에 합치면 다시 contract tier가 커진다.

### contract-family none-for-now closeout sync (2026-03-25)

- 이번 closeout에서 확정하는 것은 `3.2 ImportBatch / TransactionRecord`, `3.3 CategoryRule / override family`, `3.4 Draft family / applied profile boundary`, `3.5 NewsSettings / AlertRule / Exposure / Scenario library`가 모두 current-state closeout 이후 family 내부 micro docs-first cut 기준으로는 현재 `none for now`라는 점이다.
- `3.2`는 stored writer owner / stored-first reader facade / legacy bridge / dual-surface route meaning / `items` vs `data` compat payload tier / `sourceBinding` no-current-consumer / same-id `/account` route-local sequencing까지를 current stop line으로 유지한다.
- `3.3`은 `CategoryRule` + 세 batch-scoped override owner + legacy unscoped compat bridge / dev-only support route / multi-owner projection stack까지를 current stop line으로 유지한다.
- `3.4`는 `CsvDraftRecord (DraftV1)` / `DraftProfileRecord` writer owner split / shared facade / stable profile bridge / parked compat route / support/internal draft route tier까지를 current stop line으로 유지한다.
- `3.5`는 singleton config owner family / projection-read model tier / support/internal tier / `news/exposure` vs `exposure/profile` compat divergence까지를 current stop line으로 유지한다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, route 추가/삭제, API shape 변경, writer owner 변경, legacy bridge 제거 구현, wrapper shape 통합 구현, export/rollback grouping 구현, stable/public IA 재편, beta visibility policy 변경이다.
- current next question은 더 이상 각 family 내부 micro memo가 아니다. 후속 판단은 trigger-specific reopen 또는 `N2` 종료 판단, 다음 공식 축(`N3`)로의 이동 여부로만 넘긴다.
- future reopen trigger는 export/rollback unit을 실제로 바꾸는 `N2` 공식 question, route response semantics나 API shape를 실제로 바꾸는 요구, dormant compat surface를 public/beta contract로 승격해야 하는 요구, support/internal route를 owner/public tier로 올려야 하는 요구로만 둔다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 family-level closeout 상태와 충돌하지 않는다. page inventory와 API route tier는 계속 분리해서 읽는다.
- broad `N2` 구현이나 planning/v3 rewrite로 바로 가면 위험하다. 지금 남아 있는 질문은 각 family 안의 current-state stop line을 다시 여는 문제가 아니라, future contract regrouping과 visibility/payload semantics를 실제로 바꾸는 더 큰 공식 question이기 때문이다.

### N2 none-for-now closeout handoff-to-N3 sync (2026-03-25)

- 이번 handoff에서 확정하는 것은 `3.2` / `3.3` / `3.4` / `3.5` family-level current-state memo chain이 모두 current micro docs-first cut 기준으로는 `none for now`라는 점이다.
- 이 closeout은 `N2` 구현 완료 선언이 아니다. current code 기준 family 내부 memo chain을 잠근 상태일 뿐이고, export/rollback grouping 구현, route behavior 변경, payload semantics 재정의는 여전히 비범위다.
- current next recommendation은 `N2` 내부 새 family audit이 아니라 trigger-specific reopen 확인 또는 다음 공식 축 `N3 QA gate / golden dataset`의 current-state read와 parked baseline 점검으로 넘긴다.
- future reopen trigger는 export/rollback unit을 실제로 바꾸는 `N2` 공식 question, route response semantics나 API shape를 실제로 바꾸는 요구, dormant compat surface를 public/beta contract로 승격해야 하는 요구, support/internal route를 owner/public tier로 올려야 하는 요구로만 둔다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 handoff 판단과 충돌하지 않는다. `docs/current-screens.md`의 beta page inventory는 그대로 유지되고, support/internal API tier는 계속 별도 contract tier로 읽는다.

---

## 3.6 Support / internal owner-adjacent route

### 범주

- `/api/planning/v3/journal/entries`
- `/api/planning/v3/journal/entries/[id]`
- `/api/planning/v3/routines/daily`
- `/api/planning/v3/indicators/specs`

### contract 메모

- 현재 `N1` first-class canonical entity에는 포함하지 않는다.
- 보조 기록, checklist, annotation, import spec tooling 성격이 강하다.
- stable export/rollback owner로 약속하지 않는다.

[미확인]

- `journal entry`, `routine checklist`, `indicator spec override`를 차기 canonical owner로 올릴 필요가 있는지는 별도 탐색이 필요하다.

---

## 4. export / rollback / repair 단위 요약

## 4.1 export 가능 단위

- `Account` owner set
- `OpeningBalance` owner set
- `ImportBatch` + batch-scoped `TransactionRecord` 묶음
- `CategoryRule` set
- `TxnOverride` set
- `AccountMappingOverride` set
- `TxnTransferOverride` set
- `CsvDraftRecord (DraftV1)` set
- `DraftProfileRecord` set
- `NewsSettings`
- `NewsAlertRuleOverride`
- `ExposureProfile`
- `ScenarioLibraryOverrides`

## 4.2 rollback 가능 단위

- account row/set
- opening-balance row/set
- batch owner 단위
- rule/override item 또는 set
- draft owner item 또는 set
- singleton config owner

## 4.3 rollback 대상이 아닌 것

- monthly balance timeline
- batch summary
- categorized/cashflow/transfers projection
- draft preview / preflight / scenario simulation
- news digest / trends / today / search / scenarios
- alert event state
- notes
- checklist / journal / indicator spec support route

## 4.4 repair 의미

- repair는 canonical owner를 새로 계산하거나 projection을 재생성하는 행위다.
- projection mismatch는 repair 대상이지 rollback 대상이 아니다.
- owner corruption이 아니면 projection route에 rollback 약속을 하지 않는다.

---

## 5. route-to-owner boundary 이슈

## 5.1 `(batchId, txnId)` vs global transaction id

- 현재 안전한 canonical key는 `(batchId, txnId)` 복합 key다.
- global transaction id 승격은 `N2` 후속 구현 전까지 보류한다.
- export/rollback 단위는 개별 transaction보다 batch owner를 우선 기준으로 잡는다.

## 5.2 legacy unscoped override 처리

- `transactions/overrides`에는 batch-scoped와 unscoped legacy shape가 공존한다.
- canonical public contract는 batch-scoped override를 우선 기준으로 잡는다.
- legacy unscoped override는 internal/dev bridge로만 취급한다.

## 5.3 opening balance owner와 account starting balance 경계

- `accounts/[id]/starting-balance`는 account owner 편의 route다.
- `opening-balances`는 날짜를 가진 opening-balance owner route다.
- 두 route를 같은 rollback owner로 합치지 않는다.

## 5.4 `DraftProfileRecord` apply와 stable profile owner 경계

- apply는 `planning/v3` owner를 stable profile owner로 넘기는 bridge다.
- apply 결과의 rollback 책임은 draft owner가 아니라 stable profile owner 쪽에 남는다.
- draft export와 stable profile export를 한 묶음으로 약속하지 않는다.

## 5.5 news artifact와 canonical owner 분리

- alert event state, digest, trends, notes, weekly-plan은 canonical owner가 아니다.
- config owner(`NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile`, `ScenarioLibraryOverrides`)만 export/rollback 대상으로 본다.

---

## 6. `N3`, `N4`로 넘길 전제조건

## 6.1 `N3 QA gate` 입력

- owner family별 command/write route와 read/projection route 구분이 고정돼 있어야 한다.
- export owner와 rollback owner 목록이 잠겨 있어야 한다.
- projection route는 owner restore가 아니라 재계산 검증 대상으로 분리돼야 한다.
- support/internal route는 stable regression gate 대상에서 분리할 수 있어야 한다.

## 6.2 `N4 beta exposure` 입력

- owner family마다 stable/beta/internal 후보 route를 다시 나눌 수 있어야 한다.
- bridge route(`draft apply`, stable profile read, legacy override`)는 stable 공개 전에 별도 guard가 필요하다.
- dev-only 성격이 강한 route(`transactions/overrides`, 일부 support route)는 public beta 후보에서 제외해야 한다.

---

## 7. 이번 단계 결론

- `planning/v3` API contract는 route path가 아니라 canonical owner family 기준으로만 다룬다.
- export/rollback은 first-class canonical owner에만 약속한다.
- read/projection route와 support/internal route는 export/rollback owner가 아니다.
- stable planning v2 owner와 `planning/v3` owner는 apply/export/restore 묶음으로 합치지 않는다.
- `N3`, `N4`는 이 문서의 owner family, export unit, rollback unit을 그대로 재사용해 gate와 visibility를 정한다.
