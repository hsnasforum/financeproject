# 2026-03-20 N2 synthetic stored-only batch internal ordering normalization

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-batch-center-api.test.ts`
- `work/3/20/2026-03-20-n2-synthetic-stored-only-batch-ordering-normalization.md`

## 사용 skill

- `planning-gate-selector`: list/store/helper 변경 범위에 맞춰 targeted API tests, `pnpm lint`, `pnpm build`, `git diff --check`를 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: synthetic ordering surrogate 변경, 실행한 검증, 남은 fallback 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 라운드에서 synthetic stored-only `.ndjson` batch는 list discovery에는 포함됐지만, synthetic meta `createdAt`이 epoch로 고정돼 있어서 내부 정렬에서는 항상 맨 뒤로 밀렸다.
- 이번 라운드는 public `createdAt` 노출 규칙은 그대로 둔 채, read-side ordering에만 쓰는 synthetic timestamp를 row data 기반으로 더 자연스럽고 deterministic하게 바꾸는 것이 목적이었다.

## 핵심 변경

- `transactions/store.ts`에 `deriveSyntheticBatchOrderingCreatedAt()`를 추가해 synthetic stored-only batch의 내부 `createdAt` surrogate를 latest valid transaction date 기준 ISO timestamp로 유도하도록 정리했다.
- 이 helper는 public metadata가 아니라 ordering 전용 내부 surrogate라는 점을 주석으로 명시했고, valid row date가 없을 때만 기존 epoch fallback을 유지한다.
- `listStoredBatchListCandidates()`는 index 없는 synthetic batch meta를 만들 때 더 이상 `new Date(0)`를 쓰지 않고, row date 기반 surrogate를 넣는다.
- `loadStoredFirstBatchTransactions()`도 stored meta가 아예 없는 stored-partial synthetic case에서 같은 helper를 써서 synthetic 내부 timestamp 규칙이 list/detail helper 사이에서 어긋나지 않게 맞췄다.
- `metadataSource: "synthetic"`와 shared public createdAt predicate는 그대로 유지해서, transactions batch list는 여전히 `""`, batch center list는 여전히 createdAt omission을 사용한다.
- 테스트는 두 list route가 synthetic batch ordering을 id tie-break가 아니라 latest row date로 결정하는지, 동시에 hidden public `createdAt` 표현은 그대로 유지하는지 고정했다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm build`
- `git diff --check -- src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/store/batchesStore.ts src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/batches/route.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts work/3/20/2026-03-20-n2-synthetic-stored-only-batch-ordering-normalization.md`
- 관찰 메모
- `pnpm lint`는 이번 변경과 무관한 기존 warning 30건만 남기고 종료됐다.
- 미실행 검증
- `pnpm e2e:rc`

## 남은 리스크

- synthetic stored-only batch는 이제 row date 기준으로 더 자연스럽게 정렬되지만, true import time은 여전히 없으므로 stored meta/legacy batch의 실제 import `createdAt`과 완전한 parity는 아니다.
- valid transaction date가 하나도 없거나 파싱할 수 없으면 synthetic ordering은 기존 epoch fallback으로 다시 내려간다.
- index repair/write-back은 하지 않으므로 synthetic batch는 이후에도 매번 `.ndjson` row를 읽어 ordering surrogate를 다시 계산한다.
