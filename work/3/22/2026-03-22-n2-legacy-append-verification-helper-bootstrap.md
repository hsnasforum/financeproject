# 2026-03-22 N2 legacy append verification helper bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-legacy-append-verification-helper-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence mirror write 전 단계인 legacy append verification helper bootstrap만 가장 작은 범위로 잘라 구현했다.
- `planning-gate-selector`: helper/service 테스트 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, helper가 아직 못 증명하는 범위를 `/work` 형식으로 정리했다.

## 변경 이유
- same-id coexistence future mirror write는 rollback ordering contract까지는 닫혔지만, legacy append-write 실패 뒤 post-write 상태를 좁힐 helper가 없었다.
- `updateBatchAccount()`의 `appendNdjsonLine()`은 append-write라 예외 뒤에 `no-write`를 곧바로 증명할 수 없고, 기존 `readNdjsonRows()`는 malformed tail을 조용히 무시했다.
- 이번 라운드는 route behavior는 바꾸지 않고, future mirror-write worker가 재사용할 최소 verification helper와 helper 중심 테스트만 bootstrap하는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `verifyLegacyBatchAccountAppendPostWrite()`를 추가했다. 이 helper는 target `batchId`, 기대 `accountId`를 받고 parsed latest batch row와 raw tail 상태를 함께 읽는다.
- helper 반환 상태는 `parsed-row-committed`, `malformed-tail`, `no-committed-row-observed` 세 가지로 좁혔다. committed는 latest parsed batch의 `accountId/accountHint`가 기대값과 맞을 때만 판정한다.
- raw tail이 malformed JSON line이면 parsed latest row가 보이더라도 `malformed-tail`로 우선 분류하게 했다. 반대로 parsed latest row가 기대값과 맞지 않으면 `no-committed-row-observed`로 남긴다.
- `tests/planning-v3-transactionStore.test.ts`에는 정상 append 후 committed 판정, malformed trailing line 판정, expected binding 부재 판정을 추가했다.
- `analysis_docs/v2/13...`와 `analysis_docs/v2/11...`에는 helper bootstrap이 열렸지만 complete no-write proof와 route integration은 아직 후속 범위라는 메모를 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-legacy-append-verification-helper-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- helper는 `parsed-row-committed`, `malformed-tail`, `no-committed-row-observed`를 구분하지만, 여전히 complete no-write proof는 보장하지 않는다.
- route나 future mirror-write worker가 이 helper를 아직 소비하지 않으므로, repair-required와 rollback-recovered를 실제 runtime에서 나누는 단계는 남아 있다.
- malformed tail이 없는 `no-committed-row-observed` 상태가 실제 no-write인지, parse 가능한 다른 drift인지까지는 `[검증 필요]`다.
