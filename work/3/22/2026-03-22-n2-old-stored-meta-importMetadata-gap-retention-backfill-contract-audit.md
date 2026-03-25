# 2026-03-22 N2 old stored meta importMetadata gap retention-backfill contract audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-old-stored-meta-importMetadata-gap-retention-backfill-contract-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail helper 경계 안에서 `old stored meta without importMetadata` historical class만 좁게 audit하고, pure legacy와 분리된 retention/backfill contract로 정리하는 데 사용.
- `planning-gate-selector`: docs-only audit 라운드로 분류해 `git diff --check`만 실행 검증으로 선택하고, 테스트/빌드/린트/e2e는 미실행 검증으로 남기는 데 사용.
- `work-log-closeout`: 실제 수정 문서, 실행 검증, 다음 implementation cut recommendation을 표준 `/work` 형식으로 남기는 데 사용.

## 변경 이유
- 이전 라운드에서 `pure legacy`와 `old stored meta without importMetadata`를 분리했지만, old stored meta gap class 자체를 runtime에서 어떻게 해석하고 retention과 backfill 후보를 어떤 기준으로 고를지는 아직 문서로 잠겨 있지 않았다.
- 이 class는 stored owner가 없는 문제가 아니라 stored batch meta는 있는데 `importMetadata` slot만 비어 있는 historical gap이므로, pure legacy retirement 판단과 섞지 않고 `retention vs proof-before-backfill` 기준을 좁게 남길 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 `old stored meta importMetadata gap retention/backfill contract audit` 단락을 추가해 runtime class map을 `hybrid-legacy-transactions + stored metadataSource + missing importMetadata` 조건으로 고정했다.
- 같은 단락에 helper-owned explicit bridge retention 후보안 1개와 metadata-only backfill 후보안 1개를 적고, backfill 전 safety proof가 왜 필요한지 `mergeBatchMeta()`와 stored row persistence 한계 기준으로 정리했다.
- pure legacy와 old stored meta gap class를 왜 같은 migration/retirement 축으로 다루면 안 되는지 문서 기준으로 분리했다.
- next implementation cut은 direct backfill이나 fallback 제거가 아니라 shared predicate/helper로 old stored meta gap class를 먼저 명시하는 것이라고 고정했다.
- `analysis_docs/v2/11...`에는 바로 다음 docs-first audit이 pure legacy retirement가 아니라 old stored meta retention-backfill contract audit이라는 메모만 좁게 추가했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-old-stored-meta-importMetadata-gap-retention-backfill-contract-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only audit이라 `src/lib/planning/v3/transactions/store.ts` behavior나 detail route payload는 바꾸지 않았다.
- current runtime은 old stored meta gap class를 explicit schema marker 없이 `importMetadata` absence로만 구분하므로, malformed historical meta와 owner-bootstrap 이전 meta를 완전히 구분할 증거는 아직 없다. `[미확인]`
- metadata-only backfill 후보는 남겼지만, current legacy batch summary가 original import summary를 still represent한다는 proof 없이 바로 stored source-of-truth로 승격하면 drift를 영구화할 수 있다.
- smallest safe next cut: old stored meta gap class를 shared helper 수준에서 명시하는 predicate/helper를 먼저 추가하고, direct backfill이나 fallback 제거는 그 뒤 proof contract가 더 닫힌 후에 검토한다.
