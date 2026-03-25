# 2026-03-19 N2 legacy override bridge containment

## 변경 파일

- `src/lib/planning/v3/store/txnOverridesStore.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `src/lib/planning/v3/balances/monthly.ts`
- `src/lib/planning/v3/service/getBatchSummary.ts`
- `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`
- `src/app/api/planning/v3/transactions/overrides/route.ts`
- `src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/app/api/planning/v3/balances/monthly/route.ts`
- `src/app/api/planning/v3/draft/profile/route.ts`
- `tests/planning-v3-txnOverridesStore.test.ts`
- `tests/planning-v3-txnOverridesBatchStore.test.ts`
- `tests/planning-v3-overrides-api.test.ts`
- `tests/planning-v3-batch-txn-overrides-api.test.ts`
- `work/3/19/2026-03-19-n2-legacy-override-bridge-containment.md`

## 사용 skill

- `planning-gate-selector`: override store, user-facing route/service, targeted test 변경에 맞춰 필요한 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 잔여 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `TxnOverride` public contract의 기본 owner는 batch-scoped override인데, 코드에서는 `getOverrides`/`upsertOverride` 같은 generic 이름이 batch owner와 legacy unscoped bridge를 함께 암시했다.
- user-facing route와 service 일부가 generic helper를 통해 override를 읽으면서, batch-scoped owner / user-facing facade / internal-dev bridge 구분이 충분히 드러나지 않았다.
- 이번 라운드는 broad rewrite 없이 legacy unscoped override를 internal/dev bridge로만 더 읽히게 만들고, batch-scoped first contract를 import path와 helper 이름에서 바로 보이게 하는 최소 수정이 필요했다.

## 핵심 변경

- `txnOverridesStore.ts`에 `getBatchTxnOverrides`, `upsertBatchTxnOverride`, `deleteBatchTxnOverride`, `listLegacyUnscopedTxnOverrides`, `upsertLegacyUnscopedTxnOverride`, `deleteLegacyUnscopedTxnOverride`, `listInternalBridgeTxnOverrides`를 추가하고, 기존 generic 이름은 compat alias로만 남겼다.
- `transactions/store.ts`와 `balances/monthly.ts`는 user-facing override facade로 `getBatchTxnOverrides`만 다시 노출하게 바꿨다. merged internal bridge listing은 더 이상 facade에서 재수출하지 않는다.
- `/api/planning/v3/batches/[id]/txn-overrides`, `/api/planning/v3/transactions/batches/[id]`, `/api/planning/v3/balances/monthly`, `/api/planning/v3/draft/profile`, `getBatchSummary`, `generateDraftPatchFromBatch`는 모두 explicit batch-scoped helper를 읽도록 정리했다.
- `/api/planning/v3/transactions/overrides`는 batch query/read/write/delete와 legacy read/write/delete를 각각 explicit helper로 호출하게 바꿔, internal/dev bridge route 성격을 코드 이름에서도 더 드러냈다.
- store/API 테스트를 갱신해 legacy listing vs internal merged bridge 구분, internal route의 `scope` 응답, batch route가 legacy unscoped row를 섞지 않는 동작을 확인했다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-txnOverridesStore.test.ts tests/planning-v3-overrides-api.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-txnOverridesBatchStore.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- `pnpm build`
- `git diff --check -- src/lib/planning/v3/store/txnOverridesStore.ts src/app/api/planning/v3/transactions/overrides/route.ts src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts tests/planning-v3-txnOverridesStore.test.ts tests/planning-v3-overrides-api.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts`
- `git diff --check -- src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/balances/monthly.ts src/lib/planning/v3/service/getBatchSummary.ts src/lib/planning/v3/service/generateDraftPatchFromBatch.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/draft/profile/route.ts tests/planning-v3-txnOverridesBatchStore.test.ts`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- `/api/planning/v3/transactions/batches/[id]/categorized`와 `/api/planning/v3/transactions/batches/[id]/cashflow`는 아직 owner module의 batch helper alias를 직접 읽는다. legacy unscoped helper를 읽지는 않지만 facade split이 완전히 끝난 것은 아니다.
- `txnOverridesStore.ts` 안에는 `getOverrides`/`listOverrides`/`upsertOverride`/`deleteOverride` generic compat alias가 남아 있다. 기존 호출부를 더 좁히면 후속 라운드에서 제거 가능하다.
- 워크트리에는 이번 라운드와 무관한 기존 dirty 변경이 함께 남아 있어, 후속 commit/PR에서는 override containment 범위를 별도로 분리하는 편이 안전하다.
