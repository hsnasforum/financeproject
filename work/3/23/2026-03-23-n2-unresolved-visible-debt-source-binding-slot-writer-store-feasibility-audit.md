# 2026-03-23 N2 unresolved visible debt source-binding slot writer-store feasibility audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-unresolved-visible-debt-source-binding-slot-writer-store-feasibility-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: unresolved visible debt subset을 다시 넓히지 않고, writer/store-only feasibility와 append/merge false-proof risk만 문서에 좁혀 남기는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: writer/store feasibility boundary, 실제 실행 검증, 미실행 검증, 남은 false-proof 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 design memo는 minimal source-binding requirement를 닫았지만, current writer/store touchpoint 안에서 그 slot이 실제로 성립 가능한지와 append/merge drift 때문에 어디서 막히는지는 아직 별도 feasibility boundary로 정리되지 않았다.
- 이번 라운드는 source-binding field 구현이 아니라, new write subset feasibility와 append/merge false-proof risk를 docs-first로 좁히는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 source-binding slot writer/store feasibility 메모를 추가해, current stored writer touchpoint를 `importCsvToBatch()` metadata handoff와 `saveBatch()` -> `normalizeBatchMeta()` -> `normalizeStoredImportMetadata()`로 고정했다.
- 같은 메모에서 `feasible only for new write subset` 후보를 stored writer `importCsvToBatch()` 경로로 좁히고, row schema/public payload를 바꾸지 않고 batch metadata slot만 보는 편이 가장 작다고 정리했다.
- `append/merge blocks safe promotion` 후보는 legacy `appendBatchFromCsv()`의 `mergeBatchMeta()` carry와 merge 시 `intoBatch.fileName` + `intoBatch.sha256 || fromBatch.sha256` row `sourceInfo` 조합 때문에 current visible label과 digest가 drift할 수 있다는 점으로 적었다.
- false-proof risk matrix에는 `new write + trusted handoff + batch metadata persist`는 feasibility 후보, `legacy append current batch carry`와 `merge row sourceInfo reuse`는 false-proof high risk, `historical no-marker unresolved subset`은 slot feasibility와 별개로 explicit no-source closeout 성격이 강하다고 남겼다.
- `analysis_docs/v2/11...`에는 next `N2` cut이 broad schema 구현이 아니라 new-write-only writer/store slot spike 또는 append/merge/wider surface explicit no-source closeout이라는 메모만 최소 범위로 보정했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-unresolved-visible-debt-source-binding-slot-writer-store-feasibility-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- new write subset feasibility는 문서상의 가능성일 뿐이고, actual slot schema, explicit invalidation rule, retirement gating read path는 아직 구현되지 않았다. [미확인]
- append/merge path는 `fileName`/`sha256` auto-carry와 cross-batch reuse 때문에 false-proof risk가 크므로, invalidation/recompute rule 없이 wider surface로 확장하면 안 된다. [검증 필요]
- 이번 feasibility audit만으로 provenance-only backfill이나 `fileName` fallback 제거 안전성이 확보된 것은 아니다.
