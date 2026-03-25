# 2026-03-21 N2 getBatchSummary stored-first account binding parity

## 변경 파일
- `src/lib/planning/v3/service/getBatchSummary.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-getBatchSummary.test.ts`
- `work/3/21/2026-03-21-n2-getBatchSummary-stored-first-account-binding-parity.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: summary consumer 한 surface만 좁혀 raw row direct read를 stored-first derived binding helper로 바꾸는 데 사용했다.
- `planning-gate-selector`: summary helper 변경과 shared helper 영향에 맞춰 `pnpm test tests/planning-v3-getBatchSummary.test.ts`, `pnpm test tests/planning-v3-batches-api.test.ts`, `pnpm build`, `git diff --check`를 이번 라운드 검증으로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, helper 재사용 방식, 남은 drift 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- `getBatchSummary()`는 `loadStoredFirstBatchTransactions()`를 쓰면서도 transfer detection, categorize, monthly aggregation에는 여전히 raw `loaded.transactions`를 직접 넘기고 있었다.
- stored-meta-only bootstrap 이후 row에 `accountId`가 비어 있거나, hybrid fallback에서 stored binding이 legacy row account binding과 갈릴 때 summary consumer만 read surface drift가 남을 수 있었다.
- 이번 라운드는 writer merge나 row rewrite 없이 summary helper가 stored-first derived rows를 재사용하게 하는 최소 수정이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/transactions/store.ts`에 `getStoredFirstBatchSummaryProjectionRows()`를 추가했다.
- 이 helper는 summary payload에 raw row field가 없다는 전제에서 `applyStoredFirstDetailProjectionAccountBinding()`을 그대로 재사용해 derived stored-first binding rows를 반환한다.
- `src/lib/planning/v3/service/getBatchSummary.ts`는 raw `loaded.transactions` 대신 `getStoredFirstBatchSummaryProjectionRows(loaded)`를 `applyAccountMappingOverrides()`, `detectTransfers()`, `categorizeTransactions()` 앞단 입력으로 사용한다.
- `tests/planning-v3-getBatchSummary.test.ts`에는 stored rows가 `accountId` 없이 저장돼도 summary가 false transfer를 만들지 않고 stored-first binding 기준의 income/expense를 유지하는 케이스를 추가했다.
- 테스트 데이터 설명문은 기본 `transfer-en` rule과 충돌하지 않도록 `same-account paired expense`로 조정했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-getBatchSummary.test.ts`
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/lib/planning/v3/service/getBatchSummary.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-batches-api.test.ts work/3/21/2026-03-21-n2-getBatchSummary-stored-first-account-binding-parity.md`
- 미실행 검증:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 summary helper만 정리했고, detail/cashflow/balances/draft consumer를 다시 수정하지는 않았다.
- summary는 raw `data` payload가 없어서 derived binding만 읽지만, hybrid fallback의 raw legacy row 자체를 rewrite한 것은 아니므로 lower-level persistence는 여전히 legacy accountId를 유지할 수 있다.
- same-id coexistence writer merge, row rewrite/index repair, canonical stored writer 확장은 이번 라운드 비범위다.
