# 2026-03-19 N2 stored-first hybrid snapshot policy

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/lib/planning/v3/service/getBatchSummary.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-getBatchSummary.test.ts`
- `work/3/19/2026-03-19-n2-stored-first-hybrid-snapshot-policy.md`

## 사용 skill

- `planning-gate-selector`: helper 계약 변경과 batch detail/summary/categorized/cashflow caller 영향 범위에 맞춰 필요한 targeted test와 `pnpm build` 중심 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, hybrid fallback 잔존 범위를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 지금까지 `stored-first + legacy fallback` 정책은 route마다 따로 해석되고 있었다. 특히 `stored meta`는 남아 있지만 transaction rows는 legacy bridge로 복구하는 hybrid 케이스에서, meta/source/fallback 이유를 caller가 각자 추론해야 했다.
- 그 결과 batch detail route는 `meta` fallback과 legacy detail fallback을 route-local로 다시 조립했고, categorized/cashflow도 metadata/account binding 보강을 위해 legacy helper를 직접 읽고 있었다.
- 이번 라운드는 broad rewrite 없이 `loadStoredFirstBatchTransactions()`가 hybrid snapshot policy를 더 많이 소유하도록 만들고, batch detail/summary 축부터 그 계약을 읽게 하는 것이 목적이었다.

## 핵심 변경

- `loadStoredFirstBatchTransactions()`는 이제 항상 normalized `meta`를 돌려주고, `policy`에 `transactionSource`, `metadataSource`, `usesLegacyTransactions`, `usesLegacyMetadata`, `needsLegacyDetailFallback`를 함께 실어 준다.
- helper는 snapshot 상태를 `stored-complete`, `stored-partial`, `hybrid-legacy-transactions`, `legacy-only`로 구분한다. 이로써 fallback이 transaction rows 때문인지, metadata/detail 때문인지 caller가 다시 추론하지 않게 했다.
- helper는 legacy bridge를 읽은 경우 `legacyBatch` fallback summary를 함께 돌려준다. `cashflow` route는 이를 이용해 `readBatch(id)` 없이도 account binding fallback을 처리한다.
- batch detail route는 helper가 정한 `meta`를 그대로 쓰고, `policy.needsLegacyDetailFallback`일 때만 `readBatch(id)`로 `batch/sample/stats`를 보강한다.
- `getBatchSummary`는 helper policy를 읽어 synthetic metadata일 때만 `createdAt` 노출을 막고, hybrid 케이스에서는 stored metadata의 `createdAt`을 유지하면서 legacy rows 집계를 사용한다.
- `categorized` route는 helper가 보장한 `meta`를 그대로 응답에 쓰고, legacy meta 보강용 `readBatch(id)`를 제거했다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `pnpm build`
- `git diff --check -- src/lib/planning/v3/transactions/store.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/service/getBatchSummary.ts src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts work/3/19/2026-03-19-n2-stored-first-hybrid-snapshot-policy.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- helper가 `meta`와 fallback 이유는 모았지만, `batch/sample/stats` 같은 legacy import summary projection은 아직 route-level `readBatch(id)` 보강에 남아 있다. 이번 라운드는 detail summary projection까지 helper로 올리지는 않았다.
- `stored-partial`이면서 legacy rows가 없는 경우 synthetic meta는 계속 `1970-01-01T00:00:00.000Z` 기반 `createdAt`을 사용한다. summary는 이를 숨기지만, detail route의 `meta.createdAt`에는 여전히 synthetic timestamp가 남을 수 있다.
- `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch`는 helper의 new policy 필드를 아직 읽지 않는다. 현재는 transactions 중심 consumer라 문제는 없지만, metadata/detail fallback 정합성까지 통일하려면 후속 라운드가 필요하다.
- 워크트리에는 이번 배치와 무관한 기존 dirty 변경이 함께 남아 있으므로, 후속 commit/PR에서는 hybrid snapshot policy 범위를 따로 분리하는 편이 안전하다.
