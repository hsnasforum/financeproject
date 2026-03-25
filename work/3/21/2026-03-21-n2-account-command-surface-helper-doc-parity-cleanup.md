# 2026-03-21 N2 account command surface helper doc parity cleanup

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/21/2026-03-21-n2-account-command-surface-helper-doc-parity-cleanup.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: account command helper가 실제로 반환하는 state 집합과 문서 snapshot을 broad rewrite 없이 같은 기준으로 맞추는 데 사용했다.
- `planning-gate-selector`: docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 선택했다.
- `work-log-closeout`: 실제 수정 파일, 실행한 검증, 남은 contract drift 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 shared helper bullet은 `getStoredBatchAccountCommandSurfaceState()`가 실제로 다루는 `stored-meta-only`, `synthetic-stored-only`, `missing`까지 충분히 드러내지 못하고 있었다.
- `POST /account` snapshot에는 `stored-meta only`는 있었지만 helper 설명과 state 기준이 어긋나, 문서를 읽을 때 helper state와 command snapshot을 같은 기준으로 해석하기 어려웠다.
- 코드 재수정 없이 helper/doc parity drift만 최소 범위로 정리할 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 shared helper bullet을 보정해 `getStoredBatchAccountCommandSurfaceState()`가 `synthetic-stored-only`, `missing`을 유지하고 `stored-meta-only`, `stored-meta-legacy-coexistence`, `legacy-only`를 반환한다는 점을 명시했다.
- 같은 section의 `POST /account` snapshot에 `missing` 경계를 추가해 helper state 집합과 route 결과 설명이 같은 기준으로 읽히게 맞췄다.
- `stored-meta only`와 `stored-meta-legacy-coexistence`는 각각 “legacy writer owner 부재”와 “same-id coexistence”로 분리된 상태라는 점을 문서상 혼동하지 않도록 유지했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`는 이번 cleanup에서 추가 보강이 필요하지 않아 변경하지 않았다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/21/2026-03-21-n2-account-command-surface-helper-doc-parity-cleanup.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only라 code-side helper나 route를 다시 검증하거나 바꾸지 않았다.
- `analysis_docs/v2/13`의 account helper/state 설명은 맞췄지만, broader canonical writer merge, stored meta write-back, legacy write contract 확장은 여전히 후속 범위다.
- 기존 문서 파일에는 이번 라운드와 무관한 이전 diff가 남아 있으므로, 후속 문서 라운드에서도 changed hunk를 구분해서 다루는 주의가 필요하다.
