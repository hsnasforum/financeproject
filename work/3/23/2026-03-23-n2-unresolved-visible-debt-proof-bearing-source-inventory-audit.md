# 2026-03-23 N2 unresolved visible debt proof-bearing source inventory audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-unresolved-visible-debt-proof-bearing-source-inventory-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: historical no-marker helper/read boundary를 다시 열지 않고 unresolved visible debt subset에서 existing source가 proof-bearing source가 되는지 여부만 좁혀 정리하는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: current source inventory, 실제 실행 검증, 미실행 검증, 남은 provenance/source-binding 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- unresolved visible debt subset의 retirement-proof boundary는 닫혔지만, current codebase 안에 이미 proof X를 만들 수 있는 persisted/readable source가 있는지는 아직 문서에 inventory로 정리되지 않았다.
- 이번 라운드는 새 marker나 backfill 구현이 아니라, existing source만으로 unresolved visible debt를 retire할 수 있는지 여부와 어떤 source가 proof처럼 보여도 불충분한지를 docs-first로 잠그는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 unresolved visible debt proof-bearing source inventory 메모를 추가해, current stored batch metadata/detail helper path에서 실제로 읽는 값이 `importMetadata.diagnostics`, `importMetadata.provenance.fileName`, `importMetadata.provenance.fileNameProvided`, helper-carried `legacy batch.fileName` 정도라고 정리했다.
- 같은 메모에서 `V3ImportBatch.sha256`, row-level `sourceInfo.{fileName,sha256}`는 domain/legacy write surface에는 존재하지만 current `ImportBatchMeta.importMetadata`에 persisted binding이 없고 helper path도 읽지 않으므로 현재 proof-bearing source가 아니라고 적었다.
- `already persisted but insufficient` 후보로 `legacy batch.fileName`, batch-level `fileName` blank/present, `fileNameProvided`, diagnostics counts, legacy `batch.sha256` alone을 남기고, append/merge path 때문에 legacy `sha256` alone도 immutable original-handoff proof로 보기 어렵다고 정리했다.
- `maybe promotable only with extra binding` 후보는 legacy `batch.sha256` + row-level `sourceInfo.sha256` 조합으로 좁혔고, stored batch metadata에 visible legacy label과 same artifact임을 묶는 audited binding이 추가될 때만 승격 가능하다고 남겼다.
- `analysis_docs/v2/11...`에는 current inventory 기준 existing source alone으로는 proof X를 만들 수 없고, 후속이 열리더라도 schema 확장보다 source-binding design memo 또는 explicit no-source closeout이 먼저라는 연결 메모만 최소 범위로 보정했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-unresolved-visible-debt-proof-bearing-source-inventory-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- current codebase에 stored batch-level source binding이나 audited completion source가 실제로 없으므로, `maybe promotable` 후보도 아직 문서상의 가능성일 뿐이다. [미확인]
- legacy `batch.sha256`와 row-level `sourceInfo.sha256`는 current helper/read path에 들어오지 않고 append/merge path 영향도 받으므로, immutable handoff proof처럼 과장하면 안 된다.
- 이번 inventory audit만으로 provenance-only backfill이나 `fileName` fallback 제거 안전성이 확보된 것은 아니다.
