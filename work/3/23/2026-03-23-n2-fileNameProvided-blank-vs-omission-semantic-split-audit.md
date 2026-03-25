# 2026-03-23 N2 fileNameProvided blank-vs-omission semantic split audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-fileNameProvided-blank-vs-omission-semantic-split-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: `fileNameProvided=false`의 semantic split 질문을 writer/store metadata contract audit으로만 좁히고, reader/public/detail fallback은 그대로 두는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: current semantics map, keep-equivalent vs split-marker 후보, 미실행 검증, 남은 historical no-marker 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 proof tightening으로 `fileNameProvided=false`가 omitted뿐 아니라 blank-normalized input도 뜻한다는 사실은 테스트로 닫혔다.
- 이번 라운드는 그 다음 질문인 "blank와 omission을 future metadata contract에서 굳이 갈라야 하는가"를 docs-first로 잠그고, marker 확장 구현이나 writer redesign은 보류하는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 blank-vs-omission semantic split audit 메모를 추가해, current `fileNameProvided=false`가 "trusted non-empty fileName이 route/service normalization을 통과하지 못한 canonical class"라는 semantics map을 명시했다.
- 같은 메모에서 `keep-equivalent` 후보를 current recommendation으로 남기고, current user-facing/operator-facing flow에서는 explicit blank separate class의 verified gain이 없다고 정리했다. [미확인]
- `split-marker` 후보는 `fileNameBlankProvided` 또는 tri-state input marker처럼 writer/store boundary에서만 가능한 future option으로 남기되, route/service handoff를 다시 열어야 하고 historical no-marker subset proof는 닫지 못한다고 적었다.
- blank-vs-omission split 문제와 historical no-marker subset proof 문제를 분리해서 다뤄야 하는 이유를 문서로 잠궈, split marker alone이 backfill/fallback removal safety를 주는 것처럼 읽히지 않게 했다.
- `analysis_docs/v2/11...`에는 다음 `N2` cut이 semantic split audit이며, concrete operator requirement 없이는 split marker 확장을 열지 않는다는 연결 메모만 최소 범위로 추가했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-fileNameProvided-blank-vs-omission-semantic-split-audit.md`
  - PASS.
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- current recommendation은 keep-equivalent이지만, blank separate class의 operator/debug value가 future에 정말 필요한지는 아직 product/ops requirement로 닫히지 않았다. [미확인]
- split marker를 future에 추가해도 historical no-marker subset, legacy `batch.fileName` origin proof, migration/backfill 완료 여부는 계속 별도 질문으로 남는다. [검증 필요]
- 따라서 이번 audit만으로 provenance-only backfill, `fileName` fallback 제거, `batch.failed`/`stats.failed` fallback 제거를 재개할 수는 없다.
