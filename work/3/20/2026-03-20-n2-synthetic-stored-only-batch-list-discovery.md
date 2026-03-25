# 2026-03-20 N2 synthetic stored-only batch list discovery widening

## 변경 파일

- `src/lib/planning/v3/store/batchesStore.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `src/lib/planning/v3/batches/store.ts`
- `src/app/api/planning/v3/transactions/batches/route.ts`
- `src/app/api/planning/v3/batches/route.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-batch-center-api.test.ts`
- `work/3/20/2026-03-20-n2-synthetic-stored-only-batch-list-discovery.md`

## 사용 skill

- `planning-gate-selector`: list route/store/helper 변경 범위에 맞춰 targeted test, `pnpm lint`, `pnpm build`, `git diff --check`를 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 수정 파일, 실행한 명령, synthetic stored-only discovery 보강 결과를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 기존 list surface는 `listStoredBatches()` index row와 `listLegacyBatches()`만 합쳐 읽었기 때문에, stored transaction `.ndjson` 파일은 남아 있지만 stored meta/index entry가 없는 synthetic stored-only batch는 discovery 대상에서 빠지고 있었다.
- 이번 라운드는 index repair나 write-back 없이, user-facing list route가 그런 batch id를 최소한 후보군에 포함하도록 read-side discovery gap만 메우는 것이 목적이었다.

## 핵심 변경

- `batchesStore.ts`에 `listBatchTransactionFileIds()`를 추가해 `.ndjson` 파일명 기준으로 stored batch id를 읽을 수 있게 했다.
- `transactions/store.ts`에 `listStoredBatchListCandidates()`를 추가해 index row가 있는 stored batch와, index에 없지만 `.ndjson` rows가 있는 synthetic stored-only batch를 함께 반환하도록 정리했다.
- synthetic candidate meta는 기존 `buildImportBatchMeta()`로 합성하고 `createdAt`은 epoch 기반 synthetic 값으로 두되 `metadataSource: "synthetic"`로 표시해 shared public createdAt boundary가 그대로 숨김 처리되게 유지했다.
- `/api/planning/v3/transactions/batches`와 `/api/planning/v3/batches`는 이제 `listStoredBatchListCandidates()`를 읽고, legacy merge 전에 synthetic stored-only batch도 merged candidate에 포함한다.
- transaction batch list는 hidden `createdAt` string contract를 유지해 synthetic batch에 `""`를 내리고, batch center list는 summary-style omission을 유지한다는 직전 라운드 결론은 바꾸지 않았다.
- 테스트는 두 list route가 index 없는 synthetic stored-only `.ndjson` batch를 실제로 발견하는지 고정했다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm build`
- `git diff --check -- src/lib/planning/v3/store/batchesStore.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/batches/store.ts src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/batches/route.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts work/3/20/2026-03-20-n2-synthetic-stored-only-batch-list-discovery.md`
- 관찰 메모
- `pnpm lint`는 이번 변경과 무관한 기존 warning 30건만 남기고 종료됐다.
- 미실행 검증
- `pnpm e2e:rc`

## 남은 리스크

- synthetic stored-only batch는 이제 list에는 잡히지만 index repair/write-back은 하지 않으므로, 같은 batch가 계속 synthetic candidate로 계산된다.
- synthetic meta의 `createdAt`은 여전히 epoch 기반 내부 합성값이라 public surface에서는 숨겨지고 정렬도 가장 뒤쪽으로 밀린다.
- `.ndjson` 파일이 깨져 있거나 row가 0건이면 synthetic candidate로 올리지 않으므로, 그런 orphan file의 repair/discovery는 이번 라운드 비범위다.
