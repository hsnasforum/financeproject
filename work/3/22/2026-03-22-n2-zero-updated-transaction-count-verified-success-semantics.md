# 2026-03-22 N2 zero-updatedTransactionCount verified-success semantics

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-zero-updated-transaction-count-verified-success-semantics.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence success edge case 한 점만 좁혀서 `updatedTransactionCount` 의미와 stored-first visible binding semantics를 다시 고정하는 데 사용.
- `planning-gate-selector`: 이번 라운드를 테스트/문서 보강 중심으로 보고 `pnpm test` 2개와 `git diff --check`만 최소 검증 세트로 유지하는 데 사용.
- `work-log-closeout`: 실제 실행 검증과 zero-count edge case 잔여 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- same-id coexistence success branch는 이미 열렸지만, visible binding은 target `accountId`로 맞으면서 legacy `updatedTransactionCount`가 `0`인 edge case 의미는 아직 테스트와 문서로 닫히지 않았다.
- 이번 라운드는 route behavior를 다시 바꾸지 않고, zero-count가 visible binding failure가 아니라 legacy-side changed row count absence라는 점만 가장 작게 고정하는 것이 목표였다.

## 핵심 변경
- `tests/planning-v3-transactionStore.test.ts`에 `updatedTransactionCount: 0`이어도 visible binding이 target `accountId`와 일치하면 `verified-success-candidate`가 유지되고 response shell도 `0`을 그대로 돌려주는 회귀를 추가했다.
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`에 legacy rows가 이미 target `accountId`를 가진 same-id coexistence batch를 추가해, POST `/account`가 200 success와 `updatedTransactionCount: 0`을 반환하면서 detail visible binding은 target으로 보이는 케이스를 고정했다.
- `src/lib/planning/v3/transactions/store.ts`에는 `buildSameIdCoexistenceVerifiedSuccessResponseShell()`의 `updatedTransactionCount`가 legacy-side changed row count일 뿐이고, visible binding success와 1:1 의미가 아니라는 주석을 남겼다.
- `analysis_docs/v2/13...`에는 zero-count coexistence success가 허용되더라도 이는 visible verification success + legacy changed row count zero라는 뜻이지 visible binding failure가 아니라는 점을 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/lib/planning/v3/service/transactionStore.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-transactionStore.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-zero-updated-transaction-count-verified-success-semantics.md`
- 미실행:
  - `pnpm build`
  - `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- zero-count edge case 의미는 고정했지만, user-facing success copy를 더 명시적으로 바꾸지는 않았다.
- `updatedTransactionCount`는 여전히 legacy-side changed row count만 뜻하므로, visible binding 변화량과 혼동될 수 있는 copy 개선은 후속 범위다.
- same-id coexistence broader success/failure copy redesign, row rewrite, owner merge는 이번 라운드 비범위로 남아 있다.
