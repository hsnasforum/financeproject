# 2026-03-19 N2 category semantics normalization

## 변경 파일

- `src/lib/planning/v3/service/categorySemantics.ts`
- `src/lib/planning/v3/service/applyOverrides.ts`
- `src/lib/planning/v3/service/aggregateMonthlyCashflow.ts`
- `src/lib/planning/v3/service/categorizeTransactions.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-applyOverrides.test.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-categorized-api.test.ts`
- `tests/planning-v3-getBatchSummary.test.ts`
- `tests/planning-v3-draft-profile-api.test.ts`
- `work/3/19/2026-03-19-n2-category-semantics-normalization.md`

## 사용 skill

- `finance-skill-routing`: 구현 라운드에 필요한 최소 skill 조합을 고르고, route SSOT 변경 없이 category semantics normalization 범위만 유지하는 데 사용
- `planning-gate-selector`: service/API/test 변경에 맞춰 targeted test와 `pnpm build` 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `batch-scoped override.categoryId`가 user-facing surface마다 다른 의미로 읽혀, batch detail에서는 상세 category가 `unknown`으로 눌리고 cashflow/draft에서는 `fixed/variable` 해석이 route-local에 가까웠다.
- `N2` owner boundary를 유지한 채, `categoryId`를 canonical 값으로 보존하면서 상세 category와 `fixed/variable` 집계 의미를 분리할 필요가 있었다.
- legacy unscoped override 경계를 다시 열지 않고 batch-scoped override contract만 정리하는 가장 작은 수정이 필요했다.

## 핵심 변경

- `categorySemantics` helper를 추가해 canonical `categoryId` 해석과 `fixed/variable` expense flow 판정을 공통 규칙으로 묶었다.
- `applyTxnOverrides`가 batch-scoped override의 상세 `categoryId`를 보존하고, downstream service가 같은 canonical 값을 읽을 수 있게 정리했다.
- batch detail API는 상세 category를 더 이상 `unknown`으로 축소하지 않고 `category`/`categoryId`에 그대로 반영하도록 맞췄다.
- `aggregateMonthlyCashflow`는 `housing`, `insurance`, `tax`, `debt`, `fixed`를 공통 `fixed` 집계로, 나머지 상세 expense category를 `variable` 집계로 처리하도록 shared helper를 사용하게 바꿨다.
- categorized, summary, draft 관련 테스트를 갱신해 상세 category 보존과 fixed-set 해석이 함께 유지되는지 확인했다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-applyOverrides.test.ts tests/planning-v3-aggregate.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-draft-profile-api.test.ts`
- `pnpm build`
- `git diff --check -- src/lib/planning/v3/service/categorySemantics.ts src/lib/planning/v3/service/applyOverrides.ts src/lib/planning/v3/service/aggregateMonthlyCashflow.ts src/lib/planning/v3/service/categorizeTransactions.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts tests/planning-v3-applyOverrides.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-draft-profile-api.test.ts`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- 이번 라운드는 `override.categoryId` normalization에만 범위를 제한해서, batch detail의 기본 분류 자체를 categorized route와 동일한 상세 taxonomy로 완전히 통합한 것은 아니다.
- shared fixed-set이 현재 `DRAFT_PROFILE_POLICY.fixedCategoryIds`를 재사용하므로, 후속 라운드에서 fixed/variable 정책을 독립 계약으로 분리해야 하면 다시 점검이 필요하다.
- 워크트리에는 이전 라운드의 관련 변경과 unrelated dirty 파일이 함께 남아 있으므로, 후속 commit 시 범위를 더 엄격히 구분해야 한다.
