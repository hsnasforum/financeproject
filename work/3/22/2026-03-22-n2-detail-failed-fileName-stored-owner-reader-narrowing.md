# 2026-03-22 N2 detail failed-fileName stored-owner reader narrowing

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-detail-failed-fileName-stored-owner-reader-narrowing.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail shell 한 surface만 유지한 채 `failed/fileName` source rule을 shared helper에서 stored-first로 좁히는 데 사용.
- `planning-gate-selector`: detail reader helper 변경으로 분류해 `batches` 회귀, batch-center regression 확인, `pnpm build`, `git diff --check`를 실행 검증으로 고정하는 데 사용.
- `work-log-closeout`: 실제 수정 파일, 실행 검증, 남은 legacy fallback 경계를 표준 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 이전 라운드에서 `ImportBatchMeta.importMetadata` persisted owner는 생겼지만, detail shell의 `batch.failed`, `stats.failed`, `fileName`은 아직 legacy summary를 직접 읽고 있었다.
- 이번 라운드는 public payload shape를 바꾸지 않고, shared helper가 stored owner를 먼저 읽고 legacy summary fallback은 truly missing case에만 남기도록 source rule만 좁힐 필요가 있었다.

## 핵심 변경
- `buildStoredFirstVisibleBatchShell()`이 `read.meta.importMetadata`를 먼저 읽고, `failed`는 `diagnostics.skipped`, `fileName`은 `provenance.fileName`을 source-of-truth로 사용하게 바꿨다.
- stored `importMetadata`가 없을 때만 기존 `getStoredFirstLegacyDetailSummaryFallback()`의 `legacyBatch.failed` / `legacyBatch.fileName`을 뒤 fallback으로 유지했다.
- `stats.failed`는 계속 detail route의 `toBatchDetailStats()`에서 `batch.failed` alias를 재사용하게 유지했다.
- `tests/planning-v3-batches-api.test.ts`에는 hybrid batch에서 stored owner가 legacy summary보다 우선하는 케이스와 stored-only batch가 persisted `importMetadata`로 `failed/fileName`을 읽는 케이스를 추가했다.
- contract 문서는 detail shell의 `failed/fileName` source map이 이제 `stored importMetadata -> legacy summary fallback` 순서라는 점만 최소 범위로 갱신했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm test tests/planning-v3-batch-center-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/lib/planning/v3/transactions/store.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-detail-failed-fileName-stored-owner-reader-narrowing.md`
- 미실행:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- detail shell은 stored owner를 먼저 읽지만, old stored meta나 pure legacy batch에서는 legacy summary fallback이 계속 남아 있다.
- `batch.total` / `stats.total`, raw `data`, derived `transactions` / `sample` / `accountMonthlyNet`, same-id account writer semantics는 이번 라운드에서 다시 열지 않았다.
- `importMetadata`는 public `meta`에 계속 숨겨져 있으므로, 후속 cut이 필요하면 다른 reader surface가 같은 stored owner를 어디까지 재사용할지 별도 확인이 필요하다.
