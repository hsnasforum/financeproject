# 2026-03-22 N2 operator evidence snapshot helper bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-operator-evidence-snapshot-helper-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence mirror write 직전 단계인 operator evidence snapshot helper bootstrap만 가장 작은 범위로 구현했다.
- `planning-gate-selector`: helper/service 테스트 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, snapshot helper가 수집하는 evidence와 남은 미증명 경계를 `/work` 형식으로 정리했다.

## 변경 이유
- `verifyLegacyBatchAccountAppendPostWrite()`와 `classifySameIdCoexistencePostWriteFailure()`는 이미 있었지만, operator/manual repair 판단에 필요한 evidence를 future route-local worker가 안전하게 재사용할 내부 snapshot 형태로 묶는 helper는 아직 없었다.
- operator evidence checklist는 문서로는 잠겨 있었지만, 실제 코드 기준으로는 어떤 필드가 지금 수집 가능하고 무엇을 user-facing payload에서 잘라야 하는지 pure helper 하나로 고정할 필요가 있었다.
- 이번 라운드는 route behavior 변경이나 mirror write 구현이 아니라, operator evidence assembly helper bootstrap만 다루는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `buildSameIdCoexistenceOperatorEvidenceSnapshot()`을 추가했다. 입력은 `batchId`, target `accountId`, rollback 시도/성공 여부, `legacyVerification`, optional stored current binding summary다.
- snapshot은 `outcome`, `reason`, `successAllowed: false`, rollback flags, `legacyVerification.status`, `legacyVerification.noWriteProof: "not-proven"`, latest parsed legacy batch summary, optional stored current binding summary를 모은다.
- helper는 existing verification/classification helper를 그대로 재사용하고, raw NDJSON line이나 filesystem path는 snapshot에 넣지 않는다.
- `tests/planning-v3-transactionStore.test.ts`에는 repair-required parsed commit, repair-required malformed tail, rollback-recovery-unproven no committed row observed 케이스에 대한 snapshot helper 단위 테스트를 추가했다.
- `analysis_docs/v2/13...`와 `analysis_docs/v2/11...`에는 operator evidence checklist에 snapshot helper bootstrap이 열렸지만, complete no-write proof와 route-local integration은 아직 후속 범위라는 메모를 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-operator-evidence-snapshot-helper-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- snapshot helper는 internal evidence assembly만 담당하고, route나 future mirror-write worker에 아직 연결되지 않았다.
- `legacyVerification.noWriteProof`는 여전히 `"not-proven"`만 남기므로, complete no-write proof를 새로 제공하지는 못한다.
- `[검증 필요]` stored pre-write snapshot 비교 결과와 raw tail summary를 실제 어떤 route-local worker가 함께 수집할지는 후속 구현에서 다시 확인해야 한다.
