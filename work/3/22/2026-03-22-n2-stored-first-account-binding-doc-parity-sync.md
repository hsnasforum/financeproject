# 2026-03-22 N2 stored-first account binding doc parity sync

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-stored-first-account-binding-doc-parity-sync.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: `ImportBatch / TransactionRecord` 섹션의 stored-first account binding read contract 설명만 최소 범위로 좁혀 문서 drift를 정리하는 데 사용했다.
- `planning-gate-selector`: docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 골랐다.
- `work-log-closeout`: 실제 변경 문서, 실행 검증, 미실행 검증, 남은 contract 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- 최근 `N2` 라운드에서 detail shell, detail derived projection, `cashflow`, `getBatchSummary.ts`의 stored-first account binding read contract가 실제 코드에서는 정리됐지만, `analysis_docs/v2/13...`에는 이전 설명이 남아 있었다.
- 특히 detail batch shell이 legacy summary를 먼저 본다거나, `cashflow`와 `getBatchSummary.ts`가 여전히 raw rows를 직접 읽는 것처럼 보이는 문구는 최신 코드와 어긋났다.
- 이번 라운드는 구현을 다시 건드리지 않고 `3.2 ImportBatch / TransactionRecord`의 stale memo만 정확히 코드 기준으로 동기화하는 것이 목표였다.

## 핵심 변경
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `current mixed ownership snapshot`에서 detail route batch shell과 derived projection이 stored-first binding을 읽는 현재 상태를 반영했다.
- 같은 문서에 `getBatchSummary.ts`가 `getStoredFirstBatchSummaryProjectionRows()`를 통해 stored-first binding rows를 transfer/categorize/monthly 집계 입력으로 사용한다는 점을 추가했다.
- `cashflow`가 `getStoredFirstBatchBindingAccountId()`와 `applyStoredFirstBatchAccountBinding()`을 사용해 stored-first binding rows를 처리한다는 설명으로 보정했다.
- raw `data`는 detail route에서 그대로 유지하고, derived `transactions` / `sample` / `accountMonthlyNet`만 stored-first binding rows를 쓰는 계약을 분리해 적었다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 `N2` 연결 메모를 한 번 더 추가해 stored-first account binding read contract 문서-코드 동기화가 끝났음을 짧게 남겼다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-stored-first-account-binding-doc-parity-sync.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only라 code-side helper나 route를 다시 수정하거나 재검증하지 않았다.
- same-id coexistence writer merge, row rewrite, index repair, canonical stored writer 확장은 여전히 후속 `N2` 범위다.
- detail raw `data`와 derived projection의 의도적 차이, reader facade와 writer owner의 분리는 계속 남아 있으므로 broad canonical merge로 해석하면 안 된다.
