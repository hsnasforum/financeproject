# 11. post-Phase-3 vNext backlog 정의

작성 기준: `P1 ~ P3` 13개 항목 closeout 완료 상태, 2026-03-17(KST)
범위: 다음 공식 구현 사이클의 backlog 정의

---

## 1. 목적

이 문서는 기존 `P1 ~ P3` 완료 로드맵 이후의 다음 사이클을
기능 추가가 아니라 `planning/v3`와 운영 규칙의 제품화 준비 단계로 다시 정의하기 위한 backlog 문서입니다.

이번 문서의 목적은 아래 4가지입니다.

1. 다음 사이클의 공식 backlog를 3~5개 항목으로 고정한다.
2. `planning/v3` 관련 작업을 `contract-first` 원칙으로 다시 정렬한다.
3. `product UX polish`, `beta exposure`, `ops/QA gate`를 독립 backlog로 어디까지 분리할지 정한다.
4. 기존 완료 로드맵과 섞지 않고, 새 사이클의 우선순위와 선행 조건을 문서로 남긴다.

---

## 2. backlog 분류 틀

다음 사이클 backlog는 아래 4개 분류로만 관리합니다.

### 2.1 contract-first

- canonical entity
- storage ownership
- API/DTO/input-output contract
- import/export/rollback/repair rule

원칙:
- public beta 노출보다 먼저 닫아야 한다.
- 코드보다 문서와 contract가 먼저다.

### 2.2 product UX polish

- 기존 stable surface의 copy, helper, 위계, CTA polish
- 기존 규칙을 깨지 않는 작은 개선만 다룬다.

원칙:
- 독립 대형 축으로 먼저 열지 않는다.
- contract-first backlog를 막는 blocker가 아닐 때만 후순위로 둔다.

### 2.3 beta exposure

- 어떤 route를 public beta로 보일지
- 어떤 조건에서 stable/beta/internal로 분리할지
- visibility / onboarding / guard 정책

원칙:
- `planning/v3` canonical contract와 QA gate가 먼저 있어야 한다.

### 2.4 ops/QA gate

- public stable / public beta / ops-dev 검증 분리
- golden dataset
- release gate / regression gate 재정의

원칙:
- 단순 테스트 추가가 아니라 제품 경계에 맞는 통과 기준을 다시 세우는 작업으로 본다.
- `planning/v3` 계약이 어느 정도 닫힌 뒤 독립 항목으로 다룬다.

---

## 3. 다음 사이클 공식 backlog

## N1. planning/v3 canonical entity model 정의

- 분류: `contract-first`
- 목적:
  `planning/v3`의 계좌/잔액/거래/배치/카테고리 규칙/프로필 draft/시나리오 draft/news alert를 어떤 canonical entity 집합으로 소유할지 고정한다.
- 왜 지금 필요한가:
  current route inventory는 넓지만 공개 schema와 정합한 owner 모델이 아직 명확히 드러나지 않는다. 이 상태에서 화면이나 beta exposure를 먼저 늘리면 변경 비용이 급격히 커진다.
- 선행 조건:
  없음. 다음 사이클의 가장 첫 항목이다.
- 구현 전에 먼저 필요한 문서/계약:
  - canonical entity list
  - entity별 owner / key / lifecycle / relation
  - stable route와 beta route가 어떤 entity를 읽고 쓰는지 mapping
- 완료 기준:
  - `planning/v3` 핵심 엔티티 목록이 문서로 고정됨
  - 공개 schema와 route inventory 사이의 불일치/미확인 구간이 정리됨
  - 후속 API/DTO 설계가 이 문서를 기준으로만 진행될 수 있음

연결 메모 (2026-03-17):
- canonical entity inventory와 owner 경계는 `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`를 기준으로 잠급니다.
- `PlannerSnapshot`와 `planning/v3` file/local owner는 같은 canonical set으로 합치지 않습니다.
- `N2`의 API/import-export/rollback 논의는 이 문서의 entity name, owner, key, lifecycle을 그대로 재사용합니다.

연결 메모 (2026-03-19 code audit):
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 current code touchpoint snapshot을 추가해 owner 구현 상태를 실제 store/service/API와 대조했다.
- 후속 `N2`는 batch list/detail/summary, balances, draft family, legacy override bridge를 mixed ownership 경계로 계속 취급해야 한다.

