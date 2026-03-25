# 2026-03-19 N1 canonical entity owner code audit

## 변경 파일

- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/19/2026-03-19-n1-canonical-entity-owner-code-audit.md`

## 사용 skill

- `planning-gate-selector`: docs/audit-only 라운드라 required `git diff --check`만 남기도록 검증 범위를 고정하는 데 사용
- `work-log-closeout`: 이번 audit 결과와 남은 owner boundary 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `N1` 문서는 canonical entity / owner / lifecycle을 먼저 잠갔지만, 이후 `N2` 일부 구현이 들어오면서 실제 code touchpoint와의 접점 snapshot이 필요해졌다.
- 특히 batch, transaction, draft, override family는 write owner와 read projection, legacy bridge가 동시에 남아 있어 문서만 보면 owner 경계가 더 깔끔해 보일 수 있었다.
- 이번 라운드는 구현을 더 열지 않고, 문서와 현재 코드가 어디까지 맞물리는지 audit snapshot으로 남기는 데 집중했다.

## 핵심 변경

- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 `2026-03-19 current code touchpoint snapshot` 섹션을 추가했다.
- entity/store/service/API를 `canonical write owner`, `derived projection / read model`, `legacy bridge / compatibility layer`, `unresolved / mixed ownership` 네 축으로 다시 분류했다.
- `ImportBatch` / `TransactionRecord`는 write path는 canonical batch store로 옮겨졌지만 list/detail/summary/balance read는 아직 dual-read 상태라는 점을 명시했다.
- draft family는 `CsvDraftRecord`와 `ProfileDraftRecord`가 서로 다른 persistence root를 쓰면서도 같은 facade를 공유한다는 mixed ownership을 문서에 직접 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N1` 항목에 code touchpoint audit 완료와 `N2` handoff 메모를 짧게 연결했다.

## 확인한 entity / owner 축

- canonical write owner
  - `Account`
  - `OpeningBalance`
  - `CategoryRule`
  - `TransactionAccountMappingOverride`
  - `TransactionTransferOverride`
  - `NewsSettings`
  - `ExposureProfile`
  - `ScenarioLibraryOverrides`
  - `JournalEntry`
- derived projection / read model
  - `getBatchSummary.ts`
  - `generateDraftPatchFromBatch.ts`
  - `aggregateMonthlyCashflow.ts`
  - `categorizeTransactions.ts`
  - `balances/monthly.ts`
  - `/api/planning/v3/batches`
  - `/api/planning/v3/batches/[id]/summary`
  - `/api/planning/v3/transactions/batches/[id]`
- legacy bridge / compatibility layer
  - `src/lib/planning/v3/service/transactionStore.ts`
  - `src/lib/planning/v3/batches/store.ts`
  - `src/lib/planning/v3/draft/store.ts`
  - `src/lib/planning/v3/store/txnOverridesStore.ts`
- unresolved / mixed ownership
  - `ImportBatch` / `TransactionRecord` read ownership
  - `CsvDraftRecord` / `ProfileDraftRecord` family
  - `DraftProfileRecord -> stable applied profile` handoff

## 문서와 코드가 맞는 지점

- `accountsStore.ts`, `openingBalancesStore.ts`, `categoryRulesStore.ts`, `accountMappingOverridesStore.ts`, `txnTransferOverridesStore.ts`는 문서상 canonical owner와 현재 API wiring이 거의 그대로 맞는다.
- `planning/v3/news/settings.ts`, `planning/v3/exposure/store.ts`, `planning/v3/scenarios/library.ts`, `planning/v3/journal/store.ts`도 singleton 또는 collection owner 구현이 문서와 크게 어긋나지 않는다.
- `N2 legacy override boundary hardening` 이후 public/user-facing read path가 `batch-scoped override`를 우선 읽는 방향은 문서 owner 경계와 맞게 정리됐다.

## 문서와 코드가 어긋나는 지점

- `transactionStore.ts`는 문서상 orchestration service처럼 읽히지만, 실제로는 legacy NDJSON persistence bridge도 함께 담당한다.
- `ImportBatch` / `TransactionRecord`는 canonical write owner가 생겼어도 summary/detail/balance/profile draft read path가 아직 legacy + stored dual-read를 유지한다.
- `CsvDraftRecord`와 `ProfileDraftRecord`는 문서 inventory상 분리되어 있지만, route facade `src/lib/planning/v3/draft/store.ts`가 두 family를 한 진입점으로 동시에 노출한다.
- `txnOverridesStore.ts`는 user-facing read path 정리가 끝났어도 module 안에는 legacy unscoped bridge helper가 남아 있어 pure canonical owner 상태는 아니다.
- `[미확인]` `NewsAlertRuleOverride` 실제 owner 구현(`src/lib/news/alerts.ts`)은 이번 audit 범위에서 재확인하지 못했다.

## 실행한 검증

- `git diff --check -- analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/19/2026-03-19-n1-canonical-entity-owner-code-audit.md`

## 미실행 검증

- `pnpm lint`
- `pnpm build`
- `pnpm test`
- `pnpm e2e:rc`
- 이유: 이번 라운드는 docs/audit-only라 사용자 지시의 required diff check만 실행했다.

## 남은 리스크

- batch detail/summary/balance/profile draft generation이 dual-read를 유지하는 동안에는 canonical write owner를 정해도 read ownership drift가 계속 남는다.
- draft family는 persistence root와 facade 경계가 엇갈려 있어 `N2`에서 contract를 더 열 때 namespace와 export/import 단위를 같이 다시 잠가야 한다.
- `[미확인]` `NewsAlertRuleOverride` owner 구현을 직접 다시 읽지 않았으므로, news alert 쪽 canonical/derived 경계는 다음 audit에서 한 번 더 확인하는 편이 안전하다.
