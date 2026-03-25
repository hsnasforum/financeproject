# 2026-03-20 N2 batch list createdAt public boundary alignment

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/lib/planning/v3/batches/store.ts`
- `src/app/api/planning/v3/transactions/batches/route.ts`
- `src/app/api/planning/v3/batches/route.ts`
- `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-batch-center-api.test.ts`
- `work/3/20/2026-03-20-n2-batch-list-createdAt-boundary-alignment.md`

## 사용 skill

- `planning-gate-selector`: list API route + TSX consumer 범위에 맞춰 targeted test, `pnpm lint`, `pnpm build`, `git diff --check`를 최소 검증 세트로 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 리스크를 오늘 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- detail/summary는 이미 shared public `createdAt` boundary를 읽고 있었지만, `/api/planning/v3/transactions/batches`와 `/api/planning/v3/batches`는 각각 route-local merge/fallback 로직으로 `createdAt`을 노출하고 있었다.
- 특히 transaction batch list는 legacy row가 남아 있으면 merged stored meta보다 legacy `createdAt`을 그대로 보여줄 수 있었고, list consumer도 empty/hidden `createdAt`을 안전하게 렌더링한다는 전제가 약했다.
- 이번 라운드는 broad refactor 없이 list route와 list consumer가 shared public `createdAt` boundary를 의식하도록 최소 정렬하는 것이 목적이었다.

## 핵심 변경

- `transactions/store.ts`에 `toStoredFirstPublicImportBatchMeta()`를 추가하고, 기존 `toStoredFirstPublicMeta()`도 같은 helper를 재사용하도록 정리했다.
- `batches/store.ts`는 위 helper를 batch family facade에서 다시 export 하도록 맞췄다.
- `/api/planning/v3/transactions/batches`는 merged meta의 `metadataSource`를 함께 들고 가며 `createdAt`만큼은 shared public helper를 거친 값으로 `items`/`data`에 내려주도록 바꿨다.
- `/api/planning/v3/batches`는 `getBatchSummary()`가 숨긴 `createdAt`을 raw row로 다시 되살리지 않도록 바꾸고, summary fallback 시에도 같은 public helper를 거친 값만 사용하도록 좁혔다.
- `TransactionsBatchListClient`는 empty `createdAt`도 유효한 hidden state로 받아들이고 `-`로 표시하도록 guard를 추가했다.
- 테스트는 두 list route가 stored-first shadow batch의 `createdAt`을 public boundary 기준으로 읽는다는 점을 명시적으로 고정했다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/batches/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/batches/store.ts src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx src/app/planning/v3/batches/_components/BatchesCenterClient.tsx tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts work/3/20/2026-03-20-n2-batch-list-createdAt-boundary-alignment.md`
- 관찰 메모
- `pnpm lint`는 이번 변경과 무관한 기존 warning 30건만 남기고 종료됐다.
- 미실행 검증
- `pnpm e2e:rc`

## 남은 리스크

- list route는 여전히 `listStoredBatches()` / `listLegacyBatches()`가 알려 주는 batch id만 대상으로 한다. 즉 index 없이 ndjson만 남은 synthetic stored-only batch는 이번 라운드에서도 list discovery 대상이 아니다.
- `/api/planning/v3/transactions/batches`는 legacy-style string contract를 유지하기 위해 hidden `createdAt`을 `""`로 내릴 수 있고, `/api/planning/v3/batches`는 optional field omission을 유지한다. decision boundary는 같지만 list payload 표현은 완전히 동일하지 않다.
