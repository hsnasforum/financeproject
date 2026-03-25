# 2026-03-22 N2 route-local success branch integration

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/account/route.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-route-local-success-branch-integration.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence `/account` branch 한 곳만 좁게 열고, stored-first reader contract와 response source-of-truth를 그대로 유지하는 데 사용.
- `planning-gate-selector`: App Router API route 변경으로 보고 `transactionStore` unit test, route API test, `pnpm build`, `git diff --check`만 이번 라운드 최소 검증 세트로 고정하는 데 사용.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, same-id success branch residual risk를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- same-id coexistence는 sequencing wrapper, success split worker, verified-success response shell helper까지 준비됐지만 `/account` route가 아직 explicit guard로만 끝나고 있었다.
- 이번 라운드는 broad refactor 없이 coexistence branch 한 곳에서만 helper stack을 실제로 조합해 success/failure split을 route-local로 여는 것이 목표였다.

## 핵심 변경
- `/api/planning/v3/transactions/batches/[id]/account`의 `stored-meta-legacy-coexistence` branch는 이제 `runSameIdCoexistenceStoredThenLegacyRouteLocalSequence()`를 먼저 실행한다.
- sequence 결과가 `secondary-failure`면 `toSameIdCoexistenceUserFacingInternalFailure()`로 generic `INTERNAL` failure를 반환하고, `writes-completed`면 `runSameIdCoexistencePostWriteSuccessSplitWorker()`로 한 번 더 분기한다.
- `verified-success-candidate`일 때만 `buildSameIdCoexistenceVerifiedSuccessResponseShell()`을 호출해 stored-first visible `batch` shell과 legacy-side `updatedTransactionCount`를 success body로 반환한다.
- `visible-verification-failed`는 success를 열지 않고 generic `INTERNAL` failure로 다시 내려보낸다.
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`는 same-id coexistence POST가 이제 200 success와 stored-first visible binding을 반환하고, 뒤이은 cashflow/detail read도 `acc-main`을 읽는 회귀를 고정한다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/lib/planning/v3/service/transactionStore.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-transactionStore.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-write-route-guards.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-route-local-success-branch-integration.md`
- 미실행:
  - `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- same-id coexistence branch만 열렸고, broader command surface나 다른 owner merge semantics로 일반화되지는 않았다.
- `secondary-failure`와 `visible-verification-failed`는 둘 다 generic `INTERNAL` failure로 내려가므로, user-facing copy와 operator evidence handoff 세분화는 후속 컷에서 더 다듬어야 한다.
- `[검증 필요]` visible binding은 target `accountId`로 보이지만 legacy `updatedTransactionCount`가 `0`인 edge case success 설명은 아직 닫히지 않았다.
