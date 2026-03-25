# 2026-03-23 N2 fileNameProvided blank-normalization proof tightening

## 변경 파일
- `tests/planning-v3-batchesStore-importCsvToBatch.test.ts`
- `tests/planning-v3-batches-import-csv-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/23/2026-03-23-n2-fileNameProvided-blank-normalization-proof-tightening.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: `fileNameProvided=false` 의미를 writer/store marker semantics proof 범위로만 좁히고 reader behavior, public payload, compat bridge fallback은 그대로 두는 데 사용했다.
- `planning-gate-selector`: production code 무수정 round로 분류해 targeted `pnpm test`와 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: blank-normalized subcase proof, 실행 검증, 미실행 검증, 남은 marker semantics 리스크를 오늘 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 marker bootstrap 문서에는 `fileNameProvided=false`가 omitted 또는 blank-normalized input을 뜻한다고 적혀 있었지만, 테스트는 omitted case만 직접 고정하고 있어 explicit blank subcase의 proof가 약했다.
- 이번 라운드는 provenance backfill이나 reader behavior 변경이 아니라, current writer normalization 기준에서 blank `fileName`이 omission으로 접히는 사실을 테스트로 먼저 잠그는 것이 목적이었다.

## 핵심 변경
- `tests/planning-v3-batchesStore-importCsvToBatch.test.ts`에 explicit blank provenance subcase를 추가해 `provenance.fileName: "   "` 입력이 persisted `provenance.fileName` absent와 `fileNameProvided=false`로 저장된다는 점을 직접 고정했다.
- 같은 테스트는 `batchMeta` public shape가 여전히 `importMetadata`를 노출하지 않는다는 점도 유지 확인했다.
- `tests/planning-v3-batches-import-csv-api.test.ts`에 blank JSON `fileName` subcase를 추가해 route boundary가 blank input을 provenance omission으로 접고, response가 `provenance`, `importMetadata`, `metadataHandoff`, `fileNameProvided` 같은 새 public key를 노출하지 않는다는 점을 직접 고정했다.
- `analysis_docs/v2/13...`에는 blank-normalization proof test가 추가됐고, `fileNameProvided=false`가 still omitted 또는 blank-normalized input을 함께 뜻한다는 현재 contract를 더 또렷하게 적었다.
- `src/lib/planning/v3/service/importCsvToBatch.ts`와 route production code는 current contract와 이미 일치해 이번 라운드에서 수정하지 않았다.

## 검증
- `pnpm test tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts`
  - PASS. `17 passed`.
- `git diff --check -- src/lib/planning/v3/service/importCsvToBatch.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/23/2026-03-23-n2-fileNameProvided-blank-normalization-proof-tightening.md`
  - PASS.
- 미실행 검증:
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- `fileNameProvided=false`는 now proof level에서 omitted와 blank-normalized input을 모두 포함한다는 점이 더 또렷해졌지만, marker alone으로 둘을 서로 분리하지는 못한다. [미확인]
- route/service가 blank를 omission으로 접는 current normalization은 유지됐으므로, explicit blank를 별도 semantic class로 다루려면 future marker 확장이나 writer contract 변경이 필요하다. 이번 라운드 범위는 아니다.
- existing no-marker historical subset은 여전히 unresolved이고, 이 proof tightening만으로 provenance-only backfill이나 `fileName` fallback 제거의 safety가 새로 확보되지는 않는다. [검증 필요]
