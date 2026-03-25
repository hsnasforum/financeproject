# 2026-03-19 N2 batch detail stored-first normalization

## 변경 파일

- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/19/2026-03-19-n2-batch-detail-stored-first-normalization.md`

## 사용 skill

- `planning-gate-selector`: batch detail API route normalization 변경에 맞춰 필요한 targeted test와 `pnpm build` 중심 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 남은 legacy fallback 범위를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 라운드에서 `categorized`와 `cashflow`는 stored-first batch read로 좁혀졌지만, `/api/planning/v3/transactions/batches/[id]`는 여전히 `loaded.source === "legacy"` 전용 early-return branch가 남아 있었다.
- 그 결과 batch detail route는 stored-first reader를 쓰면서도 응답 normalization이 stored path와 legacy path로 이원화돼 있었고, legacy bridge fallback 범위가 코드에서 명확히 드러나지 않았다.
- 이번 라운드는 broad refactor 없이, batch detail 응답을 stored-first 기준으로 한 번만 조립하고 legacy detail은 필요한 필드에만 남기는 최소 수정이 목적이었다.

## 핵심 변경

- batch detail route는 `loadStoredFirstBatchTransactions(id)`가 고른 transaction rows를 기준으로 `transactions`, `data`, `monthsSummary`, `accountMonthlyNet`를 한 번만 계산하게 바꿨다.
- `meta`도 stored meta가 있으면 그것을 그대로 쓰고, stored meta가 없을 때만 legacy batch detail 또는 synthetic meta로 fallback 하도록 정리했다.
- `readBatch(id)` legacy fallback은 `batch`, `sample`, `stats`처럼 stored snapshot metadata만으로는 legacy import summary를 완전히 재현하기 어려운 필드 보강에만 남겼다.
- batch detail 테스트에 stored shadow batch 정규화 검증을 보강해 `batch`, `sample`, `stats`, `monthsSummary`, `accountMonthlyNet`까지 stored snapshot 기준으로 응답이 맞춰지는지 확인했다.
- legacy-only batch 테스트에는 `fileName`과 `sample` 확인을 추가해 legacy detail fallback이 metadata/detail 보강 용도로는 계속 유지되는지 잠갔다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/service/getBatchSummary.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts work/3/19/2026-03-19-n2-batch-detail-stored-first-normalization.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`
- 실행하지 않은 추가 검증
- `pnpm test tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- 이유: 이번 라운드는 batch detail route-local normalization만 수정했고, categorized/cashflow route와 shared stored-first helper 본문은 다시 열지 않았다.

## 남은 리스크

- batch detail route는 stored-first normalization을 강화했지만, legacy-only import summary 필드(`batch.fileName`, 일부 `stats`)는 아직 `readBatch(id)` fallback에 기대고 있어 `stored-only`는 아니다.
- `loadStoredFirstBatchTransactions()` helper 자체는 이번 라운드에서 바꾸지 않았으므로, stored meta가 partial이고 transaction rows는 legacy bridge로 복구되는 혼합 케이스의 normalization 정책은 route별로 다시 확인해야 한다.
- 워크트리에는 이번 배치와 무관한 기존 dirty 변경이 함께 남아 있으므로, 후속 commit/PR에서는 batch detail normalization 범위를 따로 분리하는 편이 안전하다.
