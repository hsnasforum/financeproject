# 2026-03-20 N2 batch list hidden createdAt expression parity

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/app/api/planning/v3/transactions/batches/route.ts`
- `src/app/api/planning/v3/batches/route.ts`
- `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx`
- `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-batch-center-api.test.ts`
- `work/3/20/2026-03-20-n2-batch-list-hidden-createdAt-expression-parity.md`

## 사용 skill

- `planning-gate-selector`: list route + TSX consumer 범위에서 `pnpm test`, `pnpm lint`, `pnpm build`, `git diff --check`를 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 실행한 검증과 expression contract 결론을 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 라운드에서 list route들은 shared public `createdAt` decision boundary를 읽게 됐지만, `/api/planning/v3/transactions/batches`는 hidden state를 `""` string contract로 표현하고 `/api/planning/v3/batches`는 optional omission을 유지하는 차이가 남아 있었다.
- 이번 라운드는 두 표현을 억지로 통일하기보다, 왜 이 차이를 유지하는지 helper/route/client/test에 더 명시적으로 남겨 batch list contract를 잠그는 것이 목적이었다.

## 핵심 변경

- `transactions/store.ts`에 `getStoredFirstPublicCreatedAtString()`를 추가해 “shared public boundary는 같지만 string contract surface는 hidden state를 `""`로 내린다”는 helper를 분리했다.
- `toStoredFirstPublicImportBatchMeta()`에는 반대로 summary/batch-center style surface가 hidden `createdAt`를 optional omission으로 유지한다는 주석을 추가했다.
- `/api/planning/v3/transactions/batches`는 `createdAt`를 이제 `getStoredFirstPublicCreatedAtString()`으로 채워 string expression을 의도적으로 유지한다는 점을 route code에서 드러냈다.
- `/api/planning/v3/batches`는 batch center가 summary-style omission을 따른다는 주석을 추가해 `createdAt` optional contract를 route-local에서 명시했다.
- `TransactionsBatchListClient`와 `BatchesCenterClient` type 주석에 각각 `""` string contract / optional omission contract를 적어 consumer 기대치를 분명히 했다.
- 테스트는 transaction list 쪽에 hidden public `createdAt` string downgrade helper를, batch center 쪽에 hidden public `createdAt` omission helper를 각각 고정했다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/batches/route.ts src/lib/planning/v3/transactions/store.ts src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx src/app/planning/v3/batches/_components/BatchesCenterClient.tsx tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts work/3/20/2026-03-20-n2-batch-list-hidden-createdAt-expression-parity.md`
- 관찰 메모
- `pnpm lint`는 이번 변경과 무관한 기존 warning 30건만 남기고 종료됐다.
- 미실행 검증
- `pnpm e2e:rc`

## 남은 리스크

- 표현 차이는 더 명시적으로 잠갔지만 실제 payload expression은 여전히 다르다. transaction batch list는 hidden `createdAt`를 `""`로, batch center는 field omission으로 표현한다.
- synthetic stored-only batch discovery/index 확장은 이번 라운드 비범위라서, list route가 그런 batch를 찾아내는 문제는 그대로 남아 있다.
