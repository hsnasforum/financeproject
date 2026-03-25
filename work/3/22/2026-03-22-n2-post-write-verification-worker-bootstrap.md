# 2026-03-22 N2 post-write verification worker bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-post-write-verification-worker-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence mirror write 직전 단계인 post-write verification worker bootstrap만 가장 작은 범위로 구현했다.
- `planning-gate-selector`: helper/service 테스트 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, conservative outcome과 미증명 경계를 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 라운드에서 legacy append verification helper는 열렸지만, stored rollback 시도 여부와 helper 결과를 합쳐 secondary failure outcome을 계산하는 route-agnostic worker는 아직 없었다.
- future same-id coexistence mirror write는 `parsed-row-committed`, `malformed-tail`, `no-committed-row-observed`를 그대로 route에서 해석하기보다, conservative failure classification을 재사용하는 내부 worker가 먼저 필요했다.
- 이번 라운드는 success semantics를 여는 것이 아니라 `repair-required`와 아직 회복 미증명 상태를 더 명시적으로 계산하는 pure worker bootstrap이 목적이었다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `classifySameIdCoexistencePostWriteFailure()`를 추가했다. 입력은 `storedRollbackAttempted`, `storedRollbackSucceeded`, `legacyVerification`이고, 출력은 항상 `successAllowed: false`를 유지한다.
- worker outcome은 `repair-required`와 `rollback-recovery-unproven` 두 가지로만 좁혔다. `parsed-row-committed`, `malformed-tail`, rollback 미시도, rollback 실패는 즉시 `repair-required`로 올린다.
- `no-committed-row-observed`는 complete no-write proof가 아니므로 성급히 `rollback-recovered`로 승격하지 않고 `rollback-recovery-unproven`으로 남기게 했다.
- `tests/planning-v3-transactionStore.test.ts`에는 parsed committed, malformed tail, no committed row observed, rollback 미시도 케이스에 대한 worker 단위 테스트를 추가했다.
- `analysis_docs/v2/13...`와 `analysis_docs/v2/11...`에는 verification helper 뒤에 post-write classification worker까지 bootstrap됐지만, route integration과 repair flow는 아직 후속 범위라는 메모를 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-post-write-verification-worker-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- worker는 conservative classification만 제공하고, 아직 route나 future mirror-write worker에 실제로 연결되지 않았다.
- `rollback-recovery-unproven`은 success 불가 상태를 더 명확히 만들지만, complete no-write proof나 owner re-alignment proof는 여전히 제공하지 못한다.
- `[검증 필요]` malformed tail이 없는 `no-committed-row-observed`를 operator/manual repair 없이 더 좁힐 수 있는 post-write verification source가 있는지는 후속 구현에서 다시 확인해야 한다.
