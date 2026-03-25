# 2026-03-23 N2 unresolved visible debt source-binding design memo audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-unresolved-visible-debt-source-binding-design-memo-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: unresolved visible debt subset을 다시 넓히지 않고, maybe-promotable source를 proof-bearing source로 승격시키는 minimal binding requirement만 문서에 좁혀 남기는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: source-binding design boundary, 실제 실행 검증, 미실행 검증, 남은 provenance/source-binding 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 inventory audit으로 existing source alone으로는 proof X가 불가능하다는 점은 닫혔지만, maybe-promotable candidate를 future proof-bearing source로 승격하려면 최소 어떤 batch-level binding이 필요한지는 아직 문서에 설계 메모로 남아 있지 않았다.
- 이번 라운드는 새 field 구현이나 backfill이 아니라, 최소 source-binding requirement, touchpoint, no-source closeout 기준을 docs-first로 잠그는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 unresolved visible debt source-binding design memo를 추가해, current maybe-promotable candidate를 `legacy batch.sha256 + row-level sourceInfo.sha256` 조합으로 다시 고정했다.
- 같은 메모에서 minimal requirement를 `batch-level persisted binding`, `trusted artifact digest + attested visible fileName label 결합`, `binding origin 구분`, `append/merge silent rebinding 방지` 네 가지로 좁혔다. `[검증 필요]`
- `source-binding design memo` 후보는 [가칭] batch-level persisted source-binding tuple로 정리했고, new write에서는 writer handoff가, historical subset에서는 audited migration/backfill completion source가 있을 때만 채우는 쪽이 가장 작다고 남겼다.
- `explicit no-source closeout` 기준은 batch-level persisted binding을 stored owner에 둘 수 없거나, append/merge drift를 false proof 없이 설명할 수 없거나, binding origin을 legacy inference와 구분해 적지 못하는 경우로 적었다.
- `analysis_docs/v2/11...`에는 next `N2` cut이 broad schema 구현이 아니라 minimal requirement를 만족하는 writer/store-only feasibility check 또는 explicit no-source closeout이라는 메모만 최소 범위로 보정했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-unresolved-visible-debt-source-binding-design-memo-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- [가칭] source-binding tuple은 아직 설계 메모일 뿐이고, stored batch metadata에 실제 binding slot이나 audited completion source는 존재하지 않는다. [미확인]
- append/merge path에서 `sha256`와 visible `fileName`이 drift할 수 있으므로, explicit invalidation 또는 audited recomputation boundary를 정의하지 않으면 future schema도 false proof를 저장할 수 있다. [검증 필요]
- 이번 audit만으로 provenance-only backfill이나 `fileName` fallback 제거 안전성이 확보된 것은 아니다.
