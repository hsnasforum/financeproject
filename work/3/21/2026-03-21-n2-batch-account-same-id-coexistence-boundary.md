# 2026-03-21 N2 batch account same-id coexistence boundary

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/account/route.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `work/3/21/2026-03-21-n2-batch-account-same-id-coexistence-boundary.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: stored-first read와 legacy write가 엇갈리는 account command boundary를 helper 기준으로 좁혔다.
- `planning-gate-selector`: account API route와 helper 변경에 맞는 최소 검증 세트를 유지했다.
- `work-log-closeout`: 오늘 라운드의 변경, 검증, 잔여 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- `/api/planning/v3/transactions/batches/[id]/account`는 legacy batch owner에 쓰기를 수행하지만, read surface는 same-id stored batch의 account binding을 먼저 읽을 수 있다.
- 이 공존 상태에서 `POST /account`를 성공으로 응답하면 사용자가 바로 보게 되는 batch/account 상태와 write 결과가 어긋날 수 있다.
- broad owner merge나 stored write-back 없이 command boundary만 명시적으로 잠그는 최소 수정이 필요했다.

## 핵심 변경
- `getStoredBatchAccountCommandSurfaceState()`를 추가해 account command surface를 `stored-meta`, `stored-meta-legacy-coexistence`, `synthetic-stored-only`, `legacy-only`, `missing`으로 분리했다.
- same-id stored meta와 legacy batch가 함께 있으면 account route가 legacy write로 진행하지 않고 `INPUT` 400 guard를 반환하도록 정리했다.
- pure legacy batch account binding success는 그대로 유지했다.
- synthetic stored-only batch account guard는 기존처럼 유지했다.
- cashflow account guard 테스트에 same-id stored/legacy coexistence 케이스를 추가해 visible stored-first 상태가 success로 오해되지 않음을 검증했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/lib/planning/v3/service/transactionStore.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-batches-api.test.ts`
- 미실행 검증:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- pure legacy batch account binding의 canonical writer는 여전히 legacy owner다.
- same-id stored/legacy coexistence를 하나의 canonical account writer로 합치거나 stored meta write-back을 수행하지는 않았다.
- stored-first read contract는 유지되므로, broader owner merge나 delete/write contract 재정의는 후속 범위에서 별도로 다뤄야 한다.
