# 2026-03-22 N2 stored import diagnostics-provenance owner audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-stored-import-diagnostics-provenance-owner-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail route의 남은 legacy fallback을 바로 없애지 않고, stored import diagnostics/provenance owner contract만 좁게 audit하는 데 사용.
- `planning-gate-selector`: docs-only audit 라운드로 분류해 `git diff --check`만 실행 검증으로 고정하고 `pnpm test`/`build`/`lint`/`e2e:rc`는 미실행 검증으로 남기는 데 사용.
- `work-log-closeout`: 실제 수정 문서, 실행 검증, 다음 cut 추천, 남은 owner contract 리스크를 표준 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 이전 audit에서 detail route의 `batch.failed`, `stats.failed`, `fileName`은 current stored schema에 trusted replacement source가 없어 legacy fallback으로 남아 있다는 점만 닫혔다.
- 이번 라운드는 broad fallback 제거 전에 stored writer owner가 import diagnostics(parse-skip/failed count)와 file provenance(`fileName`)를 어떤 persistence boundary로 가져가야 하는지 contract-first로 먼저 정리할 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 `stored import diagnostics/provenance owner contract audit` 단락을 추가해 current stored path는 `ImportBatchMeta.rowCount`와 sanitized rows만 저장하고, `failed`, `fileName`, `sha256`, `errors[]` 같은 import metadata는 저장하지 않는다는 source map을 고정했다.
- 같은 단락에 stored import route 두 곳이 현재 `csvText`와 account options만 `importCsvToBatch()`에 넘기므로, stored writer가 trusted `fileName` input 자체를 받지 못한다는 점을 명시했다.
- `failed`와 `fileName`의 가장 작은 owner 후보는 둘 다 `ImportBatchMeta`와 같은 batch-level stored metadata boundary라고 정리했고, 둘을 먼저 분리 소유하면 detail route에 partial mixed-source 상태가 다시 남을 수 있다는 tradeoff를 추가했다.
- smallest safe next cut은 detail payload 변경이 아니라 stored import command -> writer handoff와 batch-level diagnostics/provenance metadata owner contract를 먼저 닫는 contract-first bootstrap이라고 추천했다.
- `analysis_docs/v2/11...`에는 다음 `N2` cut이 detail fallback 제거가 아니라 stored import diagnostics/provenance owner contract 정리라는 연결 메모를 2줄 추가했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-stored-import-diagnostics-provenance-owner-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only audit이라 stored schema, import writer, detail route payload는 실제로 바꾸지 않았다.
- current stored import path는 trusted `fileName` input도, persisted diagnostics slot도 없으므로 `failed`/`fileName` fallback 제거를 바로 구현하면 false zero/blank 또는 silent omission 위험이 남는다.
- future cut에서 `failed`와 `fileName`을 다른 owner로 따로 열면 detail route가 다시 partial mixed-source 상태를 가질 수 있어, batch-level stored metadata boundary를 먼저 닫는 순서가 계속 필요하다.
