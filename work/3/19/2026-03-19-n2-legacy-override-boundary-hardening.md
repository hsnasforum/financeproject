# 2026-03-19 N2 legacy override boundary hardening

## 변경 파일

- `src/lib/planning/v3/store/txnOverridesStore.ts`
- `src/lib/planning/v3/service/getBatchSummary.ts`
- `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `src/lib/planning/v3/balances/monthly.ts`
- `src/app/api/planning/v3/draft/profile/route.ts`
- `src/app/api/planning/v3/balances/monthly/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/app/api/planning/v3/transactions/overrides/route.ts`
- `tests/planning-v3-txnOverridesStore.test.ts`
- `tests/planning-v3-overrides-api.test.ts`
- `tests/planning-v3-draft-profile-api.test.ts`
- `tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- `tests/planning-v3-getBatchSummary.test.ts`
- `tests/planning-v3-balances-api.test.ts`
- `tests/planning-v3-categorized-api.test.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/19/2026-03-19-n2-legacy-override-boundary-hardening.md`

## 사용 skill

- `finance-skill-routing`: 구현 라운드에 필요한 skill 조합을 최소 범위로 고르고, `route-ssot-check` 없이 owner boundary와 검증 중심으로 작업 범위를 고정하는 데 사용
- `planning-gate-selector`: override store, service, API route 변경에 맞춰 targeted test + `pnpm build` 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 잔여 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `N2` 문서 기준으로 `planning/v3` public/user-facing contract는 `batch-scoped override`만 읽어야 하는데, 현재 일부 read path가 `legacy unscoped override` fallback을 기본 합성하고 있었다.
- 이 상태에서는 legacy bridge 데이터가 user-facing 배치 요약, draft, balances, categorized/cashflow projection에 섞여 owner boundary가 흐려졌다.
- legacy override 자체는 dev/internal bridge로 남기되, public read flow의 기본 의존만 끊는 가장 작은 수정이 필요했다.

## 핵심 변경

- `txnOverridesStore`에 `listLegacyOverrides()`를 추가하고, `getOverrides(batchId)`는 batch-scoped 전용 read helper로 유지했다.
- `listOverrides()`는 merged internal bridge 용도로만 남기고, user-facing read path에서는 더 이상 사용하지 않도록 경로를 교체했다.
- `getBatchSummary`, `generateDraftPatchFromBatch`, draft profile API, monthly balances API, batch detail/categorized/cashflow API가 모두 `getOverrides(batchId)`만 읽도록 정리했다.
- internal/dev bridge인 `transactions/overrides` API는 legacy 조회 응답에 `scope: "legacy-unscoped"`를 명시하고, batch 조회/쓰기 응답에는 `scope: "batch-scoped"`를 넣어 경계를 더 드러냈다.
- store/API/service 테스트를 보강해 legacy override는 무시되고 batch-scoped override만 적용되는 동작을 검증했다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-txnOverridesStore.test.ts tests/planning-v3-txnOverridesBatchStore.test.ts tests/planning-v3-overrides-api.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-internal-route-contract.test.ts`
- `pnpm build`
- `git diff --check -- src/lib/planning/v3/store/txnOverridesStore.ts src/lib/planning/v3/service/getBatchSummary.ts src/lib/planning/v3/service/generateDraftPatchFromBatch.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/balances/monthly.ts src/app/api/planning/v3/draft/profile/route.ts src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts src/app/api/planning/v3/transactions/overrides/route.ts tests/planning-v3-txnOverridesStore.test.ts tests/planning-v3-overrides-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batches-api.test.ts`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- legacy override 쓰기 엔드포인트는 internal/dev bridge로 남아 있으므로, 운영자나 개발자가 legacy 데이터를 계속 남길 수는 있다. 다만 이번 변경 이후 user-facing read path에서는 기본 반영되지 않는다.
- 일부 내부 경로나 ad-hoc 디버그 스크립트가 merged `listOverrides()`를 직접 읽을 가능성은 남아 있다. 이번 라운드 범위에서는 user-facing contract 경계만 정리했다.
- batch-scoped override의 `categoryId`는 route별 해석이 다를 수 있어, 후속 라운드에서 추가 projection surface를 손볼 때는 `fixed/variable`와 세부 카테고리 해석 차이를 다시 확인해야 한다.
