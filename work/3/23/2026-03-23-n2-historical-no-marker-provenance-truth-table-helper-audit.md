# 2026-03-23 N2 historical no-marker provenance truth-table helper audit

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/23/2026-03-23-n2-historical-no-marker-provenance-truth-table-helper-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: historical no-marker provenance classification을 shared helper 범위로만 좁히고, detail shell/fallback/output behavior는 그대로 두는 데 사용했다.
- `planning-gate-selector`: batch detail/helper change로 분류해 `pnpm test tests/planning-v3-batches-api.test.ts`, `pnpm build`, 지정된 `git diff --check -- ...`를 실행 검증으로 선택하고, 나머지 검증은 미실행으로 남겼다.
- `work-log-closeout`: helper bootstrap 범위, 실행 검증, 미실행 검증, 남은 provenance proof 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 inventory audit으로 historical no-marker subset evidence boundary는 문서에 닫혔지만, current runtime에는 `!importMetadata`, `fileNameProvided missing`, stored provenance present/blank, legacy `batch.fileName` present/blank 조합을 한 곳에서 읽는 explicit helper가 없었다.
- 이번 라운드는 backfill 구현이나 fallback 제거가 아니라, 그 truth table을 helper/test 수준에서 read-only classification으로 bootstrap하는 것이 목적이었다.

## 핵심 변경
- `src/lib/planning/v3/transactions/store.ts`에 `classifyHistoricalNoMarkerProvenanceEvidence()`를 추가해 `old-stored-meta-importMetadata-gap`과 pre-marker `fileNameProvided missing` subset을 read-only truth table object로 분류할 수 있게 했다.
- helper는 `marker-missing-but-otherwise-stable`과 `origin-fundamentally-unresolved`만 구분하고, `buildStoredFirstVisibleBatchShell()`, fallback window, public payload behavior는 전혀 바꾸지 않았다.
- `tests/planning-v3-batches-api.test.ts`는 기존 old gap / stored provenance present / blank+legacy present / blank+legacy blank detail fixtures에 helper classification assertion을 추가해 네 가지 truth table을 직접 고정했다.
- `analysis_docs/v2/13...`에는 truth-table helper bootstrap이 열렸지만 evidence classification only이며 backfill/fallback removal이 아니라는 메모만 최소 범위로 추가했다.

## 검증
- `pnpm test tests/planning-v3-batches-api.test.ts`
  - PASS. `25 passed`.
- `pnpm build`
  - PASS. Next.js production build completed successfully.
- `git diff --check -- src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/23/2026-03-23-n2-historical-no-marker-provenance-truth-table-helper-audit.md`
  - PASS.
- 미실행 검증:
- `pnpm test tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- helper는 current runtime evidence를 truth table로 정리할 뿐이고, marker missing 이유나 legacy `batch.fileName`의 original provenance 여부는 여전히 증명하지 못한다. [미확인]
- `marker-missing-but-otherwise-stable`와 `origin-fundamentally-unresolved` 경계도 provenance origin completion이 아니라 read-only evidence classification일 뿐이므로, backfill이나 `fileName` fallback 제거 안전성을 새로 주지 않는다.
- future split marker가 추가되더라도 historical no-marker subset 전체에는 소급 적용되지 않으므로, old batch provenance proof는 계속 별도 경로로 다뤄야 한다.
