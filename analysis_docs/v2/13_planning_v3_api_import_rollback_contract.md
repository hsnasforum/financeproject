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
- batch/account command는 batch의 `accountId`를 owner metadata로 저장한다.
- batch read route는 batch meta와 transaction row를 owner 단위로 읽는다.
- categorized/cashflow/transfers는 transaction owner에 override family를 합쳐 만든 multi-owner projection이다.
- owner read route는 주로 `{ ok, items }`, `{ ok, meta, items }`, `{ ok, data }` family다.
- owner write route는 `{ ok, batch }`, `{ ok, data }`, `{ ok, deleted }` family를 쓴다.

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
  - `/api/planning/v3/transactions/overrides`
  - `/api/planning/v3/transactions/account-overrides`
  - `/api/planning/v3/transactions/transfer-overrides`
  - `/api/planning/v3/batches/[id]/txn-overrides`
- read/projection route
  - `/api/planning/v3/categories/rules`
  - `/api/planning/v3/transactions/overrides`
  - `/api/planning/v3/transactions/batches/[id]/categorized`
  - `/api/planning/v3/transactions/batches/[id]/cashflow`
  - `/api/planning/v3/transactions/batches/[id]/transfers`
- support/internal route
  - 없음

### request intent / response contract 메모

- category rule route는 rule list CRUD를 담당한다.
- override family route는 batch-scoped 또는 legacy unscoped override를 저장한다.
- categorized/cashflow/transfers는 override family를 읽어 projection을 다시 계산한다.
- `transactions/overrides`는 dev-only legacy route가 섞여 있으므로 stable public contract의 기준이 될 수 없다.
- write route는 `{ ok, override }`, `{ ok, data }`, `{ ok, deleted }` family를 쓴다.

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
  - `/api/planning/v3/drafts/[id]/create-profile`
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

### request intent / response contract 메모

- draft owner route는 import 결과나 patch 초안을 저장/삭제한다.
- profile draft route는 stable profile에 적용되기 전의 patch candidate를 다룬다.
- preview / preflight / scenario route는 draft owner를 읽어 계산 결과를 보여 주는 support route다.
- `profiles` route는 stable profile owner 목록을 읽는 bridge route다.
- apply route는 `DraftProfileRecord` owner를 stable profile owner로 넘기는 경계다.
- apply 응답은 stable profile id나 merged profile diff를 돌려주지만, 이것이 draft export 포맷이 되지는 않는다.

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
