# 2026-03-22 N2 stored import command-metadata handoff bootstrap

## 변경 파일
- `src/lib/planning/v3/domain/transactions.ts`
- `src/lib/planning/v3/service/importCsvToBatch.ts`
- `src/app/api/planning/v3/batches/import/csv/route.ts`
- `src/app/api/planning/v3/transactions/batches/import-csv/route.ts`
- `tests/planning-v3-batchesStore-importCsvToBatch.test.ts`
- `tests/planning-v3-batches-import-csv-api.test.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-stored-import-command-metadata-handoff-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: persisted schema와 detail fallback은 그대로 두고, import command -> writer 직전 handoff contract만 최소 범위로 여는 데 사용.
- `planning-gate-selector`: API route + service helper 변경으로 분류해 지정된 서비스/route 테스트, 영향 route 테스트, `pnpm build`, `git diff --check`만 실행 검증으로 선택하는 데 사용.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 non-persisted risk를 표준 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 이전 audit에서 stored import path는 trusted `fileName` input도, parse-skip diagnostics summary handoff도 없어 future stored owner가 detail fallback을 대체할 최소 계약이 비어 있었다.
- 이번 라운드는 persisted stored schema를 바꾸지 않고도 route input -> `importCsvToBatch()` -> writer 직전까지 diagnostics/provenance handoff를 먼저 열어 둘 필요가 있었다.

## 핵심 변경
- `StoredImportDiagnosticsSummary`, `StoredImportProvenanceHandoff`, `StoredImportMetadataHandoff` internal type을 추가하고, `importCsvToBatch()`가 `metadataHandoff`로 `{ rows, parsed, skipped }`와 optional `fileName`을 반환하게 했다.
- `importCsvToBatch()`는 writer 전에만 handoff를 만들고, `ImportBatchMeta`, `index.json`, batch `ndjson` persisted schema는 그대로 유지했다.
- multipart import route는 trusted `File.name`을 provenance handoff로 넘기고, `/api/planning/v3/transactions/batches/import-csv` JSON route도 optional `fileName` input을 허용하게 했다.
- `batches/import/csv` route는 JSON `fileName` optional input과 text payload의 empty provenance boundary를 유지하면서 public response shape는 바꾸지 않았다.
- 테스트는 `metadataHandoff` 존재, multipart/json/text input contract, persisted schema에 diagnostics/provenance가 아직 저장되지 않는 점, 기존 public response shape 유지에 집중해 보강했다.
- contract 문서에는 handoff bootstrap이 열렸지만 persisted owner closeout은 아직 아니라는 메모만 최소 범위로 추가했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts`
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/import-csv/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/lib/planning/v3/service/importCsvToBatch.ts src/lib/planning/v3/domain/transactions.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-stored-import-command-metadata-handoff-bootstrap.md`
- 미실행:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- `metadataHandoff`는 아직 internal result일 뿐이라 stored batch meta/index/ndjson 어디에도 persisted되지 않는다.
- detail route의 `batch.failed`, `stats.failed`, `fileName` legacy fallback은 이번 라운드에서 그대로 남아 있고, future stored owner가 handoff를 실제 persisted metadata로 닫기 전에는 제거할 수 없다.
- text payload import는 trusted `fileName` source가 없으므로 provenance를 비운 채 유지된다.
