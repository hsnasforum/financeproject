# 2026-03-23 N2 sourceBinding internal read-only candidate helper bootstrap

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-sourceBinding-internal-read-only-candidate-helper-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: stored-first reader contract를 넓히지 않고, `sourceBinding` present subset을 helper level의 internal read-only candidate로만 식별하는 최소 변경으로 제한하는 데 사용했다.
- `planning-gate-selector`: planning v3 batch detail/helper 변경으로 분류해 `pnpm test tests/planning-v3-batches-api.test.ts`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행 검증으로 선택했다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 미실행 검증, 남은 proof 리스크를 저장소 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- current `sourceBinding` slot은 stored metadata에 저장되지만 reader/helper layer에서는 완전히 무시되고 있어, `sourceBinding present` subset을 route-local 분기 없이 shared helper에서만 좁게 설명할 기준이 없었다.
- 이번 라운드는 reader retirement gating이나 fallback 제거가 아니라, current `sourceBinding` present subset을 internal read-only candidate로만 판정하는 shared helper 하나를 bootstrap하는 것이 목적이었다.

## 핵심 변경
- `src/lib/planning/v3/transactions/store.ts`에 `hasStoredFirstReadOnlySourceBindingCandidate()` helper를 추가해, `sourceBinding.artifactSha256`, `sourceBinding.attestedFileName`, `originKind: "writer-handoff"`, stored `provenance.fileName` 일치까지 만족할 때만 true를 반환하게 했다.
- 같은 helper는 `sourceBinding` absent, invalid sha256, attested/stored `fileName` mismatch 같은 partial/invalid case에서는 false를 반환하고, visible shell/public meta 계산에는 여전히 참여하지 않는다.
- `tests/planning-v3-batches-api.test.ts`에 complete present, absent, partial/invalid subcase를 추가해 helper truth table을 고정했다.
- `analysis_docs/v2/13...`와 `analysis_docs/v2/11...`에는 helper bootstrap 완료 상태와 next cut이 still not retirement gating/fallback removal이라는 점만 최소 범위로 동기화했다.

## 검증
- `pnpm test tests/planning-v3-batches-api.test.ts`
  - PASS
- `pnpm build`
  - PASS
- `git diff --check -- src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/23/2026-03-23-n2-sourceBinding-internal-read-only-candidate-helper-bootstrap.md`
  - PASS
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md`
  - PASS
- 미실행 검증:
- `pnpm test tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- `hasStoredFirstReadOnlySourceBindingCandidate()`는 internal candidate present만 말할 뿐이고, reader retirement gating, `fileName` fallback 제거, append/merge proof를 열지 않는다.
- append/merge/wider legacy surface는 계속 explicit no-source closeout이며, same semantics를 거기로 넓히면 false-proof risk가 다시 열린다. [검증 필요]
- historical no-marker unresolved subset은 그대로 남아 있으므로, 이번 helper bootstrap만으로 provenance backfill이나 visible debt retirement safety가 생기지는 않는다.
