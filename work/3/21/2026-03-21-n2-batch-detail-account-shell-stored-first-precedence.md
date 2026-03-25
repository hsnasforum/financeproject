# 2026-03-21 N2 batch detail account shell stored-first precedence

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/21/2026-03-21-n2-batch-detail-account-shell-stored-first-precedence.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail route 한 surface만 좁혀서 batch shell의 `accountId` / `accountHint` precedence를 stored-first 의미에 맞추는 데 사용했다.
- `planning-gate-selector`: detail route + batch API 테스트 변경으로 분류하고 `pnpm test tests/planning-v3-batches-api.test.ts`, `pnpm build`, `git diff --check`만 이번 라운드 최소 검증으로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 미실행 검증, hybrid fallback 잔여 리스크를 `/work` 형식으로 남기는 데 사용했다.

## 변경 이유
- detail route의 `batch` shell은 `accountId` / `accountHint`에서 legacy summary를 먼저 봐서, stored-first binding을 읽는 다른 consumer와 의미가 어긋날 수 있었다.
- stored meta bootstrap 이후 `stored-meta-only` batch는 detail route도 stored binding을 읽을 수 있지만, same-id stored/legacy coexistence에서는 shell precedence만 legacy-first로 남아 있었다.
- 이번 라운드는 writer 경계는 다시 열지 않고, read-side shell precedence만 stored-first로 정렬하는 최소 수정이 목표였다.

## 핵심 변경
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`의 `toBatchDetailBatch()`가 `getStoredFirstBatchBindingAccountId()`를 직접 사용하도록 바꿨다.
- `batch.accountId`는 stored binding이 있으면 그것을 우선 노출하고, 없을 때만 legacy fallback으로 남게 정리했다.
- `batch.accountHint`도 stored binding이 있으면 같은 값을 우선 쓰고, stored binding이 없을 때만 legacy `accountHint` 또는 `accountId`를 fallback으로 사용한다.
- stored/legacy same-id coexistence와 hybrid fallback 테스트에서 detail batch shell이 `acc-stored`를 우선 노출하도록 기대값을 보강했다.
- payload shape, delete/account command boundary, raw `data` vs derived projection 구분은 건드리지 않았다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts work/3/21/2026-03-21-n2-batch-detail-account-shell-stored-first-precedence.md`
- 미실행 검증:
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 detail batch shell precedence만 정리했고, same-id stored/legacy coexistence의 canonical writer merge나 row rewrite는 하지 않았다.
- hybrid fallback에서는 batch shell은 stored binding을 우선 보여주지만, legacy row 자체에 이미 박힌 `accountId`를 전면 rewrite하지는 않아 다른 projection과의 잔여 차이가 남을 수 있다.
- balances/draft/cashflow consumer 전면 sweep은 하지 않았으므로, shell precedence 정렬 이후의 broader read contract 정리는 후속 라운드에서 다시 확인이 필요하다.
