# 2026-03-23 N2 hybrid-legacy-summary-retained fileName compat bridge audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-hybrid-legacy-summary-retained-fileName-compat-bridge-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: hybrid retained class를 `pure legacy`, `old stored meta importMetadata gap`과 섞지 않고 detail helper contract만 좁게 audit하는 데 사용했다.
- `planning-gate-selector`: docs-only audit 라운드로 분류해 `git diff --check -- ...`만 실행 검증으로 선택하고 `pnpm` gates는 미실행 검증으로 남기는 데 사용했다.
- `work-log-closeout`: 오늘 문서 보강, 실제 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- `hybrid-legacy-summary-retained`는 stored diagnostics owner가 이미 있는데 `provenance.fileName`만 blank일 때 helper-owned legacy summary bridge가 남을 수 있어, `pure legacy`나 `old stored meta importMetadata gap`과 다른 계약으로 좁혀 정리할 필요가 있었다.
- 이번 라운드는 구현이 아니라 provenance/fileName compat bridge retention과 backfill 후보를 docs-first로 잠그는 audit 범위였다.

## 핵심 변경
- `analysis_docs/v2/13...`에 hybrid retained 전용 `fileName` compat bridge memo를 추가해 current runtime class map, `failed`와 `fileName` source split, existing proof와 missing proof를 분리했다.
- 같은 문서에 provenance-only backfill 후보 1개와 helper-owned retention 후보 1개, 두 후보의 tradeoff를 추가하고 현재 recommendation을 `retention-first, proof-before-provenance-backfill`로 고정했다.
- next implementation cut은 metadata-only provenance backfill이 아니라 `hybrid-legacy-summary-retained + blank stored provenance.fileName` fixture/test를 먼저 추가해 helper contract를 증명하는 것이라고 좁혔다.
- `pure legacy` retirement, `old stored meta gap` backfill/migration, `batch.failed`/`stats.failed` fallback 제거, detail payload shape 변경, writer redesign, owner merge는 비범위로 다시 명시했다.
- `analysis_docs/v2/11...`에는 다음 `N2` cut이 pure legacy retirement가 아니라 hybrid retained `fileName` compat bridge proof tightening이라는 메모만 2줄 추가했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-hybrid-legacy-summary-retained-fileName-compat-bridge-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- `hybrid-legacy-summary-retained + importMetadata.diagnostics present + stored provenance.fileName blank + legacyBatch.fileName present` subcase를 직접 고정하는 test는 아직 없다. [검증 필요]
- blank stored provenance는 current writer의 optional input 부재일 수 있어, legacy `fileName`을 나중에 backfill하면 original import에 없던 provenance를 새로 만들 위험이 있다. [미확인]
- legacy `mergeBatchMeta()`가 `fileName`을 갱신할 수 있어, current legacy label을 stored truth로 승격하는 metadata-only provenance backfill은 drift 영구화 리스크가 남아 있다.
