# 2026-03-22 N2 post-write success split worker bootstrap

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-post-write-success-split-worker-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence `writes-completed` success candidate를 internal 두 갈래로만 나누는 worker bootstrap만 가장 작은 범위로 추가했다.
- `planning-gate-selector`: shared helper/service/unit test 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 유지했다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, success split worker 범위와 남은 success closeout 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 라운드에서 `verifySameIdCoexistencePostWriteVisibleBinding()`은 `writes-completed` success candidate의 visible binding을 다시 확인할 수 있게 됐지만, future route integration이 그대로 재사용할 success split worker는 아직 없었다.
- same-id coexistence route는 `writes-completed`를 곧바로 success로 열지 않고, matched면 내부 success candidate로만, drifted/missing이면 conservative failure 쪽으로 남겨야 한다.
- 이번 라운드는 current `/account` route를 바꾸지 않고, sequencing result와 visible binding verification을 조합하는 pure worker bootstrap만 여는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `SameIdCoexistenceWritesCompletedSequenceResult`, `SameIdCoexistenceSecondaryFailureSequenceResult`, `buildSameIdCoexistenceUserFacingInternalFailure()`를 추가해 success split worker가 generic `INTERNAL` envelope를 재사용할 수 있게 했다.
- `src/lib/planning/v3/transactions/store.ts`에 `runSameIdCoexistencePostWriteSuccessSplitWorker()`와 관련 result type을 추가했다.
- 새 worker는 `writes-completed` sequencing result를 받아 `verifySameIdCoexistencePostWriteVisibleBinding()`를 호출하고, matched면 `verified-success-candidate`, drifted/missing이면 `visible-verification-failed` + generic `INTERNAL` envelope로만 internal 분기한다.
- `tests/planning-v3-transactionStore.test.ts`에는 actual sequencing wrapper success 후 matched 케이스, synthetic `writes-completed` input에서 drifted/missing 케이스를 추가해 success split regression을 고정했다.
- `analysis_docs/v2/13...`에는 post-write success split worker bootstrap이 열렸지만 current `/account` route는 여전히 guard-only라는 점을 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-post-write-success-split-worker-bootstrap.md`
- 미실행 검증:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- worker는 internal success split bootstrap만 제공하고, current `/account` route는 same-id coexistence에서 여전히 explicit guard 상태로 남아 있다.
- `verified-success-candidate`도 아직 user-facing success 확정이 아니라 internal candidate일 뿐이며, actual success closeout은 `[검증 필요]`다.
- future route integration은 이 worker와 sequencing wrapper, failure mapper를 어디서 분기하고 어떤 response body를 조립할지 후속 구현에서 다시 닫아야 한다.
