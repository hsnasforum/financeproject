# 2026-03-20 N2 synthetic stored-only batch command surface guard

## 변경 파일

- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/account/route.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/20/2026-03-20-n2-synthetic-stored-only-batch-command-surface-guard.md`

## 사용 skill

- `planning-gate-selector`: command route와 batch-family helper를 함께 건드린 범위에 맞춰 `tests/planning-v3-batches-api.test.ts`, `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`, `pnpm build`, `git diff --check`를 고르고 `pnpm lint`, `pnpm e2e:rc`를 미실행 검증으로 남기는 데 사용
- `work-log-closeout`: synthetic command surface 정책, 실제 실행한 검증, 남은 write parity 리스크를 `/work` 형식으로 정리하는 데 사용
- `planning-v3-batch-contract-narrowing`: synthetic stored-only batch가 read surface에서는 보이지만 command surface에서는 writer owner 경계가 다르다는 점을 route-local ad hoc 분기 대신 shared helper와 회귀 테스트로 좁히는 데 사용

## 변경 이유

- synthetic stored-only batch는 list/detail/summary read surface에서는 이미 discover/resolve되지만, command surface는 여전히 index/meta row 기준으로만 배치를 해석하고 있었다.
- 이 상태에서는 synthetic batch가 read surface에서는 보이는데 `DELETE`와 `POST /account`에서는 `NO_DATA`처럼 보이거나, write owner가 불명확한 작업을 암묵적으로 허용하는 문제가 남아 있었다.

## 핵심 변경

- `transactions/store.ts`에 `getStoredBatchCommandSurfaceState()`를 추가해 command route가 batch를 `stored-meta`, `synthetic-stored-only`, `missing`으로 같은 기준에서 판정하도록 정리했다.
- `/api/planning/v3/transactions/batches/[id]`의 `DELETE`는 이제 stored meta가 없더라도 stored transaction rows가 있는 synthetic stored-only batch를 삭제 대상으로 인정한다.
- `/api/planning/v3/transactions/batches/[id]/account`는 synthetic stored-only batch에 대해 더 이상 `NO_DATA`처럼 보이지 않게, `INPUT` 400과 명시적 unsupported 메시지로 guard 한다.
- `POST /account`는 legacy batch owner write 경계를 그대로 유지하고, synthetic batch를 정식 canonical write owner로 승격시키거나 index/meta row를 write-back 하지는 않았다.
- 테스트는 synthetic batch가 discover된 뒤 `DELETE`는 성공하고, `POST /account`는 explicit unsupported guard를 반환하며, 기존 legacy account binding path는 `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`로 계속 동작하는지 고정했다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/store/batchesStore.ts src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts work/3/20/2026-03-20-n2-synthetic-stored-only-batch-command-surface-guard.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`
- `pnpm test tests/planning-v3-write-route-guards.test.ts`
- `pnpm test tests/planning-v3-user-facing-remote-host-api.test.ts`

## 남은 리스크

- synthetic stored-only batch는 이제 `DELETE`는 허용되지만 `POST /account`는 explicit unsupported guard로 남아 있어, read parity와 write parity는 여전히 다르다.
- `POST /account`는 legacy batch owner를 계속 쓰므로, synthetic stored-only batch를 정식 canonical write owner로 다루려면 후속 라운드에서 stored meta/index write contract를 먼저 정리해야 한다.
- `DELETE`는 stored file 삭제만 수행하므로, synthetic batch와 같은 id의 legacy batch가 따로 있을 경우 legacy surface 정리는 이번 라운드 비범위다.
