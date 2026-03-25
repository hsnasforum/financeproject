# 2026-03-22 N2 categorized-transfers parity doc sync

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-categorized-transfers-parity-doc-sync.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: `ImportBatch / TransactionRecord` 섹션에서 categorized/transfers의 stored-first visible binding parity 설명만 최소 범위로 좁혀 문서 drift를 정리했다.
- `planning-gate-selector`: docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 골랐다.
- `work-log-closeout`: 실제 변경 문서, 실행 검증, 미실행 검증, 남은 contract 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- 최근 `N2` 라운드에서 `categorized`와 `transfers`도 same-id coexistence에서 stored-first visible binding parity를 맞췄지만, `analysis_docs/v2/13...`에는 여전히 summary/cashflow 중심 설명만 남아 있었다.
- 특히 `getStoredFirstBatchSummaryProjectionRows()`가 summary 입력으로만 보이거나, `transfers`가 legacy/stored 직접 조합처럼 읽히는 문구는 최신 코드와 어긋났다.
- 이번 라운드는 구현을 다시 건드리지 않고 `3.2 ImportBatch / TransactionRecord`의 stale memo만 정확히 코드 기준으로 동기화하는 것이 목표였다.

## 핵심 변경
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `current mixed ownership snapshot`에서 `categorized`와 `transfers`가 `getStoredFirstBatchSummaryProjectionRows()`를 재사용해 same-id coexistence에서도 stored-first visible binding view를 읽는 현재 상태를 반영했다.
- 같은 문서의 affected readers와 same-id coexistence visible reader 목록에 `categorized`, `transfers`, `generateDraftPatchFromBatch.ts`를 추가해 reader facade 범위를 최신 코드와 맞췄다.
- `contract 메모`에는 `categorized`, `transfers`, `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch.ts`까지 read-side consumer parity가 맞춰졌지만, writer owner 자체를 canonical stored writer로 재정의한 것은 아니라는 점과 same-id coexistence writer merge, dual-write, row rewrite, index repair가 여전히 비범위라는 점을 추가했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 2026-03-22 연결 메모를 한 줄 보강해 categorized/transfers 포함 stored-first visible binding parity까지 문서-코드 동기화가 끝났음을 남겼다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-categorized-transfers-parity-doc-sync.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only라 code-side helper나 route를 다시 수정하거나 재검증하지 않았다.
- categorized/transfers support surface parity는 문서에 반영했지만, same-id coexistence writer merge, dual-write, legacy migration, row rewrite, index repair는 여전히 후속 `N2` 범위다.
- `ImportBatch / TransactionRecord`는 여전히 read facade와 writer owner가 분리된 mixed ownership 상태이므로 single-owner read/write contract로 해석하면 안 된다.
