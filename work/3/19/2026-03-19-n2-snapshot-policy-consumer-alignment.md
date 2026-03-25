# 2026-03-19 N2 snapshot policy consumer alignment

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/app/api/planning/v3/balances/monthly/route.ts`
- `src/app/api/planning/v3/draft/profile/route.ts`
- `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`
- `tests/planning-v3-balances-api.test.ts`
- `tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- `work/3/19/2026-03-19-n2-snapshot-policy-consumer-alignment.md`

## 사용 skill

- `planning-gate-selector`: consumer alignment 범위에 맞춰 balances/draft/generateDraftPatch targeted test와 `pnpm build` 중심 검증 세트를 유지하는 데 사용
- `work-log-closeout`: 실제 수정 파일, 실행한 명령, 남은 hybrid fallback 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `loadStoredFirstBatchTransactions()`는 이미 `policy`, `metadataSource`, `legacyBatch`를 돌려주지만, `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch`는 여전히 transaction rows만 읽고 batch-level account binding fallback을 각자 거의 해석하지 않고 있었다.
- 특히 stored snapshot rows에 `accountId`가 비어 있고 `meta.accounts`만 남아 있는 케이스에서, consumer가 helper 계약을 그대로 읽지 않으면 `unassigned` 잔액 계산이나 draft stats가 helper 정책과 어긋날 수 있었다.
- 이번 라운드는 broad rewrite 없이 transaction-centric consumer가 helper-owned account binding fallback을 직접 읽게 맞추는 것이 목적이었다.

## 핵심 변경

- `transactions/store.ts`에 `getStoredFirstBatchBindingAccountId()`와 `applyStoredFirstBatchAccountBinding()`를 추가해 `meta.accounts -> legacyBatch.accountId` 우선순위를 helper 계약으로 고정했다.
- `balances/monthly` route는 이제 `loadStoredFirstBatchTransactions()` 결과를 그대로 받아 helper가 보정한 transaction rows를 사용한다. route가 hybrid/legacy-only/stored-partial 상태를 직접 추론하지 않게 했다.
- `draft/profile` route도 helper가 보정한 transaction rows로 `aggregateMonthlyCashflow()`를 호출하도록 바꿨다. 응답 contract는 유지하고, 내부 입력 정규화만 helper 기준으로 맞췄다.
- `generateDraftPatchFromBatch`는 `applyStoredFirstBatchAccountBinding()`를 거친 rows를 pipeline 입력으로 사용한다. 이로써 transfer detection과 `stats.unassignedCount`가 stored meta account binding과 같은 기준을 읽게 했다.
- balances와 draft generation 테스트에는 stored rows의 `accountId`가 비어 있어도 batch-level binding이 적용되는 케이스를 보강했다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/draft/profile/route.ts src/lib/planning/v3/service/generateDraftPatchFromBatch.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts work/3/19/2026-03-19-n2-snapshot-policy-consumer-alignment.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- 이번 라운드는 consumer alignment만 다뤘기 때문에 `balances/monthly`와 `draft/profile`은 여전히 helper의 `policy.mode`나 `metadataSource`를 직접 읽지 않는다. 현재는 account binding 정렬에는 충분하지만, metadata/detail fallback 노출 정책까지 완전히 통일된 것은 아니다.
- `draft/profile` route는 account binding 정렬을 읽게 됐어도 현재 응답은 월 집계 기반이라 visible behavior 차이가 작다. 실제 효과는 `generateDraftPatchFromBatch`의 `unassignedCount`와 transfer detection 정합성 쪽에 더 크다.
- `legacyBatch.accountId` fallback은 helper 안으로 모았지만, legacy detail summary projection 자체는 별도 consumer에서 여전히 후속 정리가 필요할 수 있다.
- 워크트리에는 이번 배치와 무관한 기존 dirty 변경이 계속 남아 있으므로 후속 commit/PR 분리 시 주의가 필요하다.
