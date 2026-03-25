# 2026-03-23 N2 historical no-marker subset provenance evidence inventory audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-historical-no-marker-subset-provenance-evidence-inventory-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: `historical no-marker subset` 질문을 writer/store/read provenance evidence inventory 범위로만 좁히고, helper/public/detail fallback behavior 자체는 다시 열지 않는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: evidence map, subset 후보, 미실행 검증, 남은 historical provenance proof 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- blank-vs-omission split은 current recommendation으로 닫혔지만, provenance-only backfill과 `fileName` bridge retirement를 실제로 막는 핵심 debt는 pre-marker historical subset의 origin proof 부재에 남아 있다.
- 이번 라운드는 marker-aware new write subset과 historical no-marker subset을 다시 섞지 않고, no-marker subset에서 runtime이 today 확인 가능한 evidence와 확인 불가능한 evidence를 docs-first로 inventory하는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 historical no-marker subset provenance evidence inventory 메모를 추가해, current runtime이 직접 보는 historical class를 `!importMetadata`와 `fileNameProvided missing` pre-marker stored metadata로 나눠 적었다.
- 같은 메모에서 `marker-missing but otherwise stable` 후보로 `importMetadata.diagnostics present + stored provenance.fileName present + fileNameProvided missing` subset을 남기고, current visible `fileName`이 stored owner에 이미 묶여 있다는 점과 origin proof는 여전히 닫히지 않는다는 점을 함께 적었다.
- `origin fundamentally unresolved` 후보는 `fileNameProvided` marker missing + legacy `batch.fileName` present + (`!importMetadata` 또는 stored `provenance.fileName` blank)` subset으로 남기고, legacy label provenance와 blank stored provenance origin은 runtime에서 여전히 `[미확인]`이라고 정리했다.
- blank-vs-omission split 문제와 historical no-marker subset 문제를 계속 분리해야 하는 이유, 그리고 next cut이 필요하면 read-only inventory/helper audit이 가장 작다는 recommendation을 문서에 추가했다.
- `analysis_docs/v2/11...`에는 다음 `N2` cut이 split marker 구현이 아니라 historical no-marker subset evidence inventory audit이라는 연결 메모만 최소 범위로 추가했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-historical-no-marker-subset-provenance-evidence-inventory-audit.md`
  - PASS.
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- `marker-missing but otherwise stable` subset이라도 stored `fileName` origin이 original import인지 later migration/backfill인지 증명할 stamp는 없다. [검증 필요]
- `origin fundamentally unresolved` subset은 visible `fileName` compat bridge debt와 provenance-origin debt가 함께 남아 있어, backfill이나 fallback 제거를 proof 없이 열면 guessed provenance write 또는 visible continuity shrink가 생길 수 있다.
- future split marker가 추가되더라도 historical no-marker subset에는 소급 적용되지 않으므로, old batch provenance proof는 계속 별도 경로로 다뤄야 한다.
