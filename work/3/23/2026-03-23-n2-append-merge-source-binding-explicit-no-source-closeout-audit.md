# 2026-03-23 N2 append-merge source-binding explicit no-source closeout audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-append-merge-source-binding-explicit-no-source-closeout-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: source-binding proof semantics를 append/merge까지 넓히지 않고, no-source closeout으로 배제해야 할 wider legacy surface만 좁혀 남기는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: append/merge explicit no-source boundary, 실행 검증, 미실행 검증, 남은 false-proof 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 feasibility audit으로 `new write subset만 좁은 feasibility가 있다`는 점은 닫혔지만, 반대편인 append/merge/wider legacy carry surface는 왜 현재 explicit no-source closeout으로 남겨야 하는지가 아직 문서에 충분히 명시되지 않았다.
- 이번 라운드는 source-binding proof semantics를 append/merge까지 넓히지 않는 경계를 docs-first로 잠가, 다음 구현 컷이 `new-write-only slot spike`를 넘지 않게 만드는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 append/merge explicit no-source closeout 메모를 추가해, false-proof touchpoint를 `mergeBatchMeta()`의 incoming `fileName`/`sha256` carry, merge row 생성 시 `intoBatch.fileName` + `intoBatch.sha256 || fromBatch.sha256` 재사용, `pickLegacyBatchFallback()`를 통한 detail visible `fileName` compat carry로 정리했다.
- 같은 메모에서 explicit no-source closeout 대상 surface를 `appendBatchFromCsv()` summary carry, merge row `sourceInfo` reuse, wider legacy summary carry를 읽는 detail visible compat surface로 고정했다.
- `new-write-only spike allowed` boundary는 stored writer `importCsvToBatch()` -> stored batch metadata slot까지만 허용하고, append-only legacy writer, merge path, wider legacy carry surface는 같은 proof semantics를 열지 않는다고 적었다.
- `historical no-marker unresolved subset`은 source absence 문제이고 append/merge는 carried/reused source drift 문제라서, 둘을 같은 class로 묶지 않는다는 점도 문서에 분리해 남겼다.
- `analysis_docs/v2/11...`에는 next `N2` cut이 broader surface가 아니라 append/merge explicit no-source closeout을 유지한 채 `new-write-only writer/store slot spike`만 허용하는 경계라는 메모만 최소 범위로 보정했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-append-merge-source-binding-explicit-no-source-closeout-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- append/merge/wider legacy surface를 no-source closeout으로 묶는 경계는 문서상 합의일 뿐이고, actual code는 여전히 legacy carry를 계속한다. [미확인]
- explicit invalidation rule, audited recompute rule, append/merge proof field가 없으므로, 이후 구현이 이 closeout 경계를 어기면 false-proof risk가 바로 재유입된다. [검증 필요]
- 이번 audit만으로 provenance-only backfill이나 `fileName` fallback 제거 안전성이 확보된 것은 아니다.
