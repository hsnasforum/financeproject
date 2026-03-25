# 2026-03-23 N2 hybrid retained visible fileName bridge provenance-origin proof audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-hybrid-retained-visible-fileName-bridge-provenance-origin-proof-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: hybrid retained visible `fileName` bridge subset을 pure legacy/old stored meta gap과 다시 섞지 않고, current writer와 stored-first helper 기준의 provenance-origin proof boundary만 좁히는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: evidence map, 보류 범위, 미실행 검증, 남은 provenance-origin 리스크를 오늘 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- visible `fileName` compat bridge subset은 helper/test에서 이미 `stored provenance.fileName blank + legacyBatch.fileName present`로 고정됐지만, 그 blank provenance origin이 normal optional omission인지 historical handoff gap인지 설명할 runtime proof boundary는 아직 문서에 좁게 잠기지 않았다.
- 이번 라운드는 backfill 구현이나 fallback 제거가 아니라, current code가 실제로 증명하는 범위와 증명하지 못하는 범위를 docs-first로 잠그는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 visible `fileName` bridge provenance-origin proof audit 메모를 추가해, current evidence가 `writer optional handoff`, `stored provenance present/blank`, `legacyBatch.fileName present/blank`까지만 닫힌다는 점을 명시했다.
- 같은 메모에서 visible bridge subset 안의 `normal optional omission` 후보와 `historical handoff gap` 후보를 따로 적고, 둘을 runtime에서 가를 stored marker/migration stamp/created-at boundary가 없다는 점을 `[미확인]`, `[검증 필요]`로 남겼다.
- next cut recommendation은 provenance-only backfill이 아니라 origin proof에 쓸 stored marker가 실제로 추가 가능한지 보는 metadata-only marker audit으로 좁혔다.
- `analysis_docs/v2/11...`에는 다음 `N2` cut이 fallback 제거가 아니라 provenance-origin proof audit이라는 한정된 메모만 추가했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-hybrid-retained-visible-fileName-bridge-provenance-origin-proof-audit.md`
  - PASS.
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- current visible bridge subset은 `stored provenance.fileName blank + legacyBatch.fileName present`까지는 proof로 고정됐지만, 그 blank가 current writer의 정상 optional omission인지 historical handoff gap인지 구분할 persisted marker는 없다. [미확인]
- 따라서 provenance-only backfill을 먼저 열면 original import가 주지 않았던 provenance를 guessed 값으로 써 넣을 수 있고, 반대로 `fileName` fallback을 먼저 없애면 origin proof 없이 visible continuity debt를 축소하게 된다.
- helper/test proof는 "bridge가 보인다"까지만 닫았고 "왜 blank provenance가 생겼는가"는 닫지 못했으므로, future implementation cut도 broad rewrite가 아니라 evidence inventory 중심으로 더 좁혀야 한다.
