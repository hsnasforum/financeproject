# 2026-03-23 N2 historical no-marker unresolved visible debt retirement-proof audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-historical-no-marker-unresolved-visible-debt-retirement-proof-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: unresolved visible debt subset의 retirement-proof contract만 문서에 좁혀 남기고, helper/test/route behavior는 다시 열지 않는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: retirement-proof boundary, 실행 검증, 미실행 검증, 남은 provenance proof 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- current helper stack은 unresolved visible debt subset을 `origin-fundamentally-unresolved + legacy batch.fileName present`로 좁혔지만, 이 subset을 앞으로 어떤 proof가 있을 때만 retire할 수 있는지는 아직 문서에 계약으로 닫혀 있지 않았다.
- 이번 라운드는 backfill 구현이나 fallback 제거가 아니라, helper-owned visible debt를 계속 유지해야 하는 경계와 retirement candidate가 되려면 필요한 proof를 docs-first로 잠그는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 unresolved visible debt retirement-proof 메모를 추가해, current boundary를 `classifyHistoricalNoMarkerProvenanceEvidence() === origin-fundamentally-unresolved`이면서 `hasHistoricalNoMarkerVisibleFileNameCompatBridge() === true`인 subset으로 명시했다.
- 같은 메모에서 `keep-as-helper-owned-debt` 후보는 immutable handoff proof, trusted source-bound migration/backfill completion stamp, equivalent audit trail이 없는 unresolved visible debt 전체라고 적었다.
- `retirement-candidate only if proof X exists` 후보는 trusted original handoff 또는 audited migration/backfill 결과라는 사실을 current visible legacy label과 묶어 줄 proof X가 있을 때만 열린다고 좁혔다.
- proof requirement matrix에는 legacy label 존재 alone, stored provenance blank/present alone, historical writer/version marker alone, source binding 없는 migration stamp는 retirement proof로 불충분하다고 적고, immutable handoff proof 또는 trusted source binding을 포함한 audited completion proof만 candidate 근거라고 남겼다. [검증 필요]
- `analysis_docs/v2/11...`에는 다음 `N2` cut이 broad backfill이 아니라 unresolved visible debt subset의 retirement-proof audit이라는 연결 메모만 최소 범위로 보정했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-historical-no-marker-unresolved-visible-debt-retirement-proof-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- current runtime에는 immutable handoff proof, trusted source-bound migration/backfill stamp, equivalent audit field가 실제로 없으므로 retirement candidate subset은 아직 문서상의 조건일 뿐이다. [미확인]
- `marker-missing-but-otherwise-stable`와 unresolved visible debt subset은 다른 문제이므로, 같은 retirement path로 묶으면 stored-owner stable subset까지 과장할 위험이 있다.
- 이번 audit만으로 provenance-only backfill이나 `fileName` fallback 제거 안전성이 확보된 것은 아니다.
