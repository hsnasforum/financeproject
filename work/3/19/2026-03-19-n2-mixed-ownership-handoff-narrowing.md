# 2026-03-19 N2 mixed ownership handoff narrowing

## 변경 파일

- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/19/2026-03-19-n2-mixed-ownership-handoff-narrowing.md`

## 사용 skill

- `planning-gate-selector`: docs/audit-only 라운드라 required `git diff --check`만 실행하는 검증 범위를 고정하는 데 사용
- `work-log-closeout`: 이번 handoff narrowing 결과와 다음 구현 cut을 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `N1` code audit 이후에도 `ImportBatch` / `TransactionRecord`, draft family, `txnOverridesStore`는 write owner와 read facade, legacy bridge가 한 문서 안에서 충분히 분리돼 있지 않았다.
- 이 상태에서는 후속 `N2` 구현 배치가 broad rewrite로 번지거나, canonical owner와 reader facade를 다시 섞어 해석할 위험이 있었다.
- 이번 라운드는 코드 수정 없이 `reader facade / writer owner / legacy bridge` 구분과 다음 구현 cut을 최소 단위로 잠그는 데 집중했다.

## 핵심 변경

- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`에 `reader facade / writer owner / legacy bridge` 공통 정의를 추가했다.
- `ImportBatch` / `TransactionRecord` 섹션에 current mixed ownership snapshot을 넣고, batch list/detail/summary, balances, draft-profile generation read가 아직 pure canonical facade가 아님을 명시했다.
- draft family 섹션에 csv draft owner, profile draft owner, shared facade, stable apply bridge를 분리해 적고 `draft family facade split` 후속 cut을 추가했다.
- override family 섹션에 batch-scoped canonical owner와 legacy unscoped dev bridge를 분리하고 `legacy override bridge containment` cut을 추가했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N2` 항목에 이번 narrowing audit과 후속 3개 cut 연결 메모를 짧게 남겼다.

## 좁힌 mixed ownership 축

- `ImportBatch` / `TransactionRecord`
  - batch list/detail/summary
  - balances read
  - profile draft generation read
- `CsvDraftRecord` / `ProfileDraftRecord`
  - persistence root
  - shared facade
  - import / preview / apply / stable profile bridge
- `TxnOverride`
  - batch-scoped canonical owner
  - legacy unscoped bridge의 dev/internal 잔존 범위

## reader facade / writer owner / legacy bridge 구분

- batch family
  - writer owner: `importCsvToBatch.ts`, `store/batchesStore.ts`
  - reader facade: `batches/store.ts`, `transactions/store.ts`, `/api/planning/v3/batches`, `/api/planning/v3/batches/[id]/summary`, `/api/planning/v3/transactions/batches/[id]`, `/api/planning/v3/balances/monthly`, `/api/planning/v3/draft/profile`
  - legacy bridge: `service/transactionStore.ts`
- draft family
  - writer owner: `drafts/draftStore.ts` (`CsvDraftRecord`), `store/draftStore.ts` (`DraftProfileRecord`)
  - reader facade: `draft/store.ts`, `/api/planning/v3/drafts*`, `/api/planning/v3/profile/drafts*`, preview/preflight routes
  - legacy bridge: shared `draft/store.ts` facade, stable profile apply/create-profile bridge, `profiles/store.ts` facade
- override family
  - writer owner: `txnOverridesStore.ts`의 batch-scoped override persistence
  - reader facade: `getOverrides(batchId)`를 읽는 summary/detail/balances/draft/categorized/cashflow surface
  - legacy bridge: `listLegacyOverrides()`, dev-only `/api/planning/v3/transactions/overrides`

## 후속 구현 cut

- `batch read owner narrowing`
  - `getBatchSummary.ts`, `/api/planning/v3/transactions/batches/[id]`, `/api/planning/v3/balances/monthly`, `generateDraftPatchFromBatch.ts`, `/api/planning/v3/draft/profile`
- `draft family facade split`
  - `src/lib/planning/v3/draft/store.ts`, `/api/planning/v3/drafts*`, `/api/planning/v3/profile/drafts*`, support/internal `/api/planning/v3/draft/*`
- `legacy override bridge containment`
  - `txnOverridesStore.ts`, `/api/planning/v3/transactions/overrides`, 관련 facade re-export

## 실행한 검증

- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/19/2026-03-19-n2-mixed-ownership-handoff-narrowing.md`

## 미실행 검증

- `pnpm lint`
- `pnpm build`
- `pnpm test`
- `pnpm e2e:rc`
- 이유: 이번 라운드는 docs/audit-only라 사용자 지시의 required diff check만 실행했다.

## 남은 리스크

- batch family는 canonical writer가 있어도 user-facing read surface가 아직 dual-read를 유지해, 후속 구현에서 stored-first와 stored-only 경계를 어디까지 강제할지 다시 판단해야 한다.
- draft family는 facade와 apply bridge가 계속 함께 보이면 route 이름만으로 owner를 오해할 가능성이 남는다.
- `[미확인]` `/api/planning/v3/transactions/batches` list route는 이번 라운드에서 다시 읽지 않아, list surface의 legacy bridge 잔존 정도는 다음 cut에서 재확인하는 편이 안전하다.
