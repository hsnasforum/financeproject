# 2026-03-22 N2 stored batch metadata diagnostics-provenance owner bootstrap

## 변경 파일
- `src/lib/planning/v3/domain/transactions.ts`
- `src/lib/planning/v3/store/batchesStore.ts`
- `src/lib/planning/v3/service/importCsvToBatch.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batchesStore-importCsvToBatch.test.ts`
- `tests/planning-v3-batches-import-csv-api.test.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-stored-batch-metadata-diagnostics-provenance-owner-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail fallback이나 row schema는 그대로 두고, batch-level stored metadata owner만 최소 범위로 여는 데 사용.
- `planning-gate-selector`: schema/store/service 변경 + public meta projection helper 영향으로 분류해 store/import tests, batches regression, batch-center regression, `pnpm build`, `git diff --check`를 실행 검증으로 선택하는 데 사용.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, persisted owner와 public fallback 사이의 남은 경계를 표준 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 이전 라운드에서 `metadataHandoff`는 writer 직전 internal result까지만 열려 있었고, stored batch meta/index에는 diagnostics/provenance owner가 아직 없었다.
- 이번 라운드는 broad writer redesign 없이 `failed`용 diagnostics summary와 `fileName` provenance를 batch-level stored metadata에 먼저 저장해, future detail fallback 제거가 읽을 persisted source-of-truth를 bootstrap할 필요가 있었다.

## 핵심 변경
- `ImportBatchMeta`에 optional `importMetadata` boundary를 추가하고, 그 내부 shape를 `{ diagnostics: { rows, parsed, skipped }, provenance: { fileName? } }`로 고정했다.
- `batchesStore`는 `normalizeBatchMeta()`와 `saveBatch()` 경로에서 `importMetadata`를 index/meta boundary에 저장·복원하고, batch `ndjson` row schema는 그대로 유지했다.
- `importCsvToBatch()`는 existing `metadataHandoff`를 그대로 유지하면서, 동일한 값을 persisted `ImportBatchMeta.importMetadata`로 저장하도록 연결했다.
- public list/detail `meta` projection helper는 새 internal slot을 계속 숨기게 바꿔서, stored owner bootstrap이 바로 public API contract 확장으로 이어지지 않게 막았다.
- store/service regression은 stored meta/index에 `importMetadata`가 저장되는지와, import route/detail/list public response는 `importMetadata`를 계속 노출하지 않는지 중심으로 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts`
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm test tests/planning-v3-batch-center-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/lib/planning/v3/domain/transactions.ts src/lib/planning/v3/store/batchesStore.ts src/lib/planning/v3/service/importCsvToBatch.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-stored-batch-metadata-diagnostics-provenance-owner-bootstrap.md`
  - `git diff --check -- src/lib/planning/v3/transactions/store.ts`
- 미실행:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- stored owner bootstrap은 열렸지만 detail route의 `batch.failed`, `stats.failed`, `fileName`은 아직 legacy fallback을 유지한다. reader cut이 닫히기 전에는 public source rule이 그대로다.
- `importMetadata`는 stored meta/index boundary에만 저장되고 row `ndjson`에는 내려가지 않는다. 이 round는 batch-level owner bootstrap이지 row-level provenance redesign이 아니다.
- text payload import는 trusted `fileName` source가 없으므로 provenance는 빈 object로 저장된다.
