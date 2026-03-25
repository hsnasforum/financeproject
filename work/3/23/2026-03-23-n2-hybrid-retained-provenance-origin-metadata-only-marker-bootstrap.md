# 2026-03-23 N2 hybrid retained provenance-origin metadata-only marker bootstrap

## 변경 파일
- `src/lib/planning/v3/domain/transactions.ts`
- `src/lib/planning/v3/service/importCsvToBatch.ts`
- `src/lib/planning/v3/store/batchesStore.ts`
- `tests/planning-v3-batchesStore-importCsvToBatch.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/23/2026-03-23-n2-hybrid-retained-provenance-origin-metadata-only-marker-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: hybrid retained provenance-origin marker 범위를 writer/store metadata boundary로만 좁히고 public/detail reader behavior는 그대로 두는 데 사용했다.
- `planning-gate-selector`: writer/store/test/doc round로 분류해 targeted `pnpm test`, 필요 시 detail API test, `pnpm build`, 지정된 `git diff --check -- ...`를 실행 검증으로 선택했다.
- `work-log-closeout`: 실제 수정 파일, 실행 검증, 미실행 검증, marker bootstrap 이후에도 남는 historical no-marker 리스크를 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 audit에서 smallest useful provenance-origin marker 후보가 `importMetadata.provenance.fileNameProvided: boolean`으로 좁혀졌고, 이번 라운드는 그 marker를 실제 stored batch metadata boundary에 bootstrap하는 first cut이 필요했다.
- 목표는 provenance backfill이나 fallback 제거가 아니라, new write부터 trusted `fileName` handoff 여부를 stored metadata에 남길 수 있게 하고 public payload/detail helper output은 그대로 유지하는 것이었다.

## 핵심 변경
- `src/lib/planning/v3/domain/transactions.ts`의 `StoredImportProvenanceHandoff`에 optional `fileNameProvided` marker를 추가해 historical no-marker batch와 new marker-aware batch를 같은 metadata contract 안에서 함께 읽을 수 있게 했다.
- `src/lib/planning/v3/service/importCsvToBatch.ts`는 writer handoff에서 non-empty trusted `fileName`이 있으면 `fileNameProvided=true`, 없으면 `false`를 `metadataHandoff.provenance`에 기록하게 바꿨다.
- `src/lib/planning/v3/store/batchesStore.ts`는 `normalizeStoredImportMetadata()`에서 marker를 persist/rehydrate하도록 보강하되, marker가 없는 old metadata는 그대로 읽게 유지했다.
- `tests/planning-v3-batchesStore-importCsvToBatch.test.ts`는 provided case의 `fileNameProvided=true`, omitted case의 `fileNameProvided=false`, stored metadata round-trip, row schema 무변경을 직접 고정했다.
- `analysis_docs/v2/13...`에는 metadata-only marker bootstrap이 now opened 됐지만 current route/writer normalization은 blank `fileName`을 계속 omission으로 접고, reader behavior/public payload/compat bridge fallback은 아직 후속 컷이라는 메모만 최소 범위로 추가했다.

## 검증
- `pnpm test tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts`
  - PASS. `15 passed`.
- `pnpm test tests/planning-v3-batches-api.test.ts`
  - PASS. `25 passed`.
- `pnpm build`
  - PASS. Next.js production build completed successfully.
- `git diff --check -- src/lib/planning/v3/domain/transactions.ts src/lib/planning/v3/service/importCsvToBatch.ts src/lib/planning/v3/store/batchesStore.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/23/2026-03-23-n2-hybrid-retained-provenance-origin-metadata-only-marker-bootstrap.md`
  - PASS.
- 미실행 검증:
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- current route/writer normalization은 blank `fileName`을 omission으로 접기 때문에 `fileNameProvided=false`는 omitted와 blank-normalized input을 함께 뜻한다. explicit blank vs omission을 분리하는 proof는 아직 없다. [미확인]
- marker는 new write부터만 생기므로 existing no-marker historical subset은 여전히 unresolved다. 이 marker alone으로 historical handoff gap, malformed/stripped metadata, pure optional omission을 runtime에서 곧바로 완전히 가를 수는 없다. [검증 필요]
- marker bootstrap만으로 legacy `batch.fileName`의 original provenance 여부, later append/merge drift 부재, migration/backfill 완료 사실은 증명하지 못하므로, provenance-only backfill이나 `fileName` fallback 제거를 바로 열면 guessed provenance write 또는 premature visible contract shrink 위험이 남는다.
