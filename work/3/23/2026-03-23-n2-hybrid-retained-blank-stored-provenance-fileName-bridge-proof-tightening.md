# 2026-03-23 N2 hybrid retained blank stored provenance fileName bridge proof tightening

## 변경 파일
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/23/2026-03-23-n2-hybrid-retained-blank-stored-provenance-fileName-bridge-proof-tightening.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: batch detail/helper surface 안에서 blank stored provenance hybrid-retained subcase만 가장 좁게 고정하는 데 사용했다.
- `planning-gate-selector`: 테스트 중심 planning v3 batch detail round로 분류해 `pnpm test tests/planning-v3-batches-api.test.ts`와 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고 나머지는 미실행 검증으로 남기는 데 사용했다.
- `work-log-closeout`: 실제 수정 파일, 실행 검증, helper 무수정 사실, 남은 provenance 리스크를 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 이전 audit에서 `hybrid-legacy-summary-retained + importMetadata.diagnostics present + stored provenance.fileName blank + legacyBatch.fileName present` subcase가 아직 테스트로 잠기지 않아, helper-owned `fileName` compat bridge가 intended contract인지 증명이 부족했다.
- 이번 라운드는 provenance backfill이나 fallback 제거가 아니라 blank stored provenance subcase proof tightening만 tests-first로 닫는 것이 목표였다.

## 핵심 변경
- `tests/planning-v3-batches-api.test.ts`에 blank stored provenance hybrid-retained fixture를 추가해 `getStoredFirstLegacyDetailFallbackClass()`가 `hybrid-legacy-summary-retained`를 반환하는지 고정했다.
- 같은 테스트에서 `getStoredFirstLegacyDetailSummaryRetentionWindow()`가 `retainsLegacyBatchFailed=false`, `retainsLegacyStatsFailedViaBatchAlias=false`, `retainsLegacyBatchFileName=true`를 반환하는지 고정했다.
- detail API output에서 `failed`, `total`, `ok`, `stats.failed`는 stored diagnostics/current visible-row rule을 유지하면서 `fileName`만 legacy summary fallback을 타는지 함께 검증했다.
- 테스트가 현재 helper contract와 바로 일치해 `src/lib/planning/v3/transactions/store.ts` production code는 수정하지 않았다.
- `analysis_docs/v2/13...`에는 blank stored provenance proof test가 추가돼 helper-owned `fileName` bridge proof가 닫혔고, 다음 cut은 backfill이 아니라 retirement proof tightening이라는 메모만 최소 범위로 반영했다.

## 검증
- `pnpm test tests/planning-v3-batches-api.test.ts`
  - PASS. `24 passed`.
- `git diff --check -- src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/23/2026-03-23-n2-hybrid-retained-blank-stored-provenance-fileName-bridge-proof-tightening.md`
  - PASS.
- 미실행 검증:
- `pnpm test tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm e2e:rc`
- `pnpm build`
  - helper code 무변경으로 이번 라운드에서는 실행하지 않았다.

## 남은 리스크
- blank stored provenance가 historical bootstrap gap인지, original import에서도 fileName input이 비어 있었던 정상 optional-input case인지 구분할 stored marker는 아직 없다. [미확인]
- current legacy `batch.fileName`을 trusted provenance source로 승격해도 된다는 migration/backfill 완료 사실은 여전히 없다.
- 이번 proof tightening은 helper-owned `fileName` bridge가 현재 intended contract임을 고정했을 뿐, provenance-only backfill 구현이나 `fileName` fallback retirement 조건 자체를 닫지는 않았다.
