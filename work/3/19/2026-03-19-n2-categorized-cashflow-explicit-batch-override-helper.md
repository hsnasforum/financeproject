# 2026-03-19 N2 categorized/cashflow explicit batch override helper

## 변경 파일

- `src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `work/3/19/2026-03-19-n2-categorized-cashflow-explicit-batch-override-helper.md`

## 사용 skill

- `planning-gate-selector`: categorized/cashflow route와 targeted test 변경에 맞춰 필요한 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, compat alias 잔존 이유와 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 `legacy override bridge containment` 라운드 이후에도 `/api/planning/v3/transactions/batches/[id]/categorized`와 `/api/planning/v3/transactions/batches/[id]/cashflow`는 compat alias `getOverrides`를 그대로 읽고 있었다.
- 이번 배치는 broad refactor 없이, 두 user-facing projection route가 explicit `getBatchTxnOverrides`를 읽게 마무리하고 누락된 closeout note를 남기는 것이 목적이었다.
- `txnOverridesStore.ts`의 compat alias는 아직 다른 호출부와 테스트가 남아 있으므로 이번 라운드에서 무리하게 제거하지 않고, user-facing caller만 explicit helper로 좁히는 쪽을 택했다.

## 핵심 변경

- `categorized` route는 `getOverrides` 대신 `transactions/store.ts` facade의 `getBatchTxnOverrides`를 읽도록 바꿨다.
- `cashflow` route도 같은 방식으로 `getBatchTxnOverrides`를 읽게 바꿔, user-facing projection에서 compat alias 사용을 제거했다.
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`에 legacy unscoped override 무시 + batch-scoped override 적용 케이스를 추가해, cashflow route가 merged bridge가 아니라 batch owner를 읽는 의도를 검증했다.
- `tests/planning-v3-categorized-api.test.ts`와 `tests/planning-v3-txnOverridesStore.test.ts`는 기존 의도와 함께 유지했고, 이번 배치 검증 세트에 포함해 explicit helper adoption 이후에도 legacy bridge 경계가 유지되는지 다시 확인했다.

## 검증

- 실행한 확인
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts src/lib/planning/v3/store/txnOverridesStore.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-txnOverridesStore.test.ts work/3/19/2026-03-19-n2-categorized-cashflow-explicit-batch-override-helper.md`
- `pnpm test tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-txnOverridesStore.test.ts`
- `pnpm build`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- `txnOverridesStore.ts`의 `getOverrides`/`listOverrides`/`upsertOverride`/`deleteOverride` compat alias는 아직 남아 있다. 이번 라운드에서는 user-facing caller migration만 닫고, 다른 테스트/호출부를 깨지 않기 위해 제거하지 않았다.
- cashflow route 자체는 explicit helper adoption이 끝났지만, 여전히 legacy batch transaction read path(`readBatchTransactions`)를 사용한다. 이번 배치는 override helper 경계만 다뤘고 batch family read owner 정리는 다시 열지 않았다.
- 워크트리에는 이번 라운드와 무관한 기존 dirty 변경이 함께 남아 있어, 후속 commit/PR에서는 categorized/cashflow explicit helper 배치를 따로 분리하는 편이 안전하다.
