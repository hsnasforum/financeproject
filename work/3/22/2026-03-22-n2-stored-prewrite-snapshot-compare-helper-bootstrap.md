# 2026-03-22 N2 stored pre-write snapshot compare helper bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-stored-prewrite-snapshot-compare-helper-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence future mirror write 직전 단계인 stored pre-write snapshot compare helper bootstrap만 가장 작은 범위로 구현했다.
- `planning-gate-selector`: helper/service 테스트 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, stored-side compare 범위와 남은 미증명 경계를 `/work` 형식으로 정리했다.

## 변경 이유
- `readStoredCurrentBatchBindingEvidence()`로 current stored binding summary는 자동 수집할 수 있게 됐지만, operator evidence에서 stored pre-write snapshot과 current binding의 일치 여부를 좁히는 pure compare helper는 아직 없었다.
- future route-local integration은 complete pre-write snapshot closeout까지는 아니더라도, 최소한 pre-write `accountId`와 current binding summary가 같은지 다른지는 pure helper로 고정할 필요가 있었다.
- 이번 라운드는 route behavior 변경 없이, stored-side compare helper와 optional worker compare만 bootstrap하는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `compareStoredPreWriteSnapshotToCurrentBinding()`을 추가했다. 입력은 pre-write snapshot `accountId`와 current stored binding summary이고, output은 `matched-prewrite`, `drifted-from-prewrite`, `snapshot-missing` 중 하나다.
- `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`는 optional `storedPreWriteAccountId`가 주어지면 새 compare helper를 호출해 `storedPreWriteCompare`를 결과에 덧붙인다. success semantics는 여전히 열지 않는다.
- compare helper는 complete no-write proof와 별개로 stored-side only compare만 다루고, current binding summary가 없으면 `drifted-from-prewrite`, pre-write snapshot이 없으면 `snapshot-missing`으로 남긴다.
- `tests/planning-v3-transactionStore.test.ts`에는 compare helper의 matched/drifted/snapshot-missing/current-missing 케이스와, route-local worker가 optional compare 결과를 함께 반환하는 케이스를 추가했다.
- `analysis_docs/v2/13...`와 `analysis_docs/v2/11...`에는 stored pre-write snapshot compare helper bootstrap이 열렸지만 complete no-write proof와 operator repair closeout은 여전히 후속 범위라는 메모를 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-stored-prewrite-snapshot-compare-helper-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- compare helper는 stored-side only compare만 제공하고, complete no-write proof나 operator repair closeout을 새로 증명하지 않는다.
- route-local worker는 internal payload 조립만 하고 current `/account` route나 future mirror-write path에 아직 연결되지 않았다.
- `[검증 필요]` stored pre-write snapshot compare 결과와 legacy append verification/operator evidence를 어떤 실제 route integration이 함께 closeout할지는 후속 구현에서 다시 확인해야 한다.
