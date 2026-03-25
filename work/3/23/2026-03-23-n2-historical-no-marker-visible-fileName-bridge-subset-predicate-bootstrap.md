# 2026-03-23 N2 historical no-marker visible fileName bridge subset predicate bootstrap

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/23/2026-03-23-n2-historical-no-marker-visible-fileName-bridge-subset-predicate-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: historical no-marker unresolved subset 전체를 다시 넓히지 않고, visible `fileName` compat bridge debt가 실제로 남는 subset만 shared predicate로 좁히는 데 사용했다.
- `planning-gate-selector`: batch detail/helper change로 분류해 `pnpm test tests/planning-v3-batches-api.test.ts`, `pnpm build`, 지정된 `git diff --check -- ...`를 실행 검증으로 선택하고, 나머지 검증은 미실행으로 남겼다.
- `work-log-closeout`: predicate bootstrap 범위, 실행 검증, 미실행 검증, 남은 provenance proof 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 helper audit으로 historical no-marker subset은 `marker-missing-but-otherwise-stable`와 `origin-fundamentally-unresolved`로 읽을 수 있게 됐지만, unresolved subset 안에서도 legacy `batch.fileName` present/blank에 따라 actual visible `fileName` compat bridge debt 유무가 갈리는 경계는 아직 explicit predicate로 없었다.
- 이번 라운드는 backfill 구현이나 fallback 제거가 아니라, visible bridge debt가 실제로 남는 historical no-marker subset만 shared helper/test 수준에서 더 좁게 드러내는 것이 목적이었다.

## 핵심 변경
- `src/lib/planning/v3/transactions/store.ts`에 `hasHistoricalNoMarkerVisibleFileNameCompatBridge()`를 추가해 `classifyHistoricalNoMarkerProvenanceEvidence()`를 재사용하면서 `origin-fundamentally-unresolved + legacy batch.fileName present`일 때만 visible `fileName` compat bridge debt를 `true`로 돌리게 했다.
- 이 predicate는 `marker-missing-but-otherwise-stable` subset과 `origin-fundamentally-unresolved + legacy blank` subset을 visible debt에서 분리하고, existing detail shell / fallback window / public payload behavior는 그대로 유지한다.
- `tests/planning-v3-batches-api.test.ts`는 old gap legacy present, stable stored provenance present, unresolved legacy present, unresolved legacy blank 네 fixture에서 새 predicate truth table을 직접 고정했다.
- `analysis_docs/v2/13...`에는 visible bridge subset predicate bootstrap이 `classifyHistoricalNoMarkerProvenanceEvidence()`를 재사용하는 read-only refinement라는 메모만 최소 범위로 추가했다.

## 검증
- `pnpm test tests/planning-v3-batches-api.test.ts`
  - PASS. `25 passed`.
- `pnpm build`
  - PASS. Next.js production build completed successfully.
- `git diff --check -- src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/23/2026-03-23-n2-historical-no-marker-visible-fileName-bridge-subset-predicate-bootstrap.md`
  - PASS.
- 미실행 검증:
- `pnpm test tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- predicate는 visible debt subset을 더 좁게 보이게 할 뿐이고, legacy `batch.fileName`의 original provenance 여부나 marker missing 이유는 여전히 증명하지 못한다. [미확인]
- `origin-fundamentally-unresolved + legacy present`를 visible debt로 남긴다고 해서 backfill이나 `fileName` fallback 제거 안전성이 생기는 것은 아니다.
- future split marker나 provenance backfill이 열리더라도 historical no-marker subset 전체 proof는 계속 별도 경로로 닫아야 한다.