연결 메모 (2026-03-25 current-state resync audit):
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`의 first-class / derived / transient 분리와 대부분의 owner boundary는 current code 기준으로 still-valid하다고 다시 확인했다.
- 다만 `NewsAlertRuleOverride` owner persistence path, `generateDraftPatchFromBatch.ts`, `getBatchSummary.ts` touchpoint 설명은 stale해서 current-state resync note로 보정했다.
- `docs/current-screens.md` 기준 stable `/planning*` route와 `Public Beta` `/planning/v3/*` route SSOT는 현재 canonical entity map과 충돌하지 않는다. stable route는 stable planning/report/run surface로, v3 canonical owner map은 계속 beta route cluster로만 읽는다.
- current smallest viable next `N1` candidate는 broad canonical rewrite나 `N2` 구현이 아니라 `draft family owner-sync question`이다. `CsvDraftRecord` / `V3DraftRecord` / `DraftProfileRecord` facade + shared-dir + stable apply handoff 경계를 먼저 좁혀야 한다.

연결 메모 (2026-03-25 draft-family owner-sync question candidate memo audit):
- `src/lib/planning/v3/draft/store.ts`는 current code 기준 standalone owner가 아니라 csv draft / profile draft / preview bridge alias를 묶은 shared facade로 읽는 편이 맞다.
- `/api/planning/v3/drafts*`는 `DraftV1` family를 직접 읽고 쓰고, `/api/planning/v3/profile/drafts*`는 `DraftProfileRecord` family를 직접 읽는다. `/api/planning/v3/profile/drafts/[id]/apply`는 stable profile owner bridge이고, `/api/planning/v3/draft/preview`는 `DraftProfileRecord` 또는 legacy `DraftV1`를 `V3DraftRecord` preview shape로 정규화하는 support route다.
- current mixed boundary는 `src/lib/planning/v3/store/draftStore.ts`가 `V3DraftRecord`와 `DraftProfileRecord`를 같은 module/root/fallback에 두는 점과, `V3DraftRecord`의 owner status가 current route surface에서 bridge/support인지 first-class인지 아직 더 좁혀야 한다는 점이다.
- current smallest viable next `N1` candidate는 broad draft-family merge가 아니라 `V3DraftRecord bridge-only status / shared-facade wording split memo`다.

연결 메모 (2026-03-25 V3DraftRecord bridge-only status / shared-facade wording split memo audit):
- current code 기준 `V3DraftRecord`는 `src/lib/planning/v3/store/draftStore.ts` 안에 persisted shape로 남아 있지만, `/api/planning/v3/drafts*`나 `/api/planning/v3/profile/drafts*`가 직접 소유하는 standalone owner family로는 닫히지 않는다.
- `/api/planning/v3/draft/preview`는 `getProfileDraftBridge()` 또는 legacy `DraftV1`를 `V3DraftRecord` preview shape로 정규화하는 support bridge route이고, `/api/planning/v3/drafts/[id]/create-profile`는 `EXPORT_ONLY` 409만 반환하는 parked support compat route다.
- `src/lib/planning/v3/draft/store.ts`는 third canonical owner가 아니라 `DraftV1` owner re-export, `DraftProfileRecord` owner re-export, preview/apply bridge alias가 공존하는 shared alias/compat facade라고 wording을 나눠 읽는 편이 맞다.
- current smallest viable next `N1` candidate는 broad draft-family merge가 아니라 `store/draftStore.ts same-root dual-shape persistence boundary memo`다.

연결 메모 (2026-03-25 store/draftStore.ts same-root dual-shape persistence-boundary memo audit):
- `src/lib/planning/v3/store/draftStore.ts`는 `resolveDraftPath(id)`를 `V3DraftRecord`와 `DraftProfileRecord` 양쪽에 공용으로 쓰고, `listDraftFiles()`도 primary `.data/planning-v3/drafts`와 legacy `.data/v3/drafts`를 full file path 기준으로 함께 열거한다.
- current code에서 same root/fallback 경계는 디렉터리 이름보다 normalizer와 route meaning으로 갈린다. `/api/planning/v3/draft/preview`는 `V3DraftRecord` preview bridge row를 읽고, `/api/planning/v3/profile/drafts*`는 같은 file pool에서 `DraftProfileRecord` owner row를 읽는다.
- 따라서 persisted file root, module path, legacy fallback만 보고 owner를 추론하면 다시 섞여 읽히고, current smallest unresolved boundary는 shape merge보다 `primary-vs-legacy same-id duplicate precedence`에 더 가깝다.
- current smallest viable next `N1` candidate는 broad draft-family merge가 아니라 `primary-vs-legacy same-id duplicate precedence memo`다.

연결 메모 (2026-03-25 primary-vs-legacy same-id duplicate precedence memo audit):
- `listDraftFiles()`는 same sanitized id를 full file path 기준으로 둘 다 남기므로, same-id duplicate가 생기면 list surface는 duplicate row를 그대로 노출할 수 있다. 반면 `getDraft()`와 `getProfileDraft()`는 primary valid row를 먼저 고르고, 그 read/normalize가 실패할 때만 legacy valid row로 fallback한다.
- `deleteDraft()`와 `deleteProfileDraft()`는 primary/legacy target을 모두 지우는 dual-target sweep semantics를 가지므로, user-visible flow 기준 list/detail/delete가 같은 duplicate set에 대해 서로 다른 precedence를 가질 수 있다.
- `/api/planning/v3/draft/preview`, `/api/planning/v3/profile/drafts/[id]`, `/api/planning/v3/profile/drafts/[id]/preflight`, `/api/planning/v3/profile/drafts/[id]/apply`는 single-row primary-valid-first detail precedence를 공유하지만, `/api/planning/v3/profile/drafts` list route는 same-id duplicate exposure를 그대로 surface할 수 있다.
- current smallest viable next `N1` candidate는 broad draft-family merge가 아니라 `profile/drafts duplicate-id list exposure memo`다.

연결 메모 (2026-03-25 profile/drafts duplicate-id list-exposure memo audit):
- `/api/planning/v3/profile/drafts` GET과 `/planning/v3/profile/drafts` page는 current code 기준 duplicate collapse 없이 same-id row를 literal하게 beta surface에 노출할 수 있다.
- 다만 list client는 `draftId`를 row key, detail href, delete target id의 고유 식별자로 전제하고, detail/preflight/apply는 single-row primary-valid-first winner만 읽으므로, 이 duplicate 노출을 intended steady-state beta state로 읽기보다는 historical/operator anomaly leak로 읽는 편이 current code와 맞다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 해석과 충돌하지 않는다. 문제는 stable/public IA가 아니라 beta draft-family anomaly boundary에 머문다.
- draft-family duplicate/list exposure 범위 안에서 current smallest viable next `N1` candidate는 `none for now`다. 후속 reopen은 `N2` contract 또는 beta visibility trigger가 실제로 생길 때만 다시 여는 편이 적절하다.

연결 메모 (2026-03-25 draft-family none-for-now closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 `DraftV1` writer owner 유지, `DraftProfileRecord` writer owner 유지, `V3DraftRecord` bridge/support reading 유지, 그리고 `same-root dual-shape -> same-id duplicate precedence -> profile/drafts list exposure` memo chain이 현재 draft-family 범위의 stop line이라는 점이다.
- draft-family 범위의 current smallest viable next candidate는 현재 `none for now`다. 더 이상 draft-family 내부 micro docs-first cut을 남기지 않고, current next question도 trigger-specific reopen이 실제로 생겼는지 여부로 바꾼다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, draft route 추가/삭제, preview/preflight 계산식, stable `/planning*` route contract, beta `/planning/v3/*` visibility policy, `N2` API/import-export/rollback 구현이다.
- future reopen trigger는 `N2` import-export/rollback contract question, beta visibility/anomaly handling policy question, route contract나 list/detail semantics를 실제로 바꾸는 요구로만 둔다.

연결 메모 (2026-03-25 N1 remaining-boundary reselection audit):
- draft-family는 current memo chain 기준 `none for now`로 parked 상태를 유지한다. stable `/planning*`와 beta `/planning/v3/*` route SSOT도 이 closeout 상태와 충돌하지 않는다.
- current `N1` remaining boundary는 사실상 `ImportBatch / TransactionRecord` read ownership question 하나에 수렴한다. `src/lib/planning/v3/store/batchesStore.ts`는 stored batch meta + stored transaction persistence writer owner로 읽히지만, `/api/planning/v3/batches`, `/api/planning/v3/batches/[id]/summary`, `/api/planning/v3/transactions/batches/[id]`, `/api/planning/v3/balances/monthly`, `getBatchSummary.ts`, `generateDraftPatchFromBatch.ts`는 여전히 stored-first reader facade와 legacy/coexistence bridge를 함께 소비한다.
- `NewsAlertRuleOverride`는 owner 구현 확인까지는 끝났고, 남은 question은 default config / override document / generated alert event state를 export/rollback 단위로 어디까지 묶을지라는 `N2` contract question이다.
- broad rewrite 없이 docs-first로 안정적으로 분리 가능한 current smallest viable next `N1` candidate는 `ImportBatch / TransactionRecord stored-first read owner vs legacy bridge memo`다. draft-family anomaly policy나 news export/rollback grouping은 현재 `N2` 또는 trigger-specific reopen으로 defer하는 편이 맞다.

연결 메모 (2026-03-25 ImportBatch / TransactionRecord stored-first read owner vs legacy bridge memo audit):
- `src/lib/planning/v3/store/batchesStore.ts`는 current stored writer owner로 읽는 편이 맞다. `index.json` 기반 `ImportBatchMeta`와 `<batchId>.ndjson` stored transaction snapshot persistence를 직접 소유하지만, public read semantics 자체를 결정하지는 않는다.
- `src/lib/planning/v3/service/transactionStore.ts`는 current code 기준 pure stored-first reader owner가 아니라 legacy NDJSON bridge/compat layer에 가깝다. `listBatches()`, `readBatch()`, `readBatchTransactions()`, `updateBatchAccount()` 같은 legacy path를 계속 소유한다.
- current read-owner split의 핵심은 `src/lib/planning/v3/transactions/store.ts`다. 이 entrypoint가 `loadStoredFirstBatchTransactions()`, `buildStoredFirstVisibleBatchShell()`, `getStoredFirstBatchSummaryProjectionRows()`, `applyStoredFirstBatchAccountBinding()`로 stored-first reader facade를 제공하면서, synthetic stored-only discovery와 explicit legacy fallback, command surface guard도 함께 품는다.
- `getBatchSummary.ts`, `generateDraftPatchFromBatch.ts`, `/api/planning/v3/batches`, `/api/planning/v3/batches/[id]/summary`, `/api/planning/v3/transactions/batches/[id]`, `/api/planning/v3/balances/monthly`는 이 stored-first reader facade를 route meaning별 projection consumer로 읽는 편이 맞다. current unresolved question은 writer owner 재정의가 아니라 mixed read layer와 dual list surface를 문서상 어떻게 wording split할지다.
- current smallest viable next `N1` candidate는 broad batch-family rewrite가 아니라 `batch list dual-surface route meaning memo`다.

연결 메모 (2026-03-25 batch-list dual-surface route-meaning memo audit):
- `/api/planning/v3/batches`와 `/api/planning/v3/transactions/batches`는 같은 merged candidate set(`legacy-derived` + stored/synthetic row)을 읽지만, 같은 public contract로 읽으면 안 된다.
- `/api/planning/v3/batches`는 `BatchesCenterClient`가 읽는 batch-center summary row surface다. 응답 `data`는 `{ batchId, createdAt?, stats? }` shape를 쓰고, hidden public `createdAt`는 omission boundary로 남는다.
- `/api/planning/v3/transactions/batches`는 `TransactionsBatchListClient`가 읽는 transaction batch list surface이면서, `BalancesClient`가 읽는 batch-picker support surface를 함께 품는다. `items`는 legacy-style batch row + string `createdAt` contract를 유지하고, `data`도 picker/meta consumer를 위해 같은 string `createdAt` downgrade를 쓴다.
- current unresolved question은 read owner 재정의가 아니라 dual list surface와 `/api/planning/v3/transactions/batches` 내부 `items`/`data` compat payload meaning을 어떻게 더 좁게 wording split할지다. current smallest viable next `N1` candidate는 `transactions/batches items-vs-data compat payload memo`다.

연결 메모 (2026-03-25 transactions/batches items-vs-data compat-payload memo audit):
- `/api/planning/v3/transactions/batches`의 `items`는 current code 기준 `TransactionsBatchListClient`가 직접 읽는 primary list contract다. `id`, string `createdAt`, `kind`, `fileName?`, `total`, `ok`, `failed`를 유지하며 transaction batch list/history surface를 우선 지원한다.
- 같은 route의 `data`는 current code 기준 `BalancesClient`가 batch picker용으로 읽는 support/meta contract다. `toStoredFirstPublicImportBatchMeta()` 기반 row에 string `createdAt`를 붙인 compat payload로, `rowCount`, `ymMin`, `ymMax` 같은 picker/meta field를 제공한다.
- 두 payload 모두 `getStoredFirstPublicCreatedAtString()`을 써서 hidden public `createdAt`를 `""`로 downgrade하지만, helper를 공유한다고 해서 같은 tier의 duplicate payload는 아니다. 하나는 active list contract, 다른 하나는 batch-picker support/meta contract다.
- current unresolved question은 API shape 변경이나 route 재편이 아니라 compat payload tier wording split을 문서상 어떻게 잠글지였고, current code 기준 이 범위의 current smallest viable next `N1` candidate는 `none for now`다. 남은 compat artifact(`nextCursor` 등)는 active consumer가 확인되지 않아 trigger-specific reopen이 생길 때 다시 여는 편이 맞다.

연결 메모 (2026-03-25 N1 remaining-boundary none-for-now closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 draft-family가 이미 `none for now`이고, `ImportBatch / TransactionRecord` current read-owner memo chain도 current active consumer 기준 `none for now`라는 점이다. stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 stop line과 충돌하지 않는다.
- `/api/planning/v3/transactions/batches`의 `items`는 active list contract, `data`는 batch-picker support/meta contract로 current code 기준 충분히 분리됐다. current next question은 더 이상 `N1` 내부 micro memo가 아니라 trigger-specific reopen 또는 `N2` 공식 contract question이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, route 추가/삭제, API shape, writer owner, legacy bridge 제거 구현, beta visibility policy, `N2` API / import-export / rollback 구현이다.
- future reopen trigger는 `N2` import-export / rollback contract question, dormant compat artifact(`nextCursor` 등)에 active consumer가 생기는 경우, `items` / `data`를 co-primary public contract로 다시 읽어야 하는 요구, route/list/detail semantics를 실제로 바꾸는 요구로만 둔다.

## N2. planning/v3 API / import-export / rollback contract 정의

- 분류: `contract-first`
- 목적:
  v3의 input/output contract와 import/export, rollback/repair, permission/visibility rule을 canonical entity 위에서 다시 고정한다.
- 왜 지금 필요한가:
  storage owner가 고정되지 않으면 API와 import/export가 화면 단위로 흩어지고, rollback/repair 정책도 route마다 달라질 위험이 크다.
- 선행 조건:
  - `N1` canonical entity model
- 구현 전에 먼저 필요한 문서/계약:
  - route별 request/response contract 초안
  - import batch / draft / apply / preview 흐름 구분
  - rollback / repair / trash / restore ownership 규칙
- 완료 기준:
  - v3 주요 route의 contract 초안이 문서로 고정됨
  - import-export와 rollback/repair rule이 화면이 아니라 owner 기준으로 정리됨
  - permission/visibility rule이 stable/beta/internal 분류와 연결됨

연결 메모 (2026-03-17):
- owner-based route inventory와 import/export/rollback 경계는 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`를 기준으로 잠급니다.
- read/projection route는 canonical export owner나 rollback owner로 승격하지 않습니다.
- `N3`, `N4`는 이 문서의 owner family 분류와 visibility 전제조건을 그대로 재사용합니다.

연결 메모 (2026-03-19 mixed ownership narrowing):
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`에 batch family, draft family, legacy override bridge의 `reader facade / writer owner / legacy bridge` 구분을 추가했다.
- 후속 `N2` 구현은 broad rewrite 대신 `batch read owner narrowing`, `draft family facade split`, `legacy override bridge containment` 3개 cut으로 끊어 진행한다.

연결 메모 (2026-03-21 batch command surface sync):
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `3.2 ImportBatch / TransactionRecord`는 synthetic stored-only discover/read, same-id coexistence guard, pure legacy delete boundary, legacy account writer 유지 상태까지 코드 기준으로 동기화됐다.
- batch command surface의 explicit guard 문서화는 끝났지만, canonical writer merge, stored meta write-back, legacy write contract 확장은 여전히 후속 `N2` 범위다.

연결 메모 (2026-03-22 stored-first account binding read sync):
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `3.2 ImportBatch / TransactionRecord`는 detail shell, detail derived projection, `cashflow`, `getBatchSummary.ts`의 stored-first account binding read contract까지 코드 기준으로 동기화됐다.
- 같은 문서는 `categorized`, `transfers`, `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch.ts`의 stored-first visible binding parity까지 코드 기준으로 동기화됐다.
- same-id coexistence writer merge, row rewrite, index repair는 여전히 후속 `N2` 범위다.

연결 메모 (2026-03-22 coexistence rollback ordering contract):
- same-id stored-meta + legacy coexistence의 다음 cut은 mirror write bootstrap이 아니라 `stored -> legacy` 후보를 전제로 한 rollback ordering contract 고정이다.
- 두 owner write와 1차 rollback ordering이 닫히기 전에는 `/api/planning/v3/transactions/batches/[id]/account` success semantics를 다시 열지 않는다.

연결 메모 (2026-03-22 legacy append verification audit):
- legacy `append-write` post-write verification helper bootstrap은 열렸고, `classifySameIdCoexistencePostWriteFailure()` worker까지 추가됐지만 same-id coexistence mirror write는 여전히 그 worker를 실제 secondary failure path에 연결하기 전까지 열지 않는다.
- `batches.ndjson` append 실패 뒤 `parsed-row-committed`, `malformed-tail`, `no-committed-row-observed`를 구분하고 `repair-required`/`rollback-recovery-unproven`을 계산할 수 있게 됐지만, complete no-write proof와 repair flow는 아직 후속 `N2` 범위다.

연결 메모 (2026-03-22 rollback-recovery-unproven operator flow contract):
- next cut은 route integration보다 `repair-required`와 `rollback-recovery-unproven`의 operator/manual repair contract 정리다.
- future mirror write는 operator evidence checklist와 user-facing `INTERNAL` failure 원칙이 닫히기 전까지 열지 않는다.

연결 메모 (2026-03-22 operator evidence snapshot helper bootstrap):
- `buildSameIdCoexistenceOperatorEvidenceSnapshot()` bootstrap은 열렸지만, same-id coexistence mirror write는 여전히 이 snapshot을 실제 route-local worker와 operator flow에 연결하기 전까지 열지 않는다.
- internal snapshot은 outcome/reason/rollback flags/legacy verification summary까지만 모으고, raw NDJSON line이나 filesystem path는 user-facing payload에 싣지 않는다.

연결 메모 (2026-03-22 secondary failure route-local worker bootstrap):
- `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()` bootstrap은 열렸지만, current `/account` route는 여전히 guard 상태로 유지하고 same-id coexistence success semantics는 열지 않는다.
- 다음 cut은 route integration 여부가 아니라 이 worker가 남기는 internal payload를 어떤 operator/manual repair 흐름과 묶을지 더 좁히는 일이다.

연결 메모 (2026-03-22 stored current binding evidence helper bootstrap):
- `readStoredCurrentBatchBindingEvidence()` bootstrap이 열려 route-local worker가 stored meta current binding summary를 자동 수집할 수 있게 됐지만, complete pre-write snapshot compare는 여전히 후속 `N2` 범위다.
- same-id coexistence mirror write는 current binding summary 자동 수집만으로 열지 않고, pre-write/current compare contract가 더 닫히기 전까지 guard 상태를 유지한다.

연결 메모 (2026-03-22 stored pre-write snapshot compare helper bootstrap):
- `compareStoredPreWriteSnapshotToCurrentBinding()` bootstrap이 열려 stored pre-write snapshot `accountId`와 current stored binding summary를 비교할 수 있게 됐지만, complete no-write proof와 operator repair closeout은 여전히 별도 후속 범위다.
- same-id coexistence mirror write는 stored-side compare helper만으로 열지 않고, legacy append verification과 operator flow contract가 계속 함께 닫혀야 한다.

연결 메모 (2026-03-22 mirror-write route integration audit):
- current `/api/planning/v3/transactions/batches/[id]/account` coexistence branch는 여전히 explicit guard로 남고, helper stack은 실제 write sequence input이 생긴 secondary failure branch에서만 재사용된다.
- 다음 cut은 success semantics를 곧바로 여는 것이 아니라, `stored -> legacy` route-local sequencing wrapper를 어디서 어떻게 붙일지 닫는 일이다.

연결 메모 (2026-03-22 writes-completed success contract audit):
- `writes-completed`는 아직 user-facing success proof가 아니라 success candidate로만 남고, post-write stored-first reader verification 전까지 `/account` coexistence success는 다시 열지 않는다.
- 다음 cut은 direct success opening이 아니라 `loadStoredFirstBatchTransactions()` 기반 visible binding verification step을 어디에 붙일지 닫는 일이다.

연결 메모 (2026-03-22 detail failed/fileName fallback audit):
- `/api/planning/v3/transactions/batches/[id]` detail route의 `batch.failed`, `stats.failed`, `fileName`은 이제 `stored importMetadata -> legacy summary fallback` 순서로 좁혀졌고, `stats.failed`는 계속 `batch.failed` alias다.
- 다음 `N2` cut은 owner bootstrap이 아니라, `pure legacy`와 `old stored meta without importMetadata`에 남은 legacy fallback retirement boundary를 어디까지 좁힐지 정하는 일이다.
- 이때 `old stored meta without importMetadata`는 backfill/migration 또는 helper-owned explicit bridge retention 문제로, `pure legacy`는 detail compat surface/visibility retirement 문제로 분리해 다뤄야 한다.

연결 메모 (2026-03-22 stored import diagnostics/provenance owner contract audit):
- stored import command -> batch metadata owner bootstrap은 닫혔고, `ImportBatchMeta.importMetadata`가 `failed`용 diagnostics summary와 `fileName` provenance를 persisted source-of-truth로 가진다.
- 다음 `N2` cut은 broad fallback 제거가 아니라, 이 stored owner를 읽지 못하는 historical batch class에 대해 backfill/migration/explicit bridge retention 중 무엇을 선택할지 좁게 판단하는 일이다.
- 바로 다음 docs-first audit은 `N2 old stored meta importMetadata gap retention-backfill contract audit`이고, pure legacy retirement 결정은 별도 후속으로 남긴다.

연결 메모 (2026-03-23 hybrid retained fileName compat bridge audit):
- 다음 `N2` cut은 pure legacy retirement가 아니라 `hybrid-legacy-summary-retained` class에서 stored diagnostics owner는 유지한 채 blank `provenance.fileName`에만 남는 helper-owned compat bridge proof를 좁히는 일이다.
- metadata-only provenance backfill은 trusted provenance source와 migration 완료 사실이 닫히기 전까지 열지 않는다.

연결 메모 (2026-03-23 hybrid retained fileName compat bridge retirement-proof audit):
- 다음 `N2` cut은 backfill 구현이 아니라 hybrid retained blank provenance subset 중 실제 visible compat bridge가 남는 subset과 no-visible-bridge subset을 먼저 가르는 retirement-proof audit이다.
- explicit stored marker 없이 provenance origin을 구분할 수 없으므로, metadata-only backfill과 broad fallback 제거는 이 subset boundary가 더 닫히기 전까지 열지 않는다.

연결 메모 (2026-03-23 hybrid retained visible fileName bridge provenance-origin proof audit):
- 다음 `N2` cut은 fallback 제거가 아니라 visible `fileName` compat bridge subset 안에서 blank stored provenance origin을 current evidence boundary로 잠그는 audit이다.
- stored marker 없이 normal optional omission과 historical handoff gap을 runtime에서 가를 수 없으므로, provenance-only backfill과 bridge retirement 구현은 provenance-origin proof가 더 닫히기 전까지 보류한다.

연결 메모 (2026-03-23 provenance-origin metadata-only marker audit):
- 다음 `N2` cut은 provenance backfill 구현이 아니라, batch-level stored metadata에 marker-aware omission/provided 상태를 남길 최소 marker contract를 좁히는 metadata-only marker audit이다.
- marker-aware omission subset과 unresolved historical no-marker subset을 더 가르기 전까지, provenance-only backfill과 `fileName` bridge retirement 구현은 계속 보류한다.

연결 메모 (2026-03-23 fileNameProvided blank-vs-omission semantic split audit):
- current recommendation은 `fileNameProvided=false`를 omitted + blank-normalized canonical class로 유지하고, concrete operator requirement 없이는 split marker 확장을 열지 않는 것이다.
- historical no-marker subset proof와 blank-vs-omission semantic split은 다른 질문이므로, provenance backfill과 fallback 제거는 semantic split alone으로 재개하지 않는다.

연결 메모 (2026-03-23 historical no-marker subset provenance evidence inventory audit):
- current helper stack은 `classifyHistoricalNoMarkerProvenanceEvidence()`와 `hasHistoricalNoMarkerVisibleFileNameCompatBridge()`까지 닫혀, `marker-missing-but-otherwise-stable`와 `origin-fundamentally-unresolved`를 read-only로 구분하고 visible `fileName` debt도 `origin-fundamentally-unresolved + legacy batch.fileName present` subset으로 더 좁혀졌다.
- current design memo, spike closeout, post-bootstrap sync는 `legacy batch.sha256 + row sourceInfo.sha256`를 maybe-promotable candidate로 남기되, append/merge/wider legacy carry surface는 explicit no-source closeout으로 분리하고, new write subset에는 `importMetadata.sourceBinding` slot을 `artifactSha256 + attestedFileName + originKind: "writer-handoff"` shape로만 좁게 bootstrap한 상태다.
- current reader/helper stack은 `sourceBinding`을 public/visible contract에 쓰지 않고 internal read-only proof candidate로만 남겨 두며, `hasStoredFirstReadOnlySourceBindingCandidate()` helper까지 bootstrap된 상태다.
- current docs memo는 `sourceBinding` false side를 `present-but-incomplete`와 `candidate-absent`로 inventory해 두되, 이것을 아직 runtime enum/classifier로 승격하지는 않는다.
- latest closeout 기준으로는 false-side split을 실제로 소비하는 helper-owned internal consumer surface도 current codebase 안에서 재확인되지 않았고, current runtime에서 이 distinction을 아는 곳은 tests/docs뿐이다.
- future trigger audit 기준으로도 classifier 재오픈은 helper-owned internal audit/debug surface가 `present-but-incomplete`에 별도 internal consequence를 요구할 때만 정당화되며, docs/tests inventory 추가나 existing boolean helper 재사용만으로는 아직 reopen trigger가 아니다.
- next `N2` cut이 다시 열리더라도 classifier 구현이 아니라, trigger X가 실제로 생겼는지 재확인한 뒤 internal-only read classifier 필요성을 다시 묻는 좁은 cut으로 간다.

연결 메모 (2026-03-25 N2 API/import-export/rollback current-state resync audit):
- `3.2 ImportBatch / TransactionRecord` current-state로 이미 닫힌 boundary는 stored writer owner, stored-first reader facade, legacy bridge, dual-surface route meaning, `/api/planning/v3/transactions/batches`의 `items` vs `data` compat payload tier, `sourceBinding` present subset no-current-consumer surface, historical no-marker / hybrid retained `fileName` helper boundary다.
- current code 기준 `/api/planning/v3/transactions/batches/[id]/account` same-id stored-meta + legacy surface는 더 이상 pure guard가 아니다. route-local `stored -> legacy` sequence, post-write visible binding verification, reloaded stored-first success shell이 이미 연결돼 있고, `secondary-failure`와 `visible-verification-failed`만 generic `INTERNAL` failure로 user-facing 노출된다.
- stale section은 2026-03-22 backlog 메모 중 same-id coexistence `/account`를 explicit guard로 읽는 문구와 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md` current summary 한 줄 정도로 좁혀진다. 반면 `sourceBinding` future internal consumer, operator/manual repair의 user-facing flow는 여전히 `[검증 필요]` 또는 parked 범위다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 resync 판단과 충돌하지 않는다. current smallest viable next `N2` candidate는 broad 구현이 아니라 `ImportBatch / TransactionRecord current-state closeout docs-only sync`다.

연결 메모 (2026-03-25 ImportBatch / TransactionRecord current-state closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 stored writer owner / stored-first reader facade / legacy bridge 분리, batch list dual-surface route meaning, `/api/planning/v3/transactions/batches`의 `items` vs `data` compat payload tier 분리, `sourceBinding` present subset no-current-consumer 상태, historical no-marker / hybrid retained visible `fileName` helper-owned boundary, `/api/planning/v3/transactions/batches/[id]/account`의 route-local sequencing + verified success / generic `INTERNAL` failure split이 현재 `3.2` stop line이라는 점이다.
- 2026-03-22 same-id coexistence guard 계열 메모는 current contract가 아니라 pre-route-integration history로 읽어야 한다. stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다.
- current next question은 더 이상 `3.2` 내부 micro memo가 아니다. `3.2` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 또는 다음 `N2` 공식 contract question으로만 넘긴다.
- future reopen trigger는 export 가능 단위 / rollback-repair 단위 / route response semantics를 실제로 바꾸는 `N2` 공식 question, `sourceBinding` false-side를 실제로 소비하는 internal audit/debug consumer 등장, operator/manual repair의 user-facing flow 요구, dormant compat artifact나 list/detail semantics를 다시 public contract로 다뤄야 하는 요구로만 둔다.

연결 메모 (2026-03-25 post-3.2 remaining-family reselection audit):
- `3.2 ImportBatch / TransactionRecord`는 current-state closeout 이후 `none for now`로 park한다. post-3.2 기준 remaining family는 `3.3 override family`, `3.4 draft family / applied profile boundary`, `3.5 NewsSettings / AlertRule / Exposure / Scenario library`로 다시 읽는다.
- `3.4`는 `N1` draft-family memo chain과 현재 code snapshot이 apply route의 stable profile bridge 경계, `/api/planning/v3/drafts/[id]/create-profile`의 parked compat status, support/internal draft route tier를 이미 비교적 좁게 잠그고 있어, post-3.2 기준 current smallest official `N2` cut으로 다시 고르지는 않는다.
- `3.5`는 `NewsAlertRuleOverride` owner 구현 확인 이후에도 export/rollback grouping과 singleton config family wrapper divergence를 같이 다뤄야 해서 current code 기준으로는 `3.3`보다 큰 질문으로 남는다. 반면 `3.3`은 current mixed ownership snapshot이 stale하다. batch-scoped writer surface가 `txnOverridesStore.ts` 하나가 아니라 `accountMappingOverridesStore.ts`, `txnTransferOverridesStore.ts`까지 포함되고, dev-only `/api/planning/v3/transactions/overrides`를 public canonical read facade로 읽으면 안 된다는 경계가 current code에서 다시 확인된다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 reselection 판단과 충돌하지 않는다. `docs/current-screens.md`의 beta inventory에는 `/planning/v3/profile/drafts`, `/planning/v3/exposure`, `/planning/v3/news/settings`, `/planning/v3/transactions/batches*`가 있고, dev-only override route는 여전히 inventory 밖이다.
- current smallest viable next `N2` candidate는 broad 구현이 아니라 `3.3 override family current-state resync / batch-scoped owner vs legacy unscoped bridge containment`이다. 비범위는 writer owner 변경, route 추가/삭제, API shape 변경, legacy bridge 제거 구현, `N2` 본작업, stable/public IA 재편, beta visibility policy 변경이다.

연결 메모 (2026-03-25 override-family current-state resync audit):
- `3.3 override family` current-state boundary는 `CategoryRule` owner + 세 batch-scoped override owner(`TxnOverride`, `AccountMappingOverride`, `TxnTransferOverride`) + `txnOverridesStore.ts` 안의 legacy unscoped compat bridge로 다시 읽는 편이 current code와 맞다.
- `/api/planning/v3/transactions/overrides`는 `onlyDev()` + localhost guard 아래에서 batch-scoped와 legacy-unscoped를 같이 다루는 support/internal route다. public canonical read facade나 stable public contract 기준으로 읽으면 안 된다.
- `getBatchSummary.ts`, `generateDraftPatchFromBatch.ts`, `/api/planning/v3/transactions/batches/[id]/categorized`, `/cashflow`, `/transfers`, `/api/planning/v3/balances/monthly`는 세 override store와 `CategoryRule`을 함께 읽는 multi-owner projection stack이다. current unresolved question은 override precedence 재설계가 아니라 mixed ownership snapshot wording resync다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 resync 판단과 충돌하지 않는다. current smallest viable next `N2` candidate는 broad 구현이 아니라 `override-family current-state closeout docs-only sync`다.

연결 메모 (2026-03-25 override-family current-state closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 `CategoryRule` owner + 세 batch-scoped override owner(`TxnOverride`, `AccountMappingOverride`, `TxnTransferOverride`) + `txnOverridesStore.ts` 안의 legacy unscoped compat bridge 구분, `/api/planning/v3/transactions/overrides`의 dev-only support/internal route tier, `getBatchSummary.ts` / `generateDraftPatchFromBatch.ts` / `/categorized` / `/cashflow` / `/transfers` / `/balances/monthly`의 multi-owner projection stack이라는 현재 stop line이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, override precedence 재설계, category semantics 확장, route 추가/삭제, API shape 변경, legacy bridge 제거 구현, `3.4`/`3.5` 재개, `N2` 본작업, stable/public IA 재편, beta visibility policy 변경이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다. current next question은 더 이상 `3.3` 내부 wording resync가 아니다. `3.3` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 또는 다음 `N2` 공식 contract question으로만 넘긴다.
- future reopen trigger는 override precedence나 export/rollback unit을 실제로 바꾸는 `N2` 공식 question, dev-only bridge route를 public/beta contract로 다시 읽어야 하는 요구, route response semantics나 API shape를 실제로 바꾸는 요구, legacy bridge 제거/수선 flow 구현 요구로만 둔다.

연결 메모 (2026-03-25 post-3.3 remaining-family reselection audit):
- `3.2 ImportBatch / TransactionRecord`와 `3.3 override family`는 current-state closeout 이후 `none for now`로 park한다. post-`3.3` 기준 remaining family는 `3.4 Draft family / applied profile boundary`와 `3.5 NewsSettings / AlertRule / Exposure / Scenario library`로 다시 읽는다.
- `3.4`는 current code 기준으로 writer owner split, shared facade, `/api/planning/v3/profile/drafts/[id]/apply`의 stable profile bridge boundary, `/api/planning/v3/drafts/[id]/create-profile`의 parked compat status, support/internal draft route tier가 이미 비교적 좁게 정렬돼 있다. `docs/current-screens.md`에도 beta inventory는 `/planning/v3/profile/drafts*`만 남고 support/internal draft routes는 user inventory 밖이라, broad rewrite 없이 family-level closeout으로 바로 이어질 수 있다.
- `3.5`는 `NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile`, `ScenarioLibraryOverrides` export/rollback grouping, `news/exposure` vs `exposure/profile` wrapper divergence, singleton config family contract를 함께 다뤄야 해서 current code 기준으로는 `3.4`보다 더 큰 질문으로 남는다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 reselection 판단과 충돌하지 않는다. current smallest viable next `N2` candidate는 broad 구현이 아니라 `3.4 draft family / applied profile boundary current-state closeout docs-only sync`다. 비범위는 구현 코드 변경, route 추가/삭제, API shape 변경, precedence 재설계, legacy bridge 제거 구현, `N2` 본작업, stable/public IA 재편, beta visibility policy 변경이다.

연결 메모 (2026-03-25 draft-family / applied-profile boundary current-state closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 `CsvDraftRecord (DraftV1)` / `DraftProfileRecord` writer owner split, `src/lib/planning/v3/draft/store.ts` shared facade tier, `/api/planning/v3/profile/drafts/[id]/apply`의 stable profile bridge boundary, `/api/planning/v3/drafts/[id]/create-profile`의 parked `EXPORT_ONLY` compat route 상태, `/api/planning/v3/draft/*` / `/profile/draft` / `/profile/drafts/[id]/preflight`의 support/internal tier, `/api/planning/v3/profiles`의 stable profile owner bridge 성격이라는 현재 stop line이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, draft apply result schema 재설계, preview/preflight 계산식 변경, route 추가/삭제, API shape 변경, legacy bridge 제거 구현, `3.5` 재개, `N2` 본작업, stable/public IA 재편, beta visibility policy 변경이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다. current next question은 더 이상 `3.4` 내부 wording resync가 아니다. `3.4` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 또는 다음 `N2` 공식 contract question으로만 넘긴다.
- future reopen trigger는 draft owner와 stable profile owner 사이 export/rollback unit을 실제로 바꾸는 `N2` 공식 question, parked compat route 활성화 요구, support/internal draft route를 public/beta contract로 올리는 요구, route response semantics나 API shape를 실제로 바꾸는 요구로만 둔다.

연결 메모 (2026-03-25 singleton-config-family current-state resync audit):
- `3.5 singleton config family` current-state boundary는 `NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile`, `ScenarioLibraryOverrides` 네 owner family와 `/api/planning/v3/news/settings`, `/news/alerts/rules`, `/news/exposure`, `/exposure/profile`, `/scenarios/library` 다섯 route의 command/read split으로 다시 읽는 편이 current code와 맞다.
- `/api/planning/v3/news/exposure`와 `/api/planning/v3/exposure/profile`은 같은 `ExposureProfile` owner family를 읽고 쓰지만 wrapper는 각각 `{ ok, data }`, `{ ok, profile }`로 다르다. current code 기준 이 차이는 compat divergence이며, 별도 owner family나 별도 export/rollback unit으로 읽지 않는다.
- `/api/planning/v3/news/digest`, `/news/items`, `/news/search`, `/news/today`, `/news/trends`, `/news/scenarios`는 singleton config owner를 참고하는 projection/read model tier이고, `/api/planning/v3/news/alerts`, `/news/notes`, `/news/recovery`, `/news/sources`, `/news/refresh`, `/news/weekly-plan`은 alert state, notes, repair/import helper, refresh, weekly-plan artifact를 다루는 support/internal tier다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 resync 판단과 충돌하지 않는다. current smallest viable next `N2` candidate는 broad 구현이 아니라 `singleton-config-family current-state closeout docs-only sync`다. 비범위는 실제 구현 코드 변경, singleton config family 재설계, route 추가/삭제, API shape 변경, wrapper shape 통합 구현, `N2` 본작업, stable/public IA 재편, beta visibility policy 변경이다.

연결 메모 (2026-03-25 singleton-config-family current-state closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 `NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile`, `ScenarioLibraryOverrides` 네 owner family, `/api/planning/v3/news/settings` / `/news/alerts/rules` / `/news/exposure` / `/exposure/profile` / `/scenarios/library`의 command/read owner route tier, `/api/planning/v3/news/digest` / `/news/items` / `/news/search` / `/news/today` / `/news/trends` / `/news/scenarios`의 projection/read model tier, `/api/planning/v3/news/alerts` / `/news/notes` / `/news/recovery` / `/news/sources` / `/news/refresh` / `/news/weekly-plan`의 support/internal tier, 그리고 `news/exposure`와 `exposure/profile` wrapper divergence를 compat divergence로만 남기는 현재 stop line이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, `3.2` / `3.3` / `3.4` closeout 재오픈, singleton config family 재설계, route 추가/삭제, API shape 변경, wrapper shape 통합 구현, export/rollback grouping 구현, `N2` 본작업, stable/public IA 재편, beta visibility policy 변경이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다. current next question은 더 이상 `3.5` 내부 wording resync가 아니다. `3.5` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 확인 또는 `N2` 종료 판단으로만 넘긴다.
- future reopen trigger는 singleton config owner export/rollback grouping을 실제로 바꾸는 `N2` 공식 question, wrapper semantics 통합 요구, `/api/planning/v3/news/sources`나 `/api/planning/v3/news/weekly-plan` 승격 요구, route response semantics나 API shape를 실제로 바꾸는 요구로만 둔다.

연결 메모 (2026-03-25 N2 contract-family none-for-now closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 `3.2 ImportBatch / TransactionRecord`, `3.3 CategoryRule / override family`, `3.4 Draft family / applied profile boundary`, `3.5 NewsSettings / AlertRule / Exposure / Scenario library`가 모두 current-state closeout 이후 family 내부 micro docs-first cut 기준으로는 현재 `none for now`라는 점이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, route 추가/삭제, API shape 변경, writer owner 변경, legacy bridge 제거 구현, wrapper shape 통합 구현, export/rollback grouping 구현, stable/public IA 재편, beta visibility policy 변경이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 family-level closeout 상태와 충돌하지 않는다. current next question은 더 이상 `N2` 내부 새 family audit이 아니라 trigger-specific reopen 확인 또는 다음 공식 축(`N3`) 판단이다.
- future reopen trigger는 export/rollback unit을 실제로 바꾸는 `N2` 공식 question, route response semantics나 API shape를 실제로 바꾸는 요구, dormant compat surface를 public/beta contract로 승격해야 하는 요구, support/internal route를 owner/public tier로 올려야 하는 요구로만 둔다.

연결 메모 (2026-03-25 N2 none-for-now closeout handoff-to-N3 docs-only sync):
- 이번 handoff에서 확정하는 것은 `3.2` / `3.3` / `3.4` / `3.5` family-level current-state memo chain이 모두 current micro docs-first cut 기준으로는 `none for now`라는 점과, `N2` closeout이 구현 완료 선언이 아니라는 점이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 handoff 상태와 충돌하지 않는다. current next recommendation은 `N2` 내부 새 family audit이 아니라 trigger-specific reopen 확인 또는 다음 공식 축 `N3 QA gate / golden dataset`의 current-state read / parked baseline 점검이다.
- future reopen trigger는 export/rollback unit을 실제로 바꾸는 `N2` 공식 question, route response semantics나 API shape를 실제로 바꾸는 요구, dormant compat surface 승격 요구, support/internal route를 owner/public tier로 올려야 하는 요구로만 둔다.


## N3. QA gate 재정의와 golden dataset 기준 정리

- 분류: `ops/QA gate`
- 목적:
  `public stable`, `public beta`, `ops/dev`를 같은 검증 세트로 보지 않고, 다음 사이클용 release gate와 regression gate를 다시 정의한다.
- 왜 지금 필요한가:
  현재 검증 자산은 풍부하지만, 다음 사이클에서는 `planning/v3`의 beta exposure와 stable surface를 다른 기준으로 다뤄야 한다.
- 선행 조건:
  - `N1` canonical entity model
  - `N2` API / import-export / rollback contract 초안
- 구현 전에 먼저 필요한 문서/계약:
  - route policy별 검증 레벨
  - golden dataset 범위
  - stable/beta release check 분리 원칙
- 완료 기준:
  - `public stable / beta / ops-dev`별 최소 gate가 문서로 고정됨
  - golden dataset이 어떤 contract를 검증하는지 연결됨
  - release 전에 어떤 세트를 반드시 통과해야 하는지 정의됨

연결 메모 (2026-03-17):
- gate tier, required/advisory command set, golden dataset category는 `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`를 기준으로 잠급니다.
- stable / beta / ops-dev는 같은 검증 세트로 다루지 않습니다.
- `N4` visibility policy는 이 문서의 gate tier와 route policy 연결 규칙을 그대로 재사용합니다.

연결 메모 (2026-03-23 QA gate stable-beta-dev boundary audit):
- current route SSOT는 `docs/current-screens.md`의 `Public Stable`, `Public Beta`, `Local-only Ops`, `Dev/Debug` 분류를 기준으로 두고, N3 gate memo에서는 뒤의 두 class를 production 비노출/non-public `ops/dev` gate class로 묶어 다룬다. route class의 SSOT는 계속 `docs/current-screens.md`이고, class별 gate matrix와 golden dataset SSOT는 현재 `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`다.
- class별 최소 gate 후보는 다음처럼 좁힌다.
- `public stable`: `pnpm build` + `pnpm test`를 기본으로 두고, client/page/hook 영향이 있으면 `pnpm lint`, stable user flow/selector/navigation 또는 release candidate cut이면 `pnpm e2e:rc`, public route class나 `docs/current-screens.md`가 바뀌면 `pnpm planning:current-screens:guard`를 붙인다.
- `public beta`: `pnpm build` + touched-surface `pnpm test`를 기본으로 두고, client/page/hook 영향이 있으면 `pnpm lint`, beta/public class 분류나 `docs/current-screens.md`가 바뀌면 `pnpm planning:current-screens:guard`를 붙인다. stable-wide `pnpm e2e:rc`는 beta surface가 stable navigation/shared selector flow에 편입될 때만 reopen한다. [검증 필요]
- `ops/dev`: non-public local/runtime surface이므로 blanket release gate 대신 touched-surface `pnpm test`/`pnpm lint`/`pnpm build`만 선택하고, hidden route class 문서가 바뀔 때만 `pnpm planning:current-screens:guard`를 붙인다. current docs 기준으로는 automatic `pnpm e2e:rc` release requirement를 두지 않는다.
- release gate와 regression gate는 분리한다. release gate는 current `Public Stable` surface와 route SSOT 보전에 묶고, beta/ops-dev regression은 해당 surface에 국한된 targeted gate로 남겨 stable release blocker와 분리한다.
- `package.json`의 current `e2e:rc`는 smoke, planner-history, report, news settings, dart, data-source flow 중심이라 stable/public surface bias가 강하다. 이 세트를 그대로 `planning/v3` beta나 ops/dev release gate로 재사용하면 stable under-test와 beta under-test가 뒤섞인다.
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`는 현재 gate tier, command role table, `public stable / beta / ops/dev` matrix, golden dataset category, `N4` handoff 전제조건까지 이미 채운 N3 gate matrix SSOT다.
- smallest safe next cut은 broad gate implementation이 아니라, `14` 문서의 residual gap이 실제로 남았는지 한 번 더 audit한 뒤 `N4 visibility policy`로 넘길지 결정하는 좁은 sync/audit이다. current backlog 기준으로는 "14를 채운다"가 아니라 "14를 SSOT로 둔 채 N4로 넘길 준비가 되었는지 확인한다"로 읽는 쪽이 더 정확하다.

연결 메모 (2026-03-25 QA-gate-and-golden-dataset current-state resync audit):
- `docs/current-screens.md`의 `Public Stable` / `Public Beta` / `Local-only Ops` / `Dev/Debug` 분류는 `v2/14`의 `public stable / public beta / ops/dev` gate class와 current code 기준으로 계속 자연스럽게 매핑된다.
- `package.json`의 `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`, `pnpm planning:v2:*`, `pnpm release:verify`, `pnpm v3:doctor`, `pnpm v3:support-bundle`, `pnpm v3:restore`, `pnpm v3:migrate`, `pnpm planning:v3:import:csv`는 문서의 command role table과 큰 축에서는 맞지만, `planning:v2:e2e:fast/full` row와 `news-settings-alert-rules.spec.ts` 같은 현재 자산 일부는 wording sync가 필요했다.
- current `pnpm e2e:rc` bundle은 stable-public bias를 유지하면서도 `tests/e2e/news-settings-alert-rules.spec.ts`를 포함해 limited beta follow-through evidence를 같이 품는다. 이 상태는 beta 기본 gate 승격이 아니라 current bundle composition note로 읽는 편이 맞다.
- `N2` handoff와 `N3` 문서는 충돌하지 않는다. current smallest viable next `N3` candidate는 broad 구현이 아니라 `QA-gate-and-golden-dataset current-state closeout docs-only sync`다. 비범위는 실제 구현 코드 변경, 새 테스트/스크립트 추가, CI 재설계, route visibility 최종 확정, `N4` 본작업이다.
- route 추가/삭제, production exposure 정책 변경, CI gate 스크립트 구현, `N2 sourceBinding` parked axis 재개는 여전히 비범위다.

연결 메모 (2026-03-25 QA-gate-and-golden-dataset current-state closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 `docs/current-screens.md`의 route class와 `v2/14` gate class가 current-state 기준으로 계속 자연스럽게 매핑된다는 점, `package.json`의 실제 명령 집합과 command role table이 current-state 기준으로 맞는다는 점, 그리고 `planning:v2:e2e:fast`, `planning:v2:e2e:full`, `news-settings-alert-rules.spec.ts`, current `pnpm e2e:rc` bundle composition note까지 반영한 현재 stop line이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, 새 테스트 추가, 새 script 추가, CI 파이프라인 재설계, route visibility 최종 확정, `N2` family closeout 재오픈, `N4` 본작업, route 추가/삭제, stable/public IA 재편이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다. current next question은 더 이상 `N3` 내부 wording resync가 아니다. `N3` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 확인 또는 다음 공식 축 `N4 beta exposure / visibility policy`의 current-state read / parked baseline 점검으로만 넘긴다.
- future reopen trigger는 실제 gate 역할이나 route class를 바꾸는 공식 question, `pnpm e2e:rc` bundle composition 재구성 요구, 새 gate/script 추가 요구, CI 파이프라인 재설계 요구, current-screens route class나 production exposure 정책을 실제로 바꾸는 요구로만 둔다.

연결 메모 (2026-03-25 N3 none-for-now closeout handoff-to-N4 docs-only sync):
- 이번 handoff에서 확정하는 것은 `N3 planning/v3 QA gate / golden dataset`의 gate matrix SSOT, command role table, route class mapping, golden dataset category가 current-state closeout 이후 내부 micro docs-first cut 기준으로는 현재 `none for now`라는 점이다.
- `N3` closeout은 QA 체계 구현 완료 선언이 아니다. stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 handoff 상태와 충돌하지 않고, current next recommendation은 `N3` 내부 새 audit이 아니라 trigger-specific reopen 확인 또는 다음 공식 축 `N4 beta exposure / visibility policy`의 current-state read / parked baseline 점검이다.
- broad `N4` 구현, route visibility 최종 확정, 새 테스트/스크립트 추가, CI 재설계, `N2` family closeout 재오픈은 여전히 비범위다.
- future reopen trigger는 실제 gate 역할이나 route class 변경 요구, `pnpm e2e:rc` bundle composition 재구성 요구, 새 gate/script 추가 요구, CI 파이프라인 재설계 요구, current-screens class나 production exposure 정책을 실제로 바꾸는 요구로만 둔다.

## N4. planning/v3 beta exposure / visibility policy

- 분류: `beta exposure`
- 목적:
  `planning/v3`를 어떤 순서로 public beta에 노출할지, 어떤 route는 계속 internal/experimental로 둘지 결정한다.
- 왜 지금 필요한가:
  canonical model과 QA gate가 정리되지 않은 상태에서 route만 먼저 보이면, 제품 정의보다 실험이 먼저 노출된다.
- 선행 조건:
  - `N1` canonical entity model
  - `N2` API / import-export / rollback contract
  - `N3` QA gate 재정의
- 구현 전에 먼저 필요한 문서/계약:
  - beta entry criteria
  - visibility / onboarding / fallback policy
  - route별 stable/beta/internal classification
- 완료 기준:
  - v3 route를 stable/beta/internal로 다시 나눈 노출 정책이 문서로 고정됨
  - beta 사용자에게 보여줄 진입 경로와 숨길 경로가 명확해짐
  - visibility policy가 current-screens 및 release gate와 충돌하지 않음

연결 메모 (2026-03-19):
- next-cycle visibility group 분류는 `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`를 기준으로 잠급니다.
- `docs/current-screens.md`는 현재 inventory를 유지하고, `N4` 문서는 다음 사이클용 exposure policy overlay로만 사용합니다.
- `planning/v3`는 `N5` 전까지 public stable로 승격하지 않으며, raw batch/import/support route는 public beta entry로 올리지 않습니다.

연결 메모 (2026-03-23 visibility policy overlay alignment audit):
- `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`는 current route SSOT와 `N3` gate matrix 위에서 대체로 정합하며, `transactions` redirect alias, `balances`/`profile/drafts`/`transactions/batches` entry 후보, `batches*`/`import/csv`/`exposure` internal 분류는 current `N2`/`N3` 기준과 크게 충돌하지 않는다.
- residual wording drift audit 이후 `news/*`와 `journal`은 current 실존 route를 부정하지 않는 non-entry/internal-trial overlay로 읽는 한 current overlay SSOT로 유지 가능하다고 본다.
- raw batch center vs user-facing batch overlay distinction audit 이후 `/planning/v3/batches*`는 "실존 raw center/summary route", `/planning/v3/transactions/batches*`는 "next-cycle user-facing batch list/detail overlay"로 읽는 현재 문구를 `15` 문서에 직접 남겼다.
- `15` 문서는 이제 current inventory SSOT와 `N3` gate 기준 위에서 next-cycle policy overlay SSOT로 park할 수 있는 상태로 읽고, next `N4` cut은 docs-only sync가 아니라 nav/홈/헤더 노출 변경, public beta entry group 변경, raw `/planning/v3/batches*`와 user-facing `/planning/v3/transactions/batches*` 혼합 같은 future reopen trigger가 실제로 생길 때만 다시 연다.
- 남은 `[검증 필요]`는 current overlay wording drift라기보다, future implementation round에서 위 distinction과 route group 경계를 실제 노출 변경에도 그대로 보존하는지 여부다. next `N4` cut이 다시 열리더라도 broad visibility 구현보다 이 preservation check가 더 작다.

## N5. public/stable UX polish backlog

- 분류: `product UX polish`
- 목적:
  기존 stable surface의 trust/helper/copy polish를 작은 유지보수 backlog로 묶어, contract-first 작업을 방해하지 않으면서 후순위 개선을 관리한다.
- 왜 지금 필요한가:
  P3 closeout 이후 polish 여지는 남아 있지만, 이를 다음 사이클의 1순위 대형 축으로 올리면 `planning/v3` contract 정리가 다시 밀린다.
- 선행 조건:
  없음
- 구현 전에 먼저 필요한 문서/계약:
  - 개선 대상 surface list
  - blocker가 아닌 small-batch 기준
  - trust hub / public helper / support-layer 원칙 유지 규칙
- 완료 기준:
  - polish 항목이 contract-first backlog와 분리된 작은 개선 queue로 정리됨
  - next cycle의 1순위 작업을 막지 않는 보조 backlog로 유지됨

연결 메모 (2026-03-19):
- stable/public UX polish queue 기준은 `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`를 기준으로 잠급니다.
- `N5`는 `docs/current-screens.md`의 `Public Stable` surface만 대상으로 삼고, `planning/v3` beta exposure나 새 stable 승격 논의를 다시 열지 않습니다.
- trust/helper/copy/CTA polish는 small-batch 보조 backlog로만 열고, `N1 ~ N4` contract-first backlog를 막는 blocker로 승격하지 않습니다.

연결 메모 (2026-03-23 public/stable polish alignment audit):
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`의 route 묶음은 `docs/current-screens.md` `Public Stable` inventory 39개와 1:1로 맞고, `Public Beta`/`Legacy Redirect`/`Local-only Ops`/`Dev/Debug`를 다시 끌어오지 않는다.
- `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`가 parked `N4` policy overlay SSOT로 유지되는 동안, `N5`는 stable/public surface의 small-batch polish backlog로만 읽고 `planning/v3` beta/internal 재분류나 stable 승격 논의를 다시 열지 않는다.
- 남은 `[검증 필요]`는 current wording drift가 아니라, future implementation round에서 `N5`를 이유로 stable IA/nav 변경이나 beta/internal surface 혼입을 다시 시도하는지 여부다. next `N5` cut이 열리더라도 broad UX overhaul보다 한 개 stable route cluster 안의 좁은 polish batch가 더 작다.

연결 메모 (2026-03-23 home/dashboard first-batch candidate audit):
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 시작점 surface 첫 후보를 `/dashboard` 단독 host surface로 두고, `/` 단독이나 `/ + /dashboard` pair는 CTA 중복과 stable entry hierarchy 오해 위험 때문에 `[검증 필요]` broad-scope risk로 남긴다.
- 따라서 next `N5` 구현 라운드가 열리더라도 broad home/dashboard overhaul보다 `/dashboard` hero/recent-run/quick-link helper를 좁게 다루는 single-surface batch가 더 작다.

연결 메모 (2026-03-23 dashboard primary CTA hierarchy audit):
- `/dashboard` single-surface first batch 안에서도 가장 작은 구현 후보는 `DashboardClient` hero CTA hierarchy copy/helper polish이다. hero CTA 묶음을 primary layer로 두고, `최근 플랜`과 `플랜 액션과 비교 후보`는 follow-through/support, `바로 이동`은 tertiary quick-link layer로 읽는다.
- 따라서 next `N5` cut이 다시 열리더라도 recent-run card reorder, action hub 재배치, quick-link block 재구성 같은 broad dashboard overhaul보다 hero 타이틀/설명/버튼/helper hierarchy를 좁게 다루는 cut이 더 작다.

연결 메모 (2026-03-23 dashboard hero post-spike doc sync):
- `/dashboard` hero CTA copy/helper polish는 이미 landing했고, 실제 변경 범위는 hero title, description, CTA/support button copy, helper copy에 한정된다.
- CTA destination, block order, card structure, stable IA/nav는 그대로 유지됐다. `최근 플랜`, `플랜 액션과 비교 후보`, `바로 이동` block 구현 변경은 이번 spike에 포함되지 않는다.
- 따라서 current next `N5` question은 hero CTA를 구현할지 여부가 아니라, hero 다음으로 가장 작은 dashboard 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad dashboard overhaul이 아니라 `최근 플랜` follow-through copy/helper audit이다.

연결 메모 (2026-03-23 dashboard recent-plan follow-through copy/helper audit):
- `/dashboard`의 `최근 플랜` block에서는 card-level `Report →`가 primary follow-through이고, `Re-run`은 secondary support action이다. section header `View All →`는 list-level action으로만 읽고 개별 카드 CTA와 같은 층위로 올리지 않는다.
- empty state도 first-time entry CTA가 아니라, 저장 후 `리포트`와 `재실행` follow-through가 생긴다는 안내로만 다룬다.
- 따라서 next `N5` cut이 다시 열리더라도 card reorder, header action 재격상, block priority 변경 같은 broad dashboard overhaul보다 `최근 플랜` block 내부 copy/helper만 좁게 다루는 batch가 더 작다.

연결 메모 (2026-03-23 dashboard recent-plan post-spike doc sync):
- `/dashboard` `최근 플랜` copy/helper polish는 이미 landing했고, 실제 변경 범위는 section description, empty-state helper, card footer CTA tone/copy에 한정된다.
- `View All →` header action, href destination, card order, block order, metrics/summary 구조는 그대로 유지됐다. `플랜 액션과 비교 후보`, `바로 이동`, hero CTA hierarchy는 이번 spike에 포함되지 않는다.
- 따라서 current next `N5` question은 recent-plan copy/helper를 구현할지 여부가 아니라, recent-plan 다음으로 가장 작은 dashboard 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad dashboard overhaul이 아니라 `플랜 액션과 비교 후보` docs-first candidate memo다.

연결 메모 (2026-03-23 dashboard action-candidate follow-through copy/helper candidate memo audit):
- `/dashboard`의 `플랜 액션과 비교 후보` block에서는 header `Action Hub →` 또는 `Pick Hub →`가 block-level action이고, action card의 `Explore ▶`는 card-level follow-through다. candidate card는 direct CTA 없는 summary surface로 유지한다.
- empty state도 hero/recent-plan entry CTA가 아니라, 플랜 저장 또는 추천 허브 직접 비교로 이어지는 fallback helper로만 읽는다.
- 따라서 next `N5` cut이 다시 열리더라도 action hub 재배치, block priority 변경, candidate CTA 추가 같은 broad dashboard overhaul보다 `플랜 액션과 비교 후보` block 내부 copy/helper polish spike가 더 작다.

연결 메모 (2026-03-23 dashboard action-candidate post-spike doc sync):
- `/dashboard` `플랜 액션과 비교 후보` copy/helper polish는 이미 landing했고, 실제 변경 범위는 section description, action card CTA tone/copy, empty-state helper에 한정된다.
- header action text/placement, href destination, candidate card direct CTA 부재, card order, block order는 그대로 유지됐다. hero CTA, `최근 플랜`, `바로 이동`은 이번 spike에 포함되지 않는다.
- 따라서 current next `N5` question은 action-candidate copy/helper를 구현할지 여부가 아니라, action-candidate 다음으로 가장 작은 dashboard 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad dashboard overhaul이 아니라 `바로 이동` docs-first candidate memo다.

연결 메모 (2026-03-23 dashboard quick-link post-spike doc sync):
- `/dashboard`의 `바로 이동` block은 primary CTA layer가 아니라 stable surface catalog shortcut 묶음이다. `플래닝`, `리포트`, `추천 허브`, `상품 탐색`, `공시 탐색`은 entry CTA가 아니라 tertiary quick-link card로만 읽는다.
- landed 범위는 section description과 각 shortcut card description의 helper tone 조정까지이며, href destination, shortcut 추가/삭제, 카드 순서, block 순서는 그대로 유지됐다.
- 따라서 current next `N5` question은 quick-link copy/helper를 구현할지 여부가 아니라, quick-link 다음으로 가장 작은 dashboard 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad dashboard overhaul이 아니라 `최근 피드백` docs-first candidate memo다.

연결 메모 (2026-03-23 dashboard recent-feedback post-spike doc sync):
- `/dashboard`의 `최근 피드백` block에서는 header `View Feed →`가 block-level list action이고, 각 feedback card는 개별 detail로 이어지는 card-level read-through/follow-through다.
- landed 범위는 section description, fallback category, card-level helper tone, empty-state helper 조정까지이며, `View Feed →`, href destination, card 순서, 표시 개수, block 순서는 그대로 유지됐다. `최근 피드백` 자체도 hero, `최근 플랜`, `플랜 액션과 비교 후보`, `바로 이동`보다 낮은 우선순위의 supporting surface로 유지한다.
- 따라서 current next `N5` question은 recent-feedback copy/helper를 구현할지 여부가 아니라, recent-feedback 다음으로 가장 작은 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad dashboard overhaul이 아니라 `/feedback` route cluster의 docs-first candidate memo다.

연결 메모 (2026-03-23 feedback route-cluster entry-history-detail boundary audit):
- `/feedback` route cluster는 support surface 안에서 역할이 나뉜다. `/feedback`는 새 의견을 남기는 entry surface, `/feedback/list`는 저장한 피드백을 다시 보는 history surface, `/feedback/[id]`는 개별 접수 내용을 다시 읽고 다음 확인 메모를 보는 detail read-through surface다.
- `docs/current-screens.md` 기준으로 세 경로 모두 `Public Stable` 실존 route이며, 이번 audit에서는 route 추가/삭제나 분류 변경이 없었다. current 문제는 route contract가 아니라 각 surface의 copy/helper 경계를 어디까지 작은 배치로 자를지에 가깝다.
- 따라서 current next `N5` question은 `/feedback` route cluster를 재설계할지 여부가 아니라, cluster 안에서 가장 작은 후속 배치를 무엇으로 둘지다. 현 시점의 first candidate는 broad feedback flow 재설계가 아니라 `/feedback` entry surface docs-first candidate memo다.

연결 메모 (2026-03-23 feedback entry-surface copy-helper candidate memo audit):
- `/feedback`는 새 의견, 질문, 도움 요청을 저장하는 support entry surface다. header와 `무엇을 남기나요?` 안내는 “확정 답변”보다 “기록을 남기고 나중에 다시 확인하는 entry”라는 기대치를 먼저 주고, `내용 저장하기`가 primary entry CTA다.
- `공유용 진단 번들`은 직접 공유나 지원 대응이 필요할 때만 쓰는 support helper이고, `대시보드로 이동`은 보조 이동이다. diagnostics 정책 변경, 저장 후 route 흐름 변경, `/feedback/list`·`/feedback/[id]`와의 역할 혼합은 이번 범위가 아니다.
- 따라서 current next `N5` question은 `/feedback` entry surface를 구현 후보로 열 것인지 여부가 아니라, entry surface 안에서 가장 작은 문구 배치를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad feedback flow 재설계가 아니라 `/feedback` entry surface copy/helper polish spike다.

연결 메모 (2026-03-23 feedback entry-surface post-spike doc sync):
- `/feedback` entry surface copy/helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader` description, `무엇을 남기나요?` 안내, 저장 성공 notice, `공유용 진단 번들` helper/notice, 민감정보 주의 문구의 support tone 정리까지다.
- href destination, 버튼 수, form field 구조, diagnostics payload/policy, 저장 후 route 흐름은 그대로 유지됐다. `내용 저장하기`는 primary entry CTA, `공유용 진단 번들`은 support helper, `대시보드로 이동`은 보조 이동으로 계속 남는다.
- 따라서 current next `N5` question은 entry-surface copy/helper를 구현할지 여부가 아니라, entry-surface 다음으로 가장 작은 feedback 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad feedback flow 재설계가 아니라 `/feedback/list` history-surface docs-first candidate memo다.

연결 메모 (2026-03-23 feedback history-surface copy-helper candidate memo audit):
- `/feedback/list`는 저장한 피드백을 다시 보는 support history surface다. `저장한 피드백 다시 보기` header, `새 의견 남기기` list-level action, `상세로 들어가면...` helper, `기록 보기 ▶` detail follow-through를 기준으로, 새 접수보다 기존 기록 재확인에 초점을 둔다.
- `새 의견 남기기`는 history surface를 벗어나는 보조 action이고, `기록 보기 ▶`는 각 row/card에서 detail read-through로 이어지는 follow-through다. filter/search control 배치, row/card 순서, `/feedback/[id]` detail contract는 이번 범위가 아니다.
- 따라서 current next `N5` question은 `/feedback/list` history surface를 재설계할지 여부가 아니라, history surface 안에서 가장 작은 문구 배치를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad feedback flow 재설계가 아니라 `/feedback/list` history-surface copy/helper polish spike다.

연결 메모 (2026-03-23 feedback history-surface post-spike doc sync):
- `/feedback/list` history-surface copy/helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader` description, empty-state description/action label tone, detail follow-through helper, mobile/desktop CTA tone 조정까지다.
- href destination, filter/search control 배치, row/card 순서, 표시 개수, `/feedback/[id]` detail contract는 그대로 유지됐다. `새 의견 남기기`는 list-level 보조 action이고, `상세 기록 보기 →`는 detail read-through follow-through로 계속 남는다.
- 따라서 current next `N5` question은 history-surface copy/helper를 구현할지 여부가 아니라, history-surface 다음으로 가장 작은 feedback 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad feedback flow 재설계가 아니라 `/feedback/[id]` detail read-through docs-first candidate memo다.

연결 메모 (2026-03-24 feedback detail read-through candidate memo audit):
- `/feedback/[id]`는 개별 접수 내용을 다시 읽고 다음 확인 메모를 보는 detail read-through surface다. `피드백 상세` header, `내역`/`새 의견` 보조 이동, `이 화면에서 먼저 보는 정보`, `공유·지원용 보조 정보`, `공유·지원용 내보내기`를 기준으로, 제출 당시 맥락과 지원용 helper를 다시 읽는 저장본으로 본다.
- `내역`과 `새 의견`은 detail의 primary task를 대신하지 않는 보조 이동이고, `개발용 복구 액션`은 dev-only recovery helper라 user-facing read-through copy와 같은 층위로 섞지 않는다. 상태/우선순위/체크리스트 편집 흐름, export/issue/dev recovery 정책은 이번 범위가 아니다.
- 따라서 current next `N5` question은 `/feedback/[id]` detail surface를 재설계할지 여부가 아니라, detail surface 안에서 가장 작은 문구 배치를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad feedback flow 재설계가 아니라 `/feedback/[id]` detail read-through copy/helper polish spike다.

연결 메모 (2026-03-24 feedback detail read-through post-spike doc sync):
- `/feedback/[id]` detail read-through copy/helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader` description, `이 화면에서 먼저 보는 정보` helper, `공유·지원용 보조 정보` helper, `공유·지원용 내보내기` helper 문구 조정까지다.
- `내역`/`새 의견` href와 보조 이동 역할, 상태/우선순위/체크리스트 편집 흐름, export action semantics, dev recovery action 정책은 그대로 유지됐다. `/feedback` cluster route contract와 `Public Stable` inventory도 바뀌지 않았다.
- 따라서 current next `N5` question은 detail read-through copy/helper를 구현할지 여부가 아니라, feedback cluster 다음으로 가장 작은 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad feedback flow 재설계가 아니라 `feedback route-cluster post-polish closeout memo` 같은 docs-first candidate다.

연결 메모 (2026-03-24 feedback route-cluster post-polish closeout memo):
- `/feedback` route cluster는 cluster 단위 closeout 기준으로 닫혔다. `/feedback`는 support entry surface, `/feedback/list`는 history surface, `/feedback/[id]`는 detail read-through surface로 읽고, 세 surface의 copy/helper polish landed 범위만 `N5`에서 인정한다.
- route contract, `Public Stable` inventory, flow semantics, diagnostics/export/dev recovery policy, history filter/search IA, detail 편집 흐름은 그대로 유지됐다. wording sync, closeout memo 보강, current inventory 재확인만으로는 cluster reopen trigger가 되지 않는다.
- 따라서 feedback route cluster는 현 상태로 stable support surface로 parked할 수 있다. 다시 열어야 하는 경우는 feedback flow 재설계, route policy 변경, diagnostics/export/dev recovery helper 정책 변경, history filter/search IA 재배치처럼 실제 trigger가 생길 때뿐이며, 그때도 first cut은 broad implementation이 아니라 trigger-specific docs-first audit이어야 한다.

연결 메모 (2026-03-24 next stable/public route-cluster candidate selection audit):
- `/dashboard`와 `/feedback` cluster가 사실상 닫힌 현재 상태에서, 남은 stable/public route group 중 가장 작은 다음 후보는 `recommend / action follow-through surface`다. `/recommend`와 `/recommend/history` 두 route만 포함하고, planning linkage helper와 저장 히스토리 follow-through를 docs-first로 먼저 좁힐 수 있다.
- `planning stable surface`는 run/report/trash semantics와 결과 설명 위계가 묶여 있고, `상품 / 공공정보 / 탐색 surface`는 route family 수와 freshness/source helper 밀도가 높으며, `설정 / trust hub / 유지보수 surface`는 support/ops 정책 오해 위험이 커서 이번 라운드에서는 보류한다.
- 따라서 current next `N5` cut은 broad implementation이 아니라 `recommend route-cluster candidate memo audit` 같은 docs-first narrowing round여야 한다. stable/public IA 재편, planning 결과 흐름 재설계, product/public-data freshness policy 조정, settings trust/ops policy 변경은 계속 비범위다.

연결 메모 (2026-03-24 recommend route-cluster candidate memo audit):
- `/recommend`는 현재 조건 기준 비교를 시작하는 host surface이고, `/recommend/history`는 저장한 추천 결과를 다시 읽는 history/follow-through surface다. current `Public Stable` inventory와 route contract는 그대로 유지한 채, 두 route의 역할 경계를 docs-first로 다시 고정한다.
- cluster 안의 smallest viable next candidate는 `/recommend/history` docs-first candidate memo audit이다. `/recommend` host surface는 조건 form, planning linkage, freshness/helper, compare/save/export가 한 화면에 겹쳐 있어 첫 구현 배치로는 too broad하다.
- 따라서 current next `N5` cut은 broad implementation이 아니라 `/recommend/history` history/follow-through candidate memo audit이어야 한다. planning linkage/store flow 재설계, compare/save/export semantics 변경, data freshness policy 조정, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 recommend history follow-through candidate memo audit):
- `/recommend/history`는 저장한 추천 결과를 다시 보는 history/follow-through surface다. `추천 비교 기록` header, 저장 실행 목록, `새 추천 비교 열기`, 선택 실행 상세, `실행 비교`를 기준으로 저장 당시 조건과 다음 행동을 다시 읽는 역할을 맡는다.
- `새 추천 비교 열기`는 list-level 보조 action이고, row-level `상세 열기`/selection과 active run의 `상위 N개 비교 후보 담기`, `저장 당시 플래닝 보기`는 detail/follow-through layer다. `공유·복구용 보조 정보`와 `실행 비교`는 support helper/analysis layer로 남긴다.
- 따라서 current next `N5` cut은 broad implementation이 아니라 `/recommend/history` history/follow-through copy/helper polish spike여야 한다. compare/store semantics 변경, planning report deep-link contract 변경, raw identifier helper 정책 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 recommend history follow-through post-spike doc sync):
- `/recommend/history` history/follow-through copy/helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader` description, empty-state description/helper, active run next-action helper tone, `공유·복구용 보조 정보` 안내 문구 조정까지다.
- `새 추천 비교 열기`의 list-level 보조 action 역할, `상위 N개 비교 후보 담기`와 `저장 당시 플래닝 보기`의 semantics, href destination, compare/store 동작, row/card 순서, planning report deep-link contract, raw identifier helper policy는 그대로 유지됐다.
- 따라서 current next `N5` question은 history-surface copy/helper를 구현할지 여부가 아니라, recommend cluster 다음으로 가장 작은 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad recommend flow 재설계가 아니라 `/recommend` host-surface docs-first candidate memo다.

연결 메모 (2026-03-24 recommend host-surface candidate memo audit):
- `/recommend`는 현재 조건 기준 비교를 시작하는 host surface다. `상품 추천 비교` header, 상단 helper, 조건 form, summary card의 `비교 후보 보기`가 pre-result entry layer를 이루고, result 이후의 `결과 저장`/`JSON`/`CSV`, `플래닝 연동`, 결과 카드 trust cue, `비교 담기`, `상세 분석`은 follow-through와 support helper layer로 남는다.
- host surface 안의 smallest viable next candidate는 broad host overhaul이 아니라 pre-result entry hierarchy copy/helper polish spike다. 범위는 `PageHeader` description, 상단 helper, summary card entry helper tone, `비교 후보 보기`와 `가중치 설정`의 층위를 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
- 따라서 current next `N5` cut은 broad implementation이 아니라 `/recommend` host surface pre-result entry hierarchy copy/helper polish spike여야 한다. result header save/export tone, planning linkage strip, 결과 카드 trust cue/`비교 담기`, compare/store semantics, planning linkage/store flow 재설계, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 recommend host-surface pre-result entry hierarchy post-spike sync):
- `/recommend` host-surface pre-result entry hierarchy copy/helper polish는 landing했고, 실제 변경 범위는 `PageHeader` description, 상단 helper, summary card entry helper tone, `비교 후보 보기`/`가중치 설정` 주변 안내 문구 정리에 한정된다.
- result header `결과 저장`/`JSON`/`CSV`, `플래닝 연동` strip, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics, compare/store flow, route contract는 그대로 유지됐다.

연결 메모 (2026-03-24 recommend result-header follow-through candidate memo audit):
- current `/recommend` result header에서는 `추천 결과` title과 score disclaimer가 현재 비교 결과라는 기대치를 주고, `결과 저장`/`JSON`/`CSV` button cluster와 shared `feedback` message가 post-result follow-through layer를 이룬다.
- 다음 smallest viable candidate는 broad host rewrite가 아니라 result-header follow-through copy/helper polish spike다. `결과 저장`을 post-result primary follow-through, `JSON`/`CSV`를 support export helper로 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
- export/save 동작 변경, shared feedback ownership 분리, `플래닝 연동` strip, 결과 카드 trust cue/`비교 담기`/`상세 분석`, compare/store semantics, route/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 recommend result-header follow-through post-spike sync):
- `/recommend` result-header follow-through copy/helper polish는 landing했고, 실제 변경 범위는 score disclaimer tone과 `결과 저장` 대 `JSON`/`CSV` 역할 helper 정리에 한정된다.
- button 동작, shared `feedback` ownership, button cluster 구조, `플래닝 연동` strip, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics, route contract는 그대로 유지됐다.

연결 메모 (2026-03-24 recommend planning-linkage strip candidate memo audit):
- current `/recommend`의 `플래닝 연동` strip은 planning-linked recommend를 어떤 action/stage 맥락으로 읽어야 하는지 설명하는 helper surface다. title/description은 primary context helper이고, `연결된 액션`/`단계` 대비 `연결 방식`/`실행 상태`/`플래닝 실행 ID`는 support/provenance 성격이 더 강하다.
- 다음 smallest viable candidate는 broad host rewrite가 아니라 planning-linkage strip copy/helper polish spike다. title/description과 chip helper 위계를 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
- planning linkage/store flow 재설계, inference semantics 변경, chip 표시 조건/ownership 변경, result-header·결과 카드·compare/store semantics, route/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 recommend planning-linkage strip post-spike sync):
- `/recommend` planning-linkage strip copy/helper polish는 landing했고, 실제 변경 범위는 title/description tone, chip helper label, `플래닝 실행 ID` support/provenance helper tone 정리에 한정된다.
- chip 표시 조건, inference semantics, planning linkage/store flow, result-header, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics, route contract는 그대로 유지됐다.

연결 메모 (2026-03-25 recommend route-cluster post-polish closeout memo):
- `/recommend`는 host surface, `/recommend/history`는 history/follow-through surface라는 cluster role을 current `Public Stable` inventory와 route contract를 유지한 채로 잠근다.
- 이미 landing한 범위는 `/recommend` host pre-result entry hierarchy, result-header follow-through, planning-linkage strip, `/recommend/history` history follow-through small-batch polish까지다. compare/save/export semantics, planning linkage/store flow, planning report deep-link contract, raw identifier/helper policy, route/href contract, stable/public IA는 바뀌지 않는다.
- 따라서 current next question은 더 이상 recommend cluster 내부의 새 spike가 아니라, 이 cluster를 현재 상태로 parked할지 여부다. broad reopen trigger와 micro polish backlog를 다시 섞지 않고, 후속 질문은 trigger 존재 여부를 먼저 묻는 docs-first 판단으로만 둔다. [검증 필요]
- future reopen trigger는 compare/save/export semantics, planning linkage/store flow, planning report deep-link contract, raw identifier/helper policy, host/history canonical 관계, route/href contract, stable/public IA를 다시 정의해야 하는 경우로만 좁힌다. wording sync나 closeout memo 보강만으로는 reopen trigger가 아니다.

연결 메모 (2026-03-24 products/public/explore route-cluster candidate selection audit):
- `/recommend` cluster가 사실상 닫힌 현재 상태에서, `상품 / 공공정보 / 탐색 surface` 안의 next smallest candidate는 broad family implementation이 아니라 `/products` host-surface docs-first candidate memo audit이다.
- `/compare`는 `/products/compare` alias로 읽는 편이 맞고, `/products/catalog`·`/products/compare`는 compare/filter semantics 때문에 첫 배치에서 보류한다. `/benefits`, `/gov24`, `/public/dart*`, `/tools/fx`는 freshness/source 또는 disclosure trust helper가 더 강해 이번 선택 라운드에서는 defer 대상이다.
- 따라서 current next `N5` cut은 `/products` host-surface candidate memo audit이어야 하며, route contract/redirect 변경, compare/filter semantics 조정, public-data freshness/source policy 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 products host-surface candidate memo audit):
- `/products`는 `금융탐색`의 host entry surface다. `PageHeader`, hero copy, `통합 카탈로그에서 비교 시작`은 broad entry layer를 이루고, `카테고리 바로가기`와 상품군 card는 이미 볼 범주를 정한 사용자를 위한 secondary shortcut layer로 읽는다.
- current `/products` 화면에서 compare deep-link와 source/freshness helper는 first-read owner가 아니다. 이 축은 주로 `/products/catalog`과 downstream route에 있으므로, host surface candidate에서는 entry/helper hierarchy만 좁게 다루는 편이 맞다.
- 따라서 current next `N5` cut은 `/products` host-surface entry hierarchy copy/helper polish spike여야 한다. route/href 변경, `/products/catalog`·`/products/compare` compare/filter semantics 변경, compare/store flow 변경, source/freshness policy 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 products host-surface post-spike doc sync):
- `/products` host-surface entry hierarchy copy/helper polish는 landing했고, 실제 변경 범위는 `PageHeader` description, hero helper와 primary CTA 보조 문구, `카테고리 바로가기` description, category card description/entry helper tone 조정까지다.
- `href` destination, card 순서, `/products/catalog`·`/products/compare` compare/filter semantics, compare deep-link semantics, source/freshness helper policy, downstream route contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 host-surface copy/helper를 구현할지 여부가 아니라, products family 다음으로 가장 작은 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad family implementation이 아니라 `/products/catalog` docs-first candidate memo audit이다.

연결 메모 (2026-03-24 products-catalog compare-filter-follow-through candidate memo audit):
- `/products/catalog`은 products family의 compare/filter host-follow-through surface다. 상단의 상품군 선택·검색·필터 control이 primary layer를 이루고, result card의 `대표 옵션` helper는 preview/trust layer, row-level `비교 후보 담기`와 global compare notice는 `/products/compare`로 이어지는 secondary compare follow-through layer로 읽는다.
- current `/products/catalog`에서 source/freshness helper는 first-read owner가 아니고, response type의 `generatedAt`도 UI에 직접 노출되지 않는다. 따라서 current candidate는 compare follow-through와 preview helper 위계를 좁게 다루는 편이 맞다.
- 따라서 current next `N5` cut은 broad catalog 구현이 아니라 `/products/catalog` compare follow-through copy/helper polish spike여야 한다. filter/search semantics, compare basket/store semantics, `/products/compare` 구현, source/freshness policy 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 products-catalog compare follow-through post-spike doc sync):
- `/products/catalog` compare follow-through copy/helper polish는 landing했고, 실제 변경 범위는 `compareNotice` 본문, compareNotice 아래 보조 helper, row-level `비교 후보 담기` helper, `대표 옵션` preview helper tone 조정까지다.
- sticky control panel의 filter/search control 구조, compare basket/store semantics, `/products/compare` route/구현, source/freshness helper policy, row/card 순서, href destination은 그대로 유지됐다.
- 따라서 current next `N5` question은 catalog compare helper를 구현할지 여부가 아니라, products family 다음으로 가장 작은 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad catalog rewrite가 아니라 `/products/compare` docs-first candidate memo audit이다.

연결 메모 (2026-03-24 products-compare read-through-and-basket-action candidate memo audit):
- `/products/compare`는 compare basket에 담은 후보를 나란히 다시 읽는 read-through surface다. desktop/mobile comparison view가 primary read-through layer를 이루고, 상단 summary counts는 context summary, `새로고침`·`비교함 비우기`·`비교 후보 더 담기`는 basket action/helper layer로 읽는다.
- current compare surface에서 empty state와 “최소 2개” fallback은 basket action fallback이고, compare basket/store semantics나 route contract를 바꾸지 않는 한 문구만으로 좁게 다룰 수 있는 영역은 상단 summary/action row와 fallback helper 쪽이다.
- 따라서 current next `N5` cut은 broad compare surface rewrite가 아니라 `/products/compare` basket-action hierarchy copy/helper polish spike여야 한다. compare basket/store semantics, desktop/mobile comparison field set 재구성, empty-state destination 변경, source/freshness policy 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 products-compare post-spike doc sync):
- `/products/compare` first copy/helper polish는 landing했고, 실제 변경 범위는 `PageHeader` description, 상단 helper 문구, summary count label, `비교함 비우기`, `비교 후보 더 담기`, top summary helper, empty-state / insufficient-state helper, `대표 금리`, `다음 확인 포인트`, `상세에서 다시 확인`, kind label의 한국어 정리까지다.
- compare basket/store semantics, `새로고침`·제거·비우기 action behavior, href destination, desktop/mobile comparison field set, row/card 순서, route contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 products-compare basket-action helper를 구현할지 여부가 아니라, products family 안에서 다음으로 가장 작은 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad compare rewrite가 아니라 `/products/compare` desktop/mobile read-through helper docs-first memo다.

연결 메모 (2026-03-24 products-compare desktop-mobile read-through helper candidate memo audit):
- `/products/compare`의 desktop table과 mobile card는 둘 다 compare basket read-through 목적을 공유한다. `대표 금리`·`가입 기간`·`예금자 보호`는 factual scan layer이고, `다음 확인 포인트`는 secondary read-through helper, `상세에서 다시 확인`은 detail validation CTA로 읽는 편이 맞다.
- current surface에서 basket action/helper와 read-through helper는 위치상 분리돼 있으므로, 다음 smallest cut은 action row 재수정보다 desktop/mobile 내부 label/helper hierarchy를 더 또렷하게 만드는 쪽이 적절하다.
- 따라서 current next `N5` cut은 broad compare rewrite가 아니라 `/products/compare` desktop/mobile read-through helper copy/helper polish spike여야 한다. comparison field set 재구성, basket/store semantics 변경, detail destination 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 products-compare desktop-mobile read-through helper post-spike sync):
- `/products/compare` desktop/mobile read-through helper copy/helper polish는 landing했고, 실제 변경 범위는 shared read-through helper 한 줄, desktop `비교 항목` helper tone, desktop/mobile 공통 `다음 확인 포인트 메모`, desktop/mobile 공통 `상세에서 조건 다시 확인` 문구 정리까지다.
- `대표 금리`·`가입 기간`·`예금자 보호` factual scan layer, basket action row, empty-state destination, `/products/catalog` deep-link contract, comparison field set, remove button 동작, basket/store semantics, route contract는 그대로 유지됐다.

연결 메모 (2026-03-25 products/public/explore route-cluster post-polish closeout memo):
- `/products` host entry hierarchy, `/products/catalog` compare follow-through, `/products/compare` basket-action helper, `/products/compare` desktop/mobile read-through helper까지가 현재 products/public/explore cluster 안에서 실제로 landing한 scope다. `/compare`는 계속 `/products/compare` alias route로 읽고, 이를 독립 surface reopen 질문으로 다시 분리하지 않는다. [검증 필요]
- 이번 closeout에서 defer로 남기는 것은 `/benefits`, `/gov24`, `/public/dart`, `/public/dart/company`, `/tools/fx`, `/products/catalog/[id]` downstream detail contract다. landed된 products host/catalog/compare polish와 defer route를 묶어 “family 전체 구현 완료”처럼 읽지 않는 편이 맞다. [검증 필요]
- compare/filter semantics, compare basket/store semantics, source/freshness policy, `/products/catalog/[id]` detail contract, `/compare` alias policy, route/href contract, stable/public IA는 바뀌지 않는다.
- 따라서 current next question은 더 이상 products cluster 내부의 새 micro spike가 아니라, 이 cluster를 current parked 상태로 둘 수 있는지 여부다. future reopen trigger는 compare/filter/store semantics, source/freshness/disclosure policy, detail/alias/route contract, stable/public IA, 또는 defer route 중 하나가 trigger-specific docs-first question으로 다시 좁혀지는 경우로만 한정한다. wording sync만으로는 reopen trigger가 아니다. [검증 필요]

연결 메모 (2026-03-24 settings-trust-hub route-cluster candidate selection audit):
- settings/trust-hub surface는 `/settings` host entry, `/settings/data-sources` trust/freshness owner, `/settings/alerts` rule/preset config, `/settings/backup`·`/settings/recovery`·`/settings/maintenance` operator-maintenance surface로 나눠 읽는 편이 맞다.
- current smallest viable next candidate는 data-source/recovery route가 아니라 `/settings` host surface다. 얇은 card hub라서 entry/helper hierarchy를 좁게 정리해도 trust/data-source policy나 recovery/backup semantics를 다시 열 가능성이 가장 낮다.
- 따라서 current next `N5` cut은 broad settings family 구현이 아니라 `/settings` host-surface docs-first candidate memo audit이어야 한다. route/href 변경, trust/data-source policy 변경, recovery/backup semantics 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 settings host-surface candidate memo audit):
- `/settings`는 특정 설정을 끝내는 화면이 아니라 어디서 설정을 시작할지 고르는 host entry surface다. `PageHeader`는 orientation layer이고, card title/description은 peer shortcut layer, 반복되는 `Setup ▶`는 card-level entry helper로 읽는 편이 맞다.
- current host surface에서 좁게 다룰 수 있는 질문은 entry/helper hierarchy뿐이다. trust/data-source freshness owner 역할이나 recovery/backup semantics를 host surface로 끌어올리면 바로 downstream contract를 다시 열게 된다.
- 따라서 current next `N5` cut은 broad settings rewrite가 아니라 `/settings` host-surface entry hierarchy copy/helper polish spike여야 한다. route/href 변경, card 순서 변경, trust/data-source policy 변경, recovery/backup semantics 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 settings host-surface post-spike doc sync):
- `/settings` host-surface entry hierarchy copy/helper polish는 landing했고, 실제 변경 범위는 `PageHeader` description, host helper 문구, card description tone, `이 설정 열기 ▶` helper tone 정리까지다.
- href destination, card 순서, downstream trust/data-source freshness owner 역할, recovery/backup semantics, route contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 host-surface copy/helper를 구현할지 여부가 아니라, settings family 안에서 다음으로 가장 작은 후속 batch를 무엇으로 둘지다. 현 시점의 smallest candidate는 broad settings rewrite가 아니라 `/settings/data-sources` docs-first candidate memo audit이다.

연결 메모 (2026-03-24 settings-data-sources trust-freshness-owner candidate memo audit):
- `/settings/data-sources`는 추천·공시·혜택·주거 화면이 어떤 데이터 기준으로 보이는지 설명하는 trust/freshness owner surface다. `PageHeader`와 `먼저 확인할 신뢰 요약`은 orientation layer이고, impact/source/OpenDART card는 user-facing current-state helper, `상세 운영 진단`은 dev/ops diagnostics로 분리해 읽는 편이 맞다.
- env 누락, 요청 실패, stale 상태, partial payload, production에서 diagnostics 비노출 같은 failure mode는 user-facing helper에서 현재 상태를 보수적으로 설명하되, raw health/error/ping detail은 diagnostics layer에 남겨야 한다.
- 따라서 current next `N5` cut은 broad data-sources UI polish가 아니라 `/settings/data-sources` page-shell trust-summary vs diagnostics-boundary copy/helper spike여야 한다. route/href 변경, freshness/health policy 변경, ping semantics 변경, env/operator 설명 재설계, diagnostics 구조 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 settings-data-sources actual-landing-scope post-spike closeout sync):
- `/settings/data-sources` trust/freshness helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader`, `먼저 확인할 신뢰 요약` 3단계 helper, 상단 jump helper, impact/source card helper tone, `DataSourceStatusCard`의 user-facing `현재 읽는 기준` vs dev-only details 분리, `OpenDartStatusCard`의 user summary vs dev-only index info 분리까지 포함한다.
- original candidate가 예상한 page-shell보다 actual landed scope는 component-level trust helper wording까지 조금 넓어졌지만, route/href contract, freshness policy, ping/build semantics, diagnostics 구조, env contract, current-screens inventory는 그대로 유지됐다.
- 따라서 current next `N5` question은 initial data-sources spike를 구현할지 여부가 아니라, 남은 diagnostics-heavy surface를 어디서 다시 자를지다. if this route stays in scope, safest next cut은 broad data-sources rewrite가 아니라 `/settings/data-sources` diagnostics-boundary docs-first memo다.

연결 메모 (2026-03-24 settings-data-sources diagnostics-boundary candidate memo audit):
- `/settings/data-sources`에서 `확장 후보`는 support/follow-through layer이고, `상세 운영 진단`은 dev/ops-only diagnostics boundary layer다. production의 diagnostics 제한 안내는 사용자 상태 경고가 아니라 dev-only disclosure boundary helper로 읽는 편이 맞다.
- raw health/error/ping/build detail은 user-facing trust helper와 같은 층위로 다시 올리면 안 된다. 특히 `DataSourceHealthTable`은 dev API가 주입하는 read-only meta와 raw diagnostics를 operator read-through로 남겨야 한다.
- 따라서 current next `N5` cut은 broad diagnostics rewrite가 아니라 `/settings/data-sources` diagnostics-boundary copy/helper spike여야 한다. route/href 변경, freshness/health policy 변경, ping/build semantics 변경, env/operator 설명 재설계, diagnostics 구조 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 settings-data-sources diagnostics-boundary post-spike doc sync):
- `/settings/data-sources` diagnostics-boundary copy/helper polish는 landing했고, 실제 변경 범위는 `확장 후보` section description, `상세 운영 진단` section description, production diagnostics 제한 안내 문구, production helper paragraph 정리까지다.
- `DataSourceHealthTable` 구조, `DataSourceStatusCard` wording, `OpenDartStatusCard` wording, ping/build semantics, freshness/health policy, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 diagnostics-boundary wording을 구현할지 여부가 아니라, 남은 diagnostics-heavy surface를 어디서 다시 자를지다. safest next candidate는 broad diagnostics rewrite가 아니라 `/settings/data-sources` `DataSourceHealthTable` operator/read-only-meta boundary docs-first memo다. [검증 필요]

연결 메모 (2026-03-24 settings-data-sources DataSourceHealthTable operator-read-only-meta boundary candidate memo audit):
- `DataSourceHealthTable`에서 `Fallback & 쿨다운 진단`은 dev/operator raw diagnostics, `사용자 도움 기준 요약`은 user-facing helper의 연장이 아니라 operator read-only-meta, `최근 오류 로그`는 raw incident log로 분리해 읽는 편이 맞다.
- 특히 `사용자 도움 기준 요약`은 Health API가 사용자 화면에 주입한 read-only meta를 운영자가 다시 보는 영역일 뿐, canonical user trust helper를 다시 제공하는 블록이 아니다.
- 따라서 current next `N5` cut은 broad diagnostics table rewrite가 아니라 `/settings/data-sources` `DataSourceHealthTable` operator/read-only-meta boundary copy/helper spike여야 한다. route/href 변경, freshness/health policy 변경, ping/build semantics 변경, env/operator flow 재설계, diagnostics schema/구조 변경, stable/public IA 재편은 계속 비범위다.

연결 메모 (2026-03-24 settings-data-sources DataSourceHealthTable operator-read-only-meta boundary post-spike doc sync):
- `DataSourceHealthTable` operator/read-only-meta boundary copy/helper polish는 landing했고, 실제 변경 범위는 component 상단 operator helper 문구, `Fallback & 쿨다운 진단` → `운영 fallback · 쿨다운 진단`, `사용자 도움 기준 요약` → `운영용 read-only 메타 요약`, `최근 오류 로그` → `운영 최근 오류 로그`, 각 section description tone 조정까지다.
- table/card 구조, column 구성, `readOnly`/`healthSummary` 렌더링 로직, trace copy flow, ping/build semantics, freshness/health policy, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 `DataSourceHealthTable` wording을 구현할지 여부가 아니라, 그 다음 diagnostics-adjacent smallest cut을 무엇으로 둘지다. safest next candidate는 broad diagnostics rewrite가 아니라 `/settings/data-sources` `DataSourceStatusCard`·`OpenDartStatusCard` dev-action/disclosure boundary docs-first memo다. [검증 필요]

연결 메모 (2026-03-24 settings-data-sources status-cards dev-action-disclosure boundary candidate memo audit):
- `DataSourceStatusCard`에서 `사용자에게 보이는 영향`은 primary user-facing current-state helper, `현재 읽는 기준`은 trust/read-basis helper, `최근 연결 확인`은 support validation helper다. `개발용 연결 조건과 메모 보기`는 dev-only disclosure, footer ping button은 dev-only action으로 읽는 편이 맞다.
- `OpenDartStatusCard`에서 `사용자에게 먼저 보이는 기준`과 `지금 읽는 기준`은 user-facing summary/read-through이고, 우측 개발용 관리 영역의 build/refresh action과 `개발용 인덱스 정보 보기`는 dev-action/disclosure boundary다.
- 따라서 current next `N5` cut은 broad status-card rewrite가 아니라 `/settings/data-sources` status-cards dev-action/disclosure boundary copy/helper spike여야 한다. route/href 변경, ping/build semantics 변경, freshness/health policy 변경, env/operator disclosure contract 재설계, status schema 변경, stable/public IA 재편은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-24 settings-data-sources status-cards dev-action-disclosure boundary post-spike doc sync):
- status-cards dev-action/disclosure boundary copy/helper polish는 landing했고, 실제 변경 범위는 `DataSourceStatusCard` header helper, `최근 연결 확인 참고`와 보조 helper, `개발용 연결 조건과 내부 메모만 보기` disclosure tone, footer ping helper, `OpenDartStatusCard` header helper, `필요할 때만 여는 개발용 관리` 영역 helper, build action helper, `개발용 인덱스 정보만 보기` disclosure helper 조정까지다.
- ping/build button 동작, endpoint, local storage snapshot ownership, env key/endpoint/message disclosure 구조, status schema, route/href contract, card 구조 재배치는 그대로 유지됐다.
- 따라서 current next `N5` question은 status-card wording을 구현할지 여부가 아니라, 그 다음 diagnostics-adjacent smallest cut을 무엇으로 둘지다. safest next candidate는 broad data-sources rewrite가 아니라 `/settings/data-sources` `DataSourceStatusCard` recent-ping support-helper ownership docs-first memo다. [검증 필요]

연결 메모 (2026-03-24 settings-data-sources recent-ping support-helper ownership post-spike doc sync):
- recent-ping support-helper ownership copy/helper polish는 landing했고, 실제 변경 범위는 `최근 연결 확인 참고` title과 보조 문구, recent evidence layer를 설명하는 `fetchedAt`/detail chips 안내, footer helper 문구 조정까지다.
- `DataSourcePingButton` 동작, `/api/dev/data-sources/ping` endpoint contract, local storage snapshot ownership, `DATA_SOURCE_PING_UPDATED_EVENT`, `createDataSourcePingSnapshot()` contract, snapshot schema, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 recent-ping helper wording을 구현할지 여부가 아니라, status surface 안에서 그 다음 smallest docs-first cut을 무엇으로 둘지다. broad ping/status rewrite는 reopen trigger가 아니다.
- if this route stays in scope, safest next candidate는 broad ping/status rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` build-notice/disabled-reason helper ownership docs-first memo 정도로만 좁히는 것이다. build endpoint, button semantics, ping/storage ownership reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-24 settings-data-sources OpenDartStatusCard build-notice-disabled-reason helper ownership post-spike doc sync):
- build-notice/disabled-reason helper ownership copy/helper polish는 landing했고, 실제 변경 범위는 dev-only 관리 영역 introduction/helper, build/refresh action 위 helper, `autoBuildDisabledReason` helper tone, 하단 `buildNotice`/`buildError` 영역 label/helper 조정까지다.
- build endpoint, button semantics, `canAutoBuild`/disabled 조건, `primaryPath`/`status.message` disclosure 구조, status schema, route/href contract, card 구조 재배치는 그대로 유지됐다.
- 따라서 current next `N5` question은 OpenDART helper wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` `primaryPath`/`status.message` disclosure ownership docs-first memo 정도로만 좁히는 것이다. build endpoint, button semantics, env/operator disclosure contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-24 settings-data-sources OpenDartStatusCard primaryPath-status.message disclosure ownership candidate memo audit):
- `primaryPath`는 user-facing 현재 상태가 아니라 dev-only index trace disclosure다. `status.message`도 build action result helper가 아니라 operator/dev disclosure memo로 읽는 편이 맞다.
- `개발용 인덱스 정보만 보기` 전체는 card 하단 `buildNotice`/`buildError`와 다른 disclosure layer다. 하단 영역은 action result helper이고, details 안의 path/message는 현재 인덱스 trace와 운영 메모를 개발 환경에서만 다시 읽는 disclosure에 가깝다.
- 따라서 current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` `primaryPath`/`status.message` disclosure ownership copy/helper spike여야 한다. build endpoint 변경, button semantics 변경, `canAutoBuild`/disabled 조건 변경, build result semantics 재정의, env/operator disclosure contract 재설계, status schema 변경, route/href 변경, stable/public IA 재편은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-24 settings-data-sources OpenDartStatusCard primaryPath-status.message disclosure ownership post-spike doc sync):
- primaryPath-status.message disclosure ownership copy/helper polish는 landing했고, 실제 변경 범위는 `개발용 인덱스 정보만 보기` helper tone, `인덱스 파일 경로` 주변 helper, `개발용 운영 메모` label/helper tone 조정까지다.
- build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, `status.message` source semantics, `primaryPath` provenance 정의, details open/closed interaction, status schema, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 disclosure wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` missing-index user-facing warning ownership docs-first memo 정도로만 좁히는 것이다. raw `status.message` 승격, build/button/disclosure contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-24 settings-data-sources OpenDartStatusCard missing-index user-facing warning ownership candidate memo audit):
- `!exists && status?.message`일 때 보이는 좌측 amber warning block은 raw `status.message`를 노출하는 current-state warning이 아니라, 위 user summary와 `지금 읽는 기준`을 읽은 뒤에 제한 상태를 한 번 더 짚어 주는 user-facing secondary helper로 읽는 편이 맞다.
- 이 block은 dev-only disclosure layer가 아니라 좌측 user-facing 영역 안의 보조 주의/helper 층위에 가깝고, `개발용 인덱스 정보만 보기` details나 하단 `buildNotice`/`buildError`와 같은 operator/dev memo 층위로 올리면 안 된다.
- 따라서 current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` missing-index user-facing warning ownership copy/helper spike여야 한다. raw `status.message` 승격, `status.message` source semantics 변경, build/button/disclosure contract 재설계, show/hide 조건 변경, status schema 변경, route/href 변경은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-24 settings-data-sources OpenDartStatusCard missing-index user-facing warning ownership post-spike doc sync):
- missing-index user-facing warning ownership copy/helper polish는 landing했고, 실제 변경 범위는 좌측 amber warning block label, warning 본문 tone, user-facing secondary helper 한 줄 조정까지다.
- raw `status.message` 위치, warning show/hide 조건, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, details disclosure 구조, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 missing-index warning wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` loading-error empty-state helper ownership docs-first memo 정도로만 좁히는 것이다. fetch/status contract reopen, raw `status.message` 승격, build/button/disclosure contract 재설계는 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard loading-error empty-state helper ownership candidate memo audit):
- `상태를 불러오는 중...`은 `지금 읽는 기준` 안에서 read-through basis 확인을 잠시 보류하는 transitional helper로 읽는 편이 맞다. fetch error와 `정보 없음`도 같은 fallback slot에 있지만, 실패와 빈 상태를 같은 의미로 합치기보다 read-through basis 부재의 서로 다른 이유로 구분하는 편이 안전하다.
- 이 fallback slot은 좌측 user-facing 영역 안의 read-through basis 보조 상태/helper 층위다. `사용자에게 먼저 보이는 기준` primary summary보다 뒤에 오고, missing-index secondary helper나 우측 dev-only disclosure, 하단 build result helper와 같은 층위로 섞으면 안 된다.
- 따라서 current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` loading-error empty-state helper ownership copy/helper spike여야 한다. fetch/status contract 재설계, raw `status.message` 승격, build/button/disclosure contract 재설계, status schema 변경, route/href 변경은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard loading-error empty-state helper ownership post-spike doc sync):
- loading-error empty-state helper ownership copy/helper polish는 landing했고, 실제 변경 범위는 `지금 읽는 기준을 확인하는 중입니다...`, loading helper 한 줄, `지금 읽는 기준을 아직 불러오지 못했습니다.`, fetch error helper 한 줄, `지금 읽는 기준 정보가 아직 없습니다.`, empty placeholder helper 한 줄 조정까지다.
- `fetchStatus()` response contract, 409/null handling, `status` null 처리 로직, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, details disclosure 구조, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 loading/error/empty wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` API-key badge-primary-summary ownership docs-first memo 정도로만 좁히는 것이다. `configured` boolean semantics, `userSummary()` 분기, env/operator disclosure contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard API-key badge-primary-summary ownership candidate memo audit):
- 우측 `API 키 연결됨/설정 필요` badge는 `configured` 여부를 한눈에 보여 주는 summary-adjacent status chip이고, 좌측 `사용자에게 먼저 보이는 기준`은 같은 signal을 사용자 흐름 관점에서 풀어 쓰는 primary summary로 읽는 편이 맞다.
- badge와 primary summary는 같은 근거를 공유하지만 완전한 중복은 아니다. badge는 설정 준비 여부를 빠르게 스캔하게 하고, primary summary는 그 상태가 회사 검색과 공시 상세에 어떤 의미인지 설명하는 서로 다른 읽는 층위를 가진다.
- 따라서 current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` API-key badge-primary-summary ownership copy/helper spike여야 한다. `configured` boolean semantics 변경, `userSummary()` 분기 변경, env/operator disclosure contract 재설계, build/button/disclosure 구조 변경, route/href 변경은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard API-key badge-primary-summary ownership post-spike doc sync):
- API-key badge-primary-summary ownership copy/helper polish는 landing했고, 실제 변경 범위는 badge 아래 quick-status helper 한 줄과 `사용자에게 먼저 보이는 기준` 안의 순서 helper 한 줄 조정까지다.
- `configuredLabel`, `userSummary()` 분기, badge 색상/배치/크기, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 badge-summary wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` section-header helper ownership docs-first memo 정도로만 좁히는 것이다. `configured` semantics, `userSummary()` 분기, env/operator disclosure contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard section-header helper ownership candidate memo audit):
- `공시 데이터 연결 상태` 아래 helper는 card 전체의 top-level orientation layer이면서, 상단 badge-summary를 먼저 읽고 dev-only 관리 구간은 아래에서만 보게 만드는 reading-order bridge helper로 읽는 편이 맞다.
- 현재 한 문장이 user-facing trust orientation과 dev-only boundary 안내를 함께 맡고 있어 층위가 맞닿아 있지만, 우선은 copy/helper만으로도 읽는 순서를 더 또렷하게 좁힐 수 있다.
- 따라서 current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` section-header helper ownership copy/helper spike여야 한다. `configured` semantics 변경, `userSummary()` 분기 변경, env/operator disclosure contract 재설계, card top-level information architecture 재배치, route/href 변경은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard section-header helper ownership post-spike doc sync):
- section-header helper ownership copy/helper polish는 landing했고, 실제 변경 범위는 `공시 데이터 연결 상태` 아래 helper 한 줄을 `상단 상태 표시와 사용자용 요약`을 먼저 읽고 `아래 관리 구간`은 나중에 확인하게 만드는 reading-order bridge tone으로 조정한 것까지다.
- `configured` boolean semantics, `userSummary()` 분기, badge quick-status helper, `사용자에게 먼저 보이는 기준` helper, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 section-header wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` read-through basis facts ownership docs-first memo 정도로만 좁히는 것이다. `지금 읽는 기준`의 정상 intro/facts block이 top summary, fallback slot, dev-only layers와 어떤 층위로 읽히는지부터 좁히고, `configured` semantics, `userSummary()` 분기, fetch/status/build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard read-through-basis-facts ownership candidate memo audit):
- `지금 읽는 기준`의 정상 intro sentence와 fact rows (`인덱스 준비`, `마지막 생성 기준`, `회사 수`)는 top summary 뒤에서 현재 회사 검색/공시 상세가 어떤 basis로 읽히는지 닫아 주는 primary read-through basis layer로 읽는 편이 맞다. dev-only disclosure나 support evidence layer로 올리기보다 user-facing current basis facts로 유지하는 쪽이 안전하다.
- loading/error/empty는 이 basis layer를 잠시 대신하는 fallback slot이고, missing-index helper는 basis facts를 읽은 뒤 제한 상태를 한 번 더 짚는 secondary helper다. 우측 dev-only disclosure와 build action/result helper는 source와 독자가 다른 별도 layer로 계속 분리해 두는 편이 맞다.
- 따라서 current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` read-through basis facts ownership copy/helper spike여야 한다. `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure contract 재설계, route/href 변경은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard read-through-basis-facts ownership post-spike doc sync):
- read-through-basis-facts ownership copy/helper polish는 landing했고, 실제 변경 범위는 `지금 읽는 기준` 정상 intro sentence를 `개발용 메모가 아니라 ... 현재 기준`으로 조정하고, facts rows를 `인덱스 준비 상태`, `마지막 생성 시점`, `반영된 회사 수`로 고친 것까지다.
- `configured` boolean semantics, `userSummary()` 분기, `fetchStatus()` 로직, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 facts block wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row scan-hierarchy docs-first memo 정도로만 좁히는 것이다. `인덱스 준비 상태`, `마지막 생성 시점`, `반영된 회사 수` 3개 row를 사용자가 어떤 순서와 위계로 훑어야 하는지부터 좁히고, `configured` semantics, `userSummary()` 분기, `fetchStatus()` contract, status schema, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row scan-hierarchy candidate memo audit):
- `인덱스 준비 상태`, `마지막 생성 시점`, `반영된 회사 수` 3개 facts row는 같은 층위의 current basis facts이지만, 사용자는 readiness → freshness → coverage 순서로 훑는 편이 가장 자연스럽다. 따라서 첫 row는 `인덱스 준비 상태`, 둘째 row는 `마지막 생성 시점`, 셋째 row는 `반영된 회사 수`로 읽는 scan hierarchy를 기본 가정으로 둔다.
- 이 row trio는 top summary와 `사용자에게 먼저 보이는 기준` 뒤에서 current basis facts를 닫는 layer로 유지되고, loading/error/empty는 이 layer를 잠시 대신하는 fallback slot, missing-index helper는 그 뒤의 secondary helper, dev-only disclosure와 build action/result helper는 별도 operator/dev layer로 계속 분리해 두는 편이 맞다.
- 따라서 current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row scan-hierarchy copy/helper spike여야 한다. copy/helper로 readiness → freshness → coverage 읽기 순서만 더 또렷하게 만들고, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row scan-hierarchy post-spike doc sync):
- facts-row scan-hierarchy copy/helper polish는 landing했고, 실제 변경 범위는 facts trio intro helper를 `아래 세 항목은 순서대로 준비 여부, 마지막 생성 시점, 반영 범위를 읽는 현재 기준입니다.`로 조정하고, row labels를 `1. 인덱스 준비 상태`, `2. 마지막 생성 시점`, `3. 반영된 회사 수`로 정리한 것까지다.
- 실제 row 순서, source-of-truth, show/hide 조건, date/count formatting rule, `configured` boolean semantics, `userSummary()` 분기, `fetchStatus()` 로직, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 facts-row scan-hierarchy wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row value-emphasis docs-first memo 정도로만 좁히는 것이다. 번호 prefix와 현재 row values가 readiness/freshness/coverage를 충분히 닫아 주는지부터 확인하고, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics, `userSummary()`, `fetchStatus()` contract, status schema, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row value-emphasis candidate memo audit):
- 현재 value emphasis는 row별로 충분도가 다르다. `1. 인덱스 준비 상태` value는 번호 prefix, 첫 row 위치, `준비됨`/`확인 필요` binary wording, color contrast 덕분에 trio 안에서 가장 강한 primary readiness signal로 읽힌다. `3. 반영된 회사 수` value도 굵은 숫자 강조 덕분에 coverage breadth를 닫는 보조 fact로는 충분한 편이다.
- 반면 `2. 마지막 생성 시점` value는 label과 위치 덕분에 freshness row라는 점은 읽히지만, raw timestamp 자체는 “얼마나 최근 기준인가”를 사용자 해석에 더 맡기는 편이라 trio 안에서 가장 약한 value emphasis로 남아 있다. 현재 상태도 basis fact로는 유지 가능하지만, 추가 보강이 필요하다면 copy/helper 차원에서만 freshness meaning을 좁게 닫는 쪽이 안전하다. [검증 필요]
- 따라서 current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row freshness-read helper docs-first memo여야 한다. row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row freshness-read helper candidate memo audit):
- `2. 마지막 생성 시점` row는 trio 안에서 support evidence가 아니라 freshness anchor로 유지하는 편이 맞다. raw timestamp는 마지막 생성 기준 시점이라는 사실 자체는 충분히 보여 주지만, “이 시점이 지금 공시 검색과 상세 화면의 현재 기준과 어떻게 연결되는가” 해석은 여전히 사용자에게 더 맡기는 편이다. [검증 필요]
- 따라서 helper를 다시 연다면 stale 판정이나 상대 시간 계산이 아니라, 이 timestamp가 user-facing current basis facts layer 안에서 어떤 의미를 갖는지 한 줄로 닫아 주는 copy/helper 정도로만 좁히는 편이 안전하다. 이 질문은 top summary, loading/error/empty fallback slot, missing-index helper, dev-only disclosure와는 계속 분리해 다뤄야 한다. [검증 필요]
- current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row freshness-read helper copy/helper spike여야 한다. row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row freshness-read helper post-spike doc sync):
- facts-row freshness-read helper copy/helper polish는 landing했고, 실제 변경 범위는 `2. 마지막 생성 시점` row를 label/value 줄과 helper 한 줄로만 벌리고, raw timestamp 아래에 `위 시점은 현재 공시 검색과 상세 화면이 마지막으로 읽는 생성 기준입니다.` 문구를 추가한 것까지다.
- row 순서, source-of-truth, show/hide 조건, timestamp formatting rule, stale 여부 판단, 상대 시간 계산, freshness badge/warning tone, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 freshness-read helper를 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row coverage-read helper docs-first memo 정도로만 좁히는 것이다. `3. 반영된 회사 수` value가 현재 공시 검색/상세 화면의 반영 범위를 어디까지 뜻하는지부터 확인하고, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics, `userSummary()`, `fetchStatus()` contract, status schema, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row coverage-read helper candidate memo audit):
- `3. 반영된 회사 수` row는 trio 안에서 단순 support evidence보다 한 단계 위인 coverage breadth fact로 유지하는 편이 맞다. 다만 현재 raw count는 “얼마나 많이 반영됐는가” 규모감은 주지만, 이 숫자가 현재 공시 검색/상세 화면의 반영 범위를 어떤 뜻으로 보여 주는지 해석은 여전히 사용자에게 더 맡기는 편이다. [검증 필요]
- 따라서 helper를 다시 연다면 total-market 보장, completeness 판단, 누락 경고를 추가하는 대신, 이 count가 현재 공시 검색/상세 화면에 반영된 회사 범위를 읽는 기준이라는 뜻만 한 줄로 닫아 주는 copy/helper 정도로만 좁히는 편이 안전하다. 이 질문은 top summary, readiness/freshness rows, loading/error/empty fallback slot, missing-index helper, dev-only disclosure와 계속 분리해 다뤄야 한다. [검증 필요]
- current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row coverage-read helper copy/helper spike여야 한다. row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row coverage-read helper post-spike doc sync):
- facts-row coverage-read helper copy/helper polish는 landing했고, 실제 변경 범위는 `3. 반영된 회사 수` row를 label/value 줄과 helper 한 줄로만 벌리고, raw count 아래에 `위 수는 현재 공시 검색과 상세 화면에 반영된 회사 범위를 읽는 기준입니다.` 문구를 추가한 것까지다.
- row 순서, source-of-truth, show/hide 조건, count formatting rule, total-market 보장, completeness 판정, 누락 경고, coverage badge, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, freshness helper wording, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract는 그대로 유지됐다.
- 따라서 current next `N5` question은 coverage-read helper를 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row helper-saturation docs-first memo 정도로만 좁히는 것이다. 지금 intro, freshness helper, coverage helper 조합이 facts trio 의미를 충분히 닫는지부터 확인하고, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics, `userSummary()`, `fetchStatus()` contract, status schema, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row helper-saturation candidate memo audit):
- 현재 facts trio layer에서 `지금 읽는 기준` intro는 readiness → freshness → coverage 순서를 먼저 선언하고, `2. 마지막 생성 시점` helper와 `3. 반영된 회사 수` helper는 raw timestamp와 raw count가 각각 무엇을 뜻하는지 닫아 준다. 이 조합 덕분에 row-level meaning closure는 현재 범위에서는 대체로 충분한 편이다. [검증 필요]
- 남아 있는 애매함이 있다면 그것은 row 순서, source-of-truth, show/hide 조건, formatting rule, completeness/total-market semantics 같은 계약 층위에 더 가깝다. 따라서 지금 여기서 helper를 한 줄 더 붙이기 시작하면 small-surface copy polish보다 facts layer와 helper layer 경계를 다시 만지는 IA 재조정으로 쉽게 커질 수 있다. top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure/build helper와의 읽는 경계도 현재 상태에서는 비교적 잠긴 편으로 본다. [검증 필요]
- current next `N5` cut은 broad OpenDART card rewrite나 추가 row-level helper spike가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row stop-line docs-first memo 정도로 두는 편이 안전하다. 현 조합을 stop line으로 둘지 먼저 문서로 확정하고, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, total-market/completeness semantics 추가, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row stop-line candidate memo audit):
- 현재 facts trio layer는 `지금 읽는 기준` intro가 read-through frame을 주고, `2. 마지막 생성 시점` helper와 `3. 반영된 회사 수` helper가 각각 freshness anchor와 coverage breadth fact의 raw value meaning을 닫아 주는 구조라서, 이 레이어만 놓고 보면 이미 stop line 후보로 둘 수 있는 수준에 가깝다. [검증 필요]
- 남아 있는 불편이 있더라도 그것은 helper 한 줄 부족보다 row 순서, source-of-truth, show/hide 조건, formatting rule, total-market/completeness semantics, `fetchStatus()`/status schema 계약 같은 다른 층위 문제일 가능성이 크다. top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure/build helper와 facts trio layer 사이의 경계도 현재 상태에서는 비교적 잠겨 있다고 보는 편이 안전하다. [검증 필요]
- current next `N5` cut은 broad OpenDART card rewrite나 새 helper spike가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row stop-line closeout docs-only sync 정도로만 좁히는 편이 맞다. 현 조합을 사실상 종료선으로 둘지 문서에서 먼저 닫고, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, total-market/completeness semantics 추가, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard facts-row stop-line closeout docs-only sync):
- facts trio layer는 현재 `지금 읽는 기준` intro, `2. 마지막 생성 시점` helper, `3. 반영된 회사 수` helper 조합을 기준으로 일단 닫는 편이 맞다. 이 closeout에서 확정하는 것은 현 조합이 facts trio layer 내부에서는 더 이상 future stop-line candidate가 아니라 현재 종료선으로 읽힌다는 상태다. [검증 필요]
- `src/components/OpenDartStatusCard.tsx` 구현, row 순서, source-of-truth, show/hide 조건, formatting rule, total-market/completeness semantics, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, build/button/disclosure/route contract는 바뀌지 않는다. top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure/build helper와의 경계도 facts trio layer 기준에서는 현재 상태로 잠근다. [검증 필요]
- 따라서 current next question은 더 이상 facts trio를 더 다듬을지 여부가 아니라, 이 카드에서 정말 남아 있는 smallest docs-first cut이 있는지 아니면 다른 surface로 넘어갈지다.
- if this route stays in scope, safest next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` residual-cut triage docs-first memo 정도로만 좁히는 것이다. facts trio layer는 reopen하지 않고, 이 카드 안에 정말 남은 docs-only 미세 조정이 있는지부터 확인한다. row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, total-market/completeness semantics 추가, `configured` semantics, `userSummary()`, `fetchStatus()` contract, status schema, build/button/disclosure/route contract reopen은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard residual-cut triage candidate memo audit):
- 현재 `OpenDartStatusCard` 안에서 facts trio를 다시 열지 않는다는 전제를 두면, 남아 있는 애매함이 별도 micro docs-first cut으로 안정적으로 분리되는 지점은 거의 보이지 않는다. top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure/build helper 중 남은 질문이 있더라도 작은 copy/helper 보강보다 layer 경계나 contract 의미를 다시 건드릴 가능성이 더 크다. [검증 필요]
- 따라서 이 카드 내부의 smallest viable next candidate는 `none for now`로 두는 편이 맞다. 남은 애매함은 row-level helper 부족보다는 `configured` semantics, `userSummary()` 분기, `fetchStatus()` contract, status schema, build/button/disclosure/route contract와 더 가까운 층위 문제라서, docs-only micro cut으로 억지로 남기면 broad IA/contract reopen으로 커지기 쉽다. [검증 필요]
- current next question은 더 이상 “이 카드 안에서 무엇을 더 다듬을 것인가”가 아니라, 이 카드를 현재 상태에서 닫고 다른 surface로 넘어갈지 여부다. broad OpenDART card rewrite는 closeout된 facts trio와 상하위 layer 경계를 한 번에 다시 여는 위험이 커서 현 시점에서는 권장하지 않는다. [검증 필요]

연결 메모 (2026-03-25 settings-data-sources OpenDartStatusCard residual-cut triage closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 `OpenDartStatusCard` 내부 residual ambiguity가 현재 상태에서는 stable한 micro docs-first cut으로 더 분리되지 않는다는 판단이다. facts trio closeout 이후 card-internal smallest viable next candidate는 `none for now`로 잠근다. [검증 필요]
- `src/components/OpenDartStatusCard.tsx` 구현, facts trio layer, top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure 구조, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, build/button/disclosure/route contract는 바뀌지 않는다. 이번 closeout은 새 spike를 만들지 않고 현재 경계만 문서에 고정하는 작업이다. [검증 필요]
- 따라서 current next question은 더 이상 “이 카드 안에서 무엇을 더 다듬을 것인가”가 아니라, 이 카드를 닫고 다음 stable surface로 넘어갈지 여부다. current next `N5` cut도 더 이상 이 카드 내부 future question으로 남기지 않고 `none for now` closeout 상태로 둔다. [검증 필요]
- 이후 reopen이 필요하면 micro copy polish가 아니라 별도 contract/IA question으로 승격해 다시 열어야 한다. broad OpenDART card rewrite와 card-internal micro spike를 같은 큐에 다시 묶지 않는다. [검증 필요]

연결 메모 (2026-03-25 settings-trust-hub route-cluster post-polish closeout memo):
- 현재 settings/trust-hub cluster 안에서 실제로 landing한 범위는 `/settings` host-surface entry hierarchy와 `/settings/data-sources` trust/freshness owner landed scope다. `OpenDartStatusCard` residual-cut triage closeout으로 card-internal smallest viable next candidate도 현재 `none for now`로 잠겼고, 이 카드 안에서 새 micro spike를 다시 만들지 않는다. [검증 필요]
- 이번 closeout에서 defer로 남기는 것은 `/settings/alerts`, `/settings/backup`, `/settings/recovery`, `/settings/maintenance`다. landed된 `/settings` host, parked된 `/settings/data-sources`, defer route를 묶어 “settings family 전체 구현 완료”처럼 읽지 않는 편이 맞다. [검증 필요]
- route/href contract, trust/data-source health/freshness policy, alerts rule/preset/filter/regex semantics, backup/recovery/maintenance side-effect semantics, build/ping/storage/event contract, stable/public IA는 바뀌지 않는다.
- 따라서 current next question은 더 이상 settings cluster 내부의 새 micro spike가 아니라, 이 cluster를 current parked 상태로 둘 수 있는지 여부다. future reopen trigger는 trust/data-source or build/ping/storage/event contract, alerts rule semantics, backup/recovery/maintenance side-effect flow, route/href contract, stable/public IA, 또는 defer route가 trigger-specific docs-first question으로 다시 좁혀지는 경우로만 한정한다. wording sync만으로는 reopen trigger가 아니다. [검증 필요]

연결 메모 (2026-03-25 stable-public remaining-surface reselection audit):
- `/feedback` route cluster는 current closeout memo 기준으로 parked 상태를 유지한다. wording sync, current inventory 재확인만으로는 reopen trigger가 아니므로 이번 remaining-surface reselection에서는 제외한다.
- current remaining cluster를 다시 보면 `planning stable surface`는 여전히 broad result-flow 축이고, `products/public/explore`는 남은 중심 surface가 freshness/source/disclosure helper와 더 가깝고, `settings/trust-hub`는 남은 route가 rule/filter 또는 operator semantics에 더 가깝다. 세 축 모두 현재 docs-first 기준으로는 safe micro cut이 뚜렷하지 않다. [검증 필요]
- 반면 `recommend` cluster는 history, host pre-result, result-header, planning-linkage strip small cut이 landing한 현재 상태라, 남은 최소 작업이 새 UI spike보다 cluster-level closeout sync에 더 가깝다. current smallest viable next candidate는 `recommend route-cluster post-polish closeout memo`다. [검증 필요]
- 따라서 current next `N5` cut은 broad stable/public rewrite가 아니라 `recommend route-cluster post-polish closeout memo` 같은 docs-first closeout sync여야 한다. planning result-flow 재설계, products compare/filter/store semantics 변경, settings trust/ops policy 변경, stable/public IA 재편은 계속 비범위다. [검증 필요]

연결 메모 (2026-03-25 stable-public post-cluster-closeout reselection audit):
- `/feedback`, `recommend`, `products/public/explore`, `settings/trust-hub` cluster는 모두 current closeout memo 기준으로 parked baseline이 잠겼다. 이번 시점의 current remaining stable/public cluster는 사실상 `planning stable surface` 하나뿐이다.
- 다만 `/planning` host는 quick-start/save-run과 `/planning/runs`·`/planning/reports` deep-link를 함께 쥐고 있고, `/planning/runs`는 history/compare/report/trash follow-through를 같이 다루며, `/planning/reports`·`/planning/reports/[id]`·`/planning/trash`도 report save, recommend/product follow-through, restore/delete semantics를 서로 강하게 공유한다. apparent narrow candidate가 보여도 stable한 micro docs-first cut으로 분리되기 어렵다. [검증 필요]
- 따라서 current smallest viable next candidate는 현재 `none for now`로 두는 편이 맞다. broad stable/public rewrite는 물론, planning stable surface 안의 억지 micro spike도 current next question으로 남기지 않는다. [검증 필요]
- future reopen trigger는 planning run/report/trash contract, route/href contract, result-flow/IA question이 trigger-specific docs-first question으로 다시 좁혀지는 경우로만 한정한다. wording sync나 current inventory 재확인만으로는 reopen trigger가 아니다. [검증 필요]

연결 메모 (2026-03-25 stable-public none-for-now closeout docs-only sync):
- 이번 closeout에서 확정하는 것은 `/feedback`, `recommend`, `products/public/explore`, `settings/trust-hub` cluster가 모두 parked baseline으로 잠겼고, current remaining stable/public surface인 `planning stable surface`도 현재 기준에서는 stable한 micro docs-first cut으로 더 분리되지 않는다는 상태다. [검증 필요]
- `src/app/planning/**` 구현, route/href contract, planning run/report/trash result-flow contract, compare/filter/store semantics, settings trust/ops policy, freshness/source/build/store policy, stable/public IA는 바뀌지 않는다. 이번 closeout은 새 spike를 만들지 않고 경계만 문서에 잠그는 작업이다.
- 따라서 current smallest viable next candidate는 현재 `none for now`로 둔다. current next question도 더 이상 “다음 micro spike를 무엇으로 둘 것인가”가 아니라, trigger-specific reopen이 실제로 생겼는지 여부로 바뀐다. [검증 필요]
- future reopen trigger는 planning run/report/trash contract, route/href contract, result-flow/IA question, 또는 기타 trigger-specific docs-first question으로만 한정한다. wording sync나 closeout memo 보강, current inventory 재확인만으로는 reopen trigger가 아니다. [검증 필요]

---

## 4. 권장 우선순위

다음 사이클 공식 우선순위는 아래 순서로 고정합니다.

1. `N1` planning/v3 canonical entity model 정의
2. `N2` planning/v3 API / import-export / rollback contract 정의
3. `N3` QA gate 재정의와 golden dataset 기준 정리
4. `N4` planning/v3 beta exposure / visibility policy
5. `N5` public/stable UX polish backlog

정리:
- `planning/v3`는 public beta 노출 확대보다 canonical model과 contract를 먼저 닫습니다.
- `QA gate 재정의`는 v3 계약 정의에 종속되지만, release policy와 stable/beta/ops-dev 경계를 다시 세우는 별도 backlog이므로 독립 항목으로 둡니다.
- 사용자 문구 polish는 독립 대형 축이 아니라 후순위의 작은 보조 backlog로 둡니다.

---

## 5. 선행 조건과 연결 규칙

- `N1`이 닫히기 전:
  새 v3 stable route, broad beta exposure, public-facing copy 확장 금지
- `N2`가 닫히기 전:
  import/export/rollback behavior를 화면별 예외로 늘리지 않음
- `N3`가 닫히기 전:
  stable/beta/ops-dev를 같은 release gate로 다루지 않음
- `N4`가 닫히기 전:
  v3 route를 public stable처럼 문서/헤더/홈에 노출하지 않음
- `N5`는 항상:
  contract-first backlog를 막지 않는 small-batch 보조 개선으로만 연다

---

## 6. 현재 로드맵과의 연결

- `financeproject_next_stage_plan.md`는 `P1 ~ P3` 완료 로드맵으로 유지합니다.
- 다음 구현 사이클의 공식 backlog는 이 문서(`11_post_phase3_vnext_backlog.md`)를 기준으로 시작합니다.
- 기존 완료 항목은 reopen하지 않고, 필요하면 `N1 ~ N5` backlog 아래의 후속 계약/정책/노출 작업으로만 이어집니다.

---

## 7. 이번 단계 결론

- post-Phase-3의 공식 backlog는 `N1 ~ N5` 다섯 항목으로 제한합니다.
- 다음 사이클의 1순위는 `planning/v3 canonical entity model 정의`입니다.
- public beta 노출 확대보다 canonical contract와 QA gate를 먼저 고정합니다.
- UX polish는 별도 대형 축이 아니라 보조 backlog로 내립니다.
