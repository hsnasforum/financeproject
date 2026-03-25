# 2026-03-22 N2 secondary failure route-local worker bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-secondary-failure-route-local-worker-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence mirror write 직전 단계인 secondary failure route-local worker bootstrap만 가장 작은 범위로 구현했다.
- `planning-gate-selector`: helper/service 테스트 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, route-local worker가 조합하는 helper와 남은 미증명 경계를 `/work` 형식으로 정리했다.

## 변경 이유
- `verifyLegacyBatchAccountAppendPostWrite()`, `classifySameIdCoexistencePostWriteFailure()`, `buildSameIdCoexistenceOperatorEvidenceSnapshot()`는 각각 있었지만, future same-id coexistence mirror write가 secondary failure path에서 이 셋을 한 번에 조합하는 route-local worker는 아직 없었다.
- route behavior는 여전히 guard 상태로 두되, secondary failure 시 어떤 internal outcome과 operator evidence를 남길지 코드 기준으로 먼저 고정할 필요가 있었다.
- 이번 라운드는 mirror write 실제 구현이 아니라, pure helper composition 형태의 route-local worker bootstrap만 다루는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`를 추가했다. 입력은 `batchId`, target `accountId`, rollback 시도/성공 여부, optional stored current binding summary다.
- worker는 내부에서 `verifyLegacyBatchAccountAppendPostWrite()`, `classifySameIdCoexistencePostWriteFailure()`, `buildSameIdCoexistenceOperatorEvidenceSnapshot()`를 순서대로 조합해 `legacyVerification`, `failure`, `operatorEvidence`를 한 번에 반환한다.
- `parsed-row-committed`와 `malformed-tail`은 계속 `repair-required`를 유지하고, `no-committed-row-observed`는 `rollback-recovery-unproven`으로만 남긴다. rollback 미시도/실패도 worker 안에서 빠지지 않게 했다.
- `/account` route behavior는 이번 라운드에서 바꾸지 않았고, 문서에는 route-local worker bootstrap이 열렸지만 current guard와 success semantics는 그대로라는 점만 짧게 반영했다.
- `tests/planning-v3-transactionStore.test.ts`에는 parsed committed, malformed tail, no committed row observed, rollback 미시도, rollback 실패에 대한 route-local worker 단위 테스트를 추가했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-secondary-failure-route-local-worker-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- route-local worker는 internal payload 조립만 하고, current `/account` route나 future mirror-write path에 아직 연결되지 않았다.
- `rollback-recovery-unproven`은 여전히 complete no-write proof가 없는 보수적 상태이고, success를 열 수 있는 결과가 아니다.
- `[검증 필요]` stored pre-write snapshot 비교 결과와 raw tail summary를 어떤 실제 route-local integration이 함께 수집할지는 후속 구현에서 다시 확인해야 한다.
