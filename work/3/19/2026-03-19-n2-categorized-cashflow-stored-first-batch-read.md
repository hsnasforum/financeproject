# 2026-03-19 N2 categorized/cashflow stored-first batch read

## 변경 파일

- `src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`
- `tests/planning-v3-categorized-api.test.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `work/3/19/2026-03-19-n2-categorized-cashflow-stored-first-batch-read.md`

## 사용 skill

- `planning-gate-selector`: categorized/cashflow user-facing route와 stored-first 회귀 테스트 범위에 맞춰 필요한 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, legacy fallback 잔존 범위를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 라운드에서 두 route는 explicit batch override helper까지는 정리됐지만, batch read는 여전히 direct legacy `readBatchTransactions` 또는 legacy/store dual-read 조합에 묶여 있었다.
- 이번 라운드는 override helper 축이 아니라 `ImportBatch` / `TransactionRecord`의 stored-first reader facade를 `categorized`와 `cashflow`까지 확장하는 것이 목적이었다.
- broad rewrite 없이 `loadStoredFirstBatchTransactions`를 기본 reader로 채택하고, legacy batch meta/accountId가 꼭 필요한 경우에만 fallback을 남기는 최소 수정으로 범위를 제한했다.

## 핵심 변경

- `categorized` route는 `readBatchTransactions` + `getBatchMeta` + `getBatchTransactions` 조합 대신 `loadStoredFirstBatchTransactions`를 기본 reader로 사용하게 바꿨다.
- `categorized` route의 legacy fallback은 `loaded.source === "legacy"`일 때 `readBatch(id)`로 legacy meta만 보강하는 수준으로 줄였다. transaction rows 자체는 stored-first helper가 고른 결과를 그대로 사용한다.
- `cashflow` route는 direct `readBatchTransactions(id)`를 제거하고 `loadStoredFirstBatchTransactions(id)`를 기본 reader로 사용하게 바꿨다.
- `cashflow` route의 legacy fallback은 account selection guard를 유지하기 위한 `readBatch(id)` 보강만 남겼다. stored snapshot에 `accounts[0].id`가 있으면 legacy batch account binding 없이도 user-facing read가 진행된다.
- categorized/cashflow 테스트에 stored shadow batch 케이스를 추가해, 같은 `batchId`에서 stored snapshot이 legacy batch보다 우선 적용되는지 확인했다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts work/3/19/2026-03-19-n2-categorized-cashflow-stored-first-batch-read.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`
- 실행하지 않은 추가 검증
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts`
- 이유: `src/lib/planning/v3/transactions/store.ts` helper 본문은 이번 라운드에서 수정하지 않았고, route-level adoption만 검증 범위에 포함했다.

## 남은 리스크

- `categorized`와 `cashflow`는 now stored-first reader를 쓰지만, legacy-only batch metadata가 필요한 경우 `readBatch(id)` fallback은 계속 남아 있다. 이번 라운드는 `stored-only` 강제가 아니라 `stored-first + legacy fallback containment`까지다.
- `cashflow`는 stored meta에 `accounts[0].id`가 없으면 여전히 legacy detail의 `accountId`에 기대고, stored meta도 legacy detail도 계좌 바인딩이 없으면 기존처럼 400 guard를 유지한다.
- `transactions/store.ts`의 helper는 바꾸지 않았고, batch detail/summary 등 다른 route와의 공통 stored-first normalization은 후속 라운드에서 다시 추출할 수 있다.
- 워크트리에는 이번 라운드와 무관한 기존 dirty 변경이 함께 남아 있어, 후속 commit/PR에서는 categorized/cashflow stored-first 배치를 따로 분리하는 편이 안전하다.
