# 2026-03-21 N2 batch detail derived-row account binding normalization

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/21/2026-03-21-n2-batch-detail-derived-row-account-binding-normalization.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail route 한 surface만 좁혀 raw `data`는 유지하고 derived projection만 stored-first account binding으로 정렬하는 데 사용했다.
- `planning-gate-selector`: `transactions/store.ts` helper 변경과 detail route 영향에 맞춰 `pnpm test tests/planning-v3-batches-api.test.ts`, helper 회귀 확인용 `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`, `pnpm build`, `git diff --check`를 이번 라운드 검증으로 골랐다.
- `work-log-closeout`: actual changed files, 실행 검증, raw vs derived 계약, 남은 hybrid 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- detail route의 `batch` shell은 이미 stored-first precedence로 맞춰졌지만, hybrid fallback에서는 derived `transactions`와 `accountMonthlyNet`이 legacy row `accountId`를 그대로 유지해 shell과 의미가 갈릴 수 있었다.
- raw `data`는 원본 snapshot을 유지해야 하므로 건드리지 않고, derived projection만 stored-first binding 기준으로 정렬하는 최소 수정이 필요했다.
- 이번 라운드는 writer merge나 row rewrite 없이 detail derived surface만 정리하는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/transactions/store.ts`에 `applyStoredFirstDetailProjectionAccountBinding()`을 추가했다.
- 이 helper는 stored binding이 있을 때 detail derived rows에서 비어 있는 `accountId`를 채우고, `hybrid-legacy-transactions`에서는 legacy row `accountId`도 stored binding으로 덮어 읽는다.
- `getStoredFirstBatchDetailProjectionRows()`는 이제 raw `data`는 그대로 두고, derived rows만 새 detail 전용 helper를 사용한다.
- `tests/planning-v3-batches-api.test.ts`의 hybrid fallback 케이스에 `transactions`와 `accountMonthlyNet`은 `acc-stored`, raw `data`는 계속 `acc-legacy`를 유지하는 기대값을 추가했다.
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`는 helper 파일 변경의 회귀 확인용으로만 재실행했고, 이번 라운드에서 수정하지 않았다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts work/3/21/2026-03-21-n2-batch-detail-derived-row-account-binding-normalization.md`
- 미실행 검증:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 detail derived projection만 정리했고, cashflow/balances/draft consumer의 broader row-level canonical merge를 다시 열지는 않았다.
- hybrid fallback에서 raw `data`는 의도적으로 legacy row `accountId`를 유지하므로, raw와 derived가 다를 수 있다는 계약 자체는 계속 남아 있다.
- same-id stored/legacy coexistence writer merge, row rewrite/index repair, canonical stored writer 확장은 이번 라운드 비범위다.
