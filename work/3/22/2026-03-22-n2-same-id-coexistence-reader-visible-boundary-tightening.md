# 2026-03-22 N2 same-id coexistence reader-visible boundary tightening

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/account/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`
- `src/lib/planning/v3/service/getBatchSummary.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-getBatchSummary.test.ts`
- `work/3/22/2026-03-22-n2-same-id-coexistence-reader-visible-boundary-tightening.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence에서 reader facade는 stored-first, command route는 explicit guard라는 경계를 helper/route/test 기준으로 더 좁혀 고정했다.
- `planning-gate-selector`: route/helper/test 변경에 맞춰 `pnpm test`, `pnpm build`, `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 유지된 guard 경계와 잔여 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- same-id stored-meta + legacy coexistence는 아직 account writer success를 열지 않지만, 최근 N2 라운드로 visible reader는 detail/cashflow/summary에서 stored-first로 정렬돼 있다.
- 이 상태를 코드에서 더 읽히게 하지 않으면 `POST /account` guard 이유와 user-facing read 의미가 다시 흐려질 수 있다.
- 이번 라운드는 dual-write나 writer merge 없이, helper 주석과 regression test만으로 reader-visible boundary를 더 명시적으로 잠그는 것이 목표였다.

## 핵심 변경
- `getStoredFirstBatchBindingAccountId()`와 `getStoredBatchAccountCommandSurfaceState()` 주석을 보강해 same-id coexistence에서 visible binding은 stored-first로 읽히지만, `/account` success는 여전히 과장될 수 있어 guard를 유지한다는 점을 명시했다.
- detail route, cashflow route, `getBatchSummary.ts`에 route-local comment를 추가해 raw snapshot과 derived stored-first projection의 역할을 더 분리해 적었다.
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`의 coexistence 회귀 테스트는 stored shadow rows에서 `accountId`를 비우고 동일 금액 쌍을 사용하도록 바꿔, `POST /account`가 guard된 뒤에도 cashflow visible result가 stored-first binding을 따라간다는 점을 고정했다.
- `tests/planning-v3-batches-api.test.ts`의 hybrid fallback detail 회귀 테스트 이름을 same-id coexistence visible binding 관점으로 보강하고, derived `transactions`가 모두 stored account binding을 읽는 assert를 추가했다.
- `tests/planning-v3-getBatchSummary.test.ts`에는 same-id coexistence에서도 summary projection이 stored-first binding view를 유지한다는 새 회귀 테스트를 추가했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts`
  - `pnpm build`
  - `git diff --check -- src/lib/planning/v3/transactions/store.ts src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts src/lib/planning/v3/service/getBatchSummary.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts work/3/22/2026-03-22-n2-same-id-coexistence-reader-visible-boundary-tightening.md`
- 미실행 검증:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 reader-visible boundary만 고정했을 뿐, same-id coexistence writer 자체를 열거나 dual-write contract를 정의하지 않았다.
- stored-first reader parity는 더 명확해졌지만 canonical account writer, mirror write, legacy migration, row rewrite, index repair는 여전히 후속 범위다.
- balances/monthly, draft/profile은 이번 라운드에서 다시 수정하지 않았으므로 existing parity 전제를 유지하는 수준이다.
