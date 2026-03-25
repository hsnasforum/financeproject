# 2026-03-23 N2 sourceBinding read-only proof-candidate boundary audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-sourceBinding-read-only-proof-candidate-boundary-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: `sourceBinding` slot을 reader retirement gating이나 public exposure로 과장하지 않고, current reader/helper contract와 next-cut boundary만 좁혀 남기는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: current read-only proof-candidate boundary, 실행 검증, 미실행 검증, 남은 proof 리스크를 저장소 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- `ImportBatchMeta.importMetadata.sourceBinding` slot spike는 이미 열렸지만, current reader/helper path가 이 slot을 어디까지 internal proof candidate로만 읽을 수 있는지와, 어디부터는 아직 금지된 해석인지가 문서에 분리돼 있지 않았다.
- 이번 라운드는 reader retirement gating 구현이나 fallback 제거가 아니라, current `sourceBinding` slot이 말할 수 있는 최소 사실과 아직 말할 수 없는 범위를 docs-first로 잠그는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 `sourceBinding` read-only proof-candidate boundary memo를 추가해, `toStoredFirstPublicImportBatchMeta()`가 `importMetadata` 전체를 숨기고 `buildStoredFirstVisibleBatchShell()`도 `diagnostics`/`provenance.fileName`만 읽는다는 current reader/helper visibility map을 남겼다.
- 같은 메모에서 `sourceBinding present`가 뜻하는 최소 사실을 “new write subset에서 trusted CSV text digest와 attested visible fileName handoff가 `originKind: "writer-handoff"`로 batch metadata owner boundary에 함께 저장됐다”로 좁혔다.
- 반대로 current slot alone으로는 `fileName` fallback 제거 proof, append/merge proof, historical no-marker subset proof, unresolved visible debt retirement proof, public payload 노출 근거가 되지 않는다는 점을 명시했다.
- `smallest safe next cut`은 reader retirement gating 구현이 아니라, `sourceBinding` present subset을 helper-owned internal read-only classifier/inventory로 식별하는 좁은 helper cut으로 갱신했다.
- `analysis_docs/v2/11...` backlog 메모도 same boundary로 맞춰, append/merge explicit no-source closeout을 유지한 채 current `sourceBinding` slot을 internal read-only candidate로만 다루는 후속 컷을 남겼다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-sourceBinding-read-only-proof-candidate-boundary-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- current `sourceBinding` slot은 internal read-only proof candidate일 뿐이고, reader retirement gating이나 fallback 제거 proof로 승격된 상태가 아니다.
- append/merge/wider legacy surface는 계속 explicit no-source closeout이며, same slot semantics를 거기로 넓히면 false-proof risk가 다시 열린다. [검증 필요]
- historical no-marker unresolved subset은 그대로 남아 있으므로, 이번 boundary audit만으로 provenance backfill이나 `fileName` fallback 제거 안전성이 확보된 것은 아니다.
