# 2026-03-22 N2 stored current binding evidence helper bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-stored-current-binding-evidence-helper-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence future mirror write 직전 단계인 stored current binding evidence helper bootstrap만 가장 작은 범위로 구현했다.
- `planning-gate-selector`: helper/service 테스트 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, stored-side evidence 자동 수집 범위와 남은 미증명 경계를 `/work` 형식으로 정리했다.

## 변경 이유
- `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`는 stored current binding summary를 optional input으로만 받았고, future route-local integration이 매번 외부에서 이 값을 조립해야 했다.
- same-id coexistence future mirror write 전 단계에서는 stored meta current binding `accounts[0].id` 정도만 자동으로 읽을 수 있어도 operator evidence 수집이 한 단계 단순해진다.
- 이번 라운드는 route behavior 변경 없이, stored-side evidence reader와 worker 자동 주입만 bootstrap하는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `readStoredCurrentBatchBindingEvidence()`를 추가했다. 이 helper는 target `batchId` 기준 stored meta를 읽고 current binding summary를 `{ accountId }` 형태로만 좁게 반환한다.
- `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`는 explicit `storedCurrentBindingAccountId`가 없을 때 새 helper를 자동 호출해 operator evidence snapshot에 stored current binding을 채운다.
- existing verification/classification/snapshot behavior는 바꾸지 않았고, stored current binding summary가 없으면 기존처럼 property를 생략한 채 conservative outcome을 유지한다.
- `tests/planning-v3-transactionStore.test.ts`에는 stored meta에서 current binding evidence를 직접 읽는 케이스와, worker가 stored meta current binding을 자동으로 snapshot에 실어 주는 케이스를 추가했다.
- `analysis_docs/v2/13...`와 `analysis_docs/v2/11...`에는 stored current binding evidence helper bootstrap이 열렸지만 complete pre-write snapshot compare는 여전히 후속 범위라는 메모를 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-stored-current-binding-evidence-helper-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- helper는 current stored binding summary만 자동 수집하고, complete pre-write snapshot compare는 여전히 제공하지 않는다.
- route-local worker는 internal payload 조립만 하고 current `/account` route나 future mirror-write path에 아직 연결되지 않았다.
- `[검증 필요]` stored current binding summary와 stored pre-write snapshot compare를 같은 operator evidence flow에서 어떻게 합칠지는 후속 구현에서 다시 확인해야 한다.
