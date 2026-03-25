# N2 new-write-only source-binding slot spike

## 요약
- `ImportBatchMeta.importMetadata.sourceBinding` optional slot을 new write subset에만 추가했다.
- `importCsvToBatch()`는 normalized `provenance.fileName`이 있을 때만 trusted CSV text digest와 attested `fileName`을 `originKind: "writer-handoff"`와 함께 handoff/store 한다.
- omitted/blank-normalized `fileName`에서는 `fileNameProvided=false`만 남기고 `sourceBinding` slot은 만들지 않는다.
- append/merge path, detail/helper reader behavior, public API response shape는 바꾸지 않았다.

## 변경 파일
- `src/lib/planning/v3/domain/transactions.ts`
  - `StoredImportMetadata.sourceBinding` optional type 추가
- `src/lib/planning/v3/service/importCsvToBatch.ts`
  - new-write-only `sourceBinding` handoff 생성 추가
- `src/lib/planning/v3/store/batchesStore.ts`
  - `sourceBinding` 저장/복원 normalization 추가
- `tests/planning-v3-batchesStore-importCsvToBatch.test.ts`
  - slot 생성/비생성 및 round-trip 고정
- `tests/planning-v3-batches-import-csv-api.test.ts`
  - route response shape가 `sourceBinding`을 노출하지 않는다는 점 고정
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
  - new-write-only slot spike open + append/merge no-source closeout 유지 메모 반영

## 검증
- 실행
  - `pnpm test tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/lib/planning/v3/domain/transactions.ts src/lib/planning/v3/service/importCsvToBatch.ts src/lib/planning/v3/store/batchesStore.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/23/2026-03-23-n2-new-write-only-source-binding-slot-spike.md`
- 미실행
  - `pnpm lint`
  - `pnpm e2e:rc`
  - `pnpm test tests/planning-v3-batches-api.test.ts` (reader/helper path 비범위)

## 남은 리스크
- `sourceBinding`은 new write subset proof slot bootstrap일 뿐이고 retirement gating이나 fallback 제거 proof는 아니다.
- append/merge legacy carry surface는 여전히 explicit no-source closeout이며, same slot semantics를 거기로 넓히면 false-proof risk가 다시 열린다.
- `fileName` omitted와 blank-normalized input은 계속 `fileNameProvided=false` shared class로 남아 있다.

## 다음 라운드 메모
- 필요하다면 next cut은 reader retirement gating이 아니라 `sourceBinding` slot을 read-only proof candidate로 다루는 boundary audit부터 다시 좁혀야 한다.

## 사용 skill
- `planning-v3-batch-contract-narrowing`: stored-first batch metadata boundary 안에서 new-write-only slot을 최소 범위로 적용
- `planning-gate-selector`: 타깃 테스트 + build 검증 세트 선택
- `work-log-closeout`: `/work` 종료 기록 정리
