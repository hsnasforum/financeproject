# 2026-03-21 N2 stored-first account binding consumer parity

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `work/3/21/2026-03-21-n2-stored-first-account-binding-consumer-parity.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: stored-first account binding drift를 consumer별로 다시 넓히지 않고, 실제 route-local precedence가 남은 `cashflow` 한 surface만 좁혀 수정하는 데 사용했다.
- `planning-gate-selector`: cashflow route와 read consumer 검증 라운드로 분류하고 지정된 4개 테스트 묶음, `pnpm build`, `git diff --check`를 최소 검증 세트로 유지했다.
- `work-log-closeout`: 수정한 consumer와 unchanged-but-verified consumer를 나눠 `/work`에 기록하고, 미실행 검증과 남은 parity 리스크를 같이 정리했다.

## 변경 이유
- stored-meta-only bootstrap 이후 detail shell은 stored-first precedence로 맞춰졌지만, `cashflow` route는 batch binding 존재만 확인하고 실제 row에는 binding을 적용하지 않아 consumer parity drift가 남아 있었다.
- `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch`는 이미 `applyStoredFirstBatchAccountBinding()` 경로를 타고 있어 code-side drift가 크지 않았고, 이번 라운드는 대표 consumer 검증과 `cashflow` parity 보정만 하는 것이 가장 작은 수정이었다.
- broad owner merge, row rewrite, delete/account command boundary 재수정 없이 read-side consumer parity만 맞추는 것이 목표였다.

## 핵심 변경
- `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`가 `getStoredFirstBatchBindingAccountId()`로 binding precedence를 읽고, `applyStoredFirstBatchAccountBinding()`을 실제 row 처리에도 적용하도록 바꿨다.
- 이 변경으로 stored-meta-only bootstrap 이후 row에 `accountId`가 비어 있어도 `cashflow`의 account mapping override와 transfer detection이 balances/generateDraftPatch와 같은 stored-first binding 기준을 따르게 했다.
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`의 stored-meta-only bootstrap 케이스에 cashflow GET 검증을 추가해, 같은 계좌의 transfer-like pair가 binding 누락 때문에 transfer로 잘못 분류되지 않는지 고정했다.
- `tests/planning-v3-balances-api.test.ts`, `tests/planning-v3-draft-profile-api.test.ts`, `tests/planning-v3-generateDraftPatchFromBatch.test.ts`는 기존 helper parity가 유지되는지 실행 검증만 했다.
- `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch`, `transactions/store.ts`는 이번 라운드에서 코드 수정 없이 유지했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/draft/profile/route.ts src/lib/planning/v3/service/generateDraftPatchFromBatch.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-batches-api.test.ts work/3/21/2026-03-21-n2-stored-first-account-binding-consumer-parity.md`
- 미실행 검증:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 cashflow parity만 실제 코드 수정으로 다뤘고, `draft/profile`은 현재 output이 직접 accountId를 노출하지 않아 helper parity를 테스트로만 간접 확인했다.
- hybrid fallback에서 legacy row에 이미 들어 있는 `accountId` 자체를 rewrite하지는 않았으므로, read-side shell과 row-level projection의 완전한 canonical merge는 여전히 후속 범위다.
- same-id stored/legacy coexistence writer merge, synthetic stored-only write 확장, row rewrite/index repair는 이번 라운드 비범위다.
