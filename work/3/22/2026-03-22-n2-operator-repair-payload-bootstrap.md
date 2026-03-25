# 2026-03-22 N2 operator repair payload bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-operator-repair-payload-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence secondary failure 내부 contract를 넓히지 않고 operator repair payload bootstrap 한 컷만 구현했다.
- `planning-gate-selector`: service helper/unit test 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 유지했다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, payload field와 남은 미증명 경계를 `/work` 형식으로 정리했다.

## 변경 이유
- `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`는 `failure`, `operatorEvidence`, optional `storedPreWriteCompare`를 각각 반환하지만, future route integration이 그대로 재사용할 internal operator repair payload shape는 아직 없었다.
- same-id coexistence future mirror write는 route behavior를 열기 전에, operator/manual repair 판단용 내부 payload contract를 먼저 고정해 둘 필요가 있었다.
- 이번 라운드는 existing verification/classification/snapshot/compare helper를 바꾸지 않고, pure payload assembly helper만 가장 작은 범위로 추가하는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `SameIdCoexistenceOperatorRepairPayload` 타입과 `buildSameIdCoexistenceOperatorRepairPayload()` helper를 추가했다.
- 새 helper는 route-local worker result를 받아 `outcome`, `reason`, `successAllowed: false`, rollback flags, `legacyVerification`, optional `storedCurrentBinding`, optional `storedPreWriteCompare`를 하나의 internal payload로 평탄화한다.
- payload helper는 raw NDJSON line, raw tail bytes, filesystem path 같은 operator-only detail을 싣지 않고, existing conservative failure semantics를 그대로 유지한다.
- `tests/planning-v3-transactionStore.test.ts`에 `repair-required`와 `rollback-recovery-unproven` 각각에서 payload 필드가 빠지지 않고, raw file detail이 노출되지 않는 회귀 테스트를 추가했다.
- `analysis_docs/v2/13...`에는 `buildSameIdCoexistenceOperatorRepairPayload()`가 current `/account` route behavior나 success semantics를 바꾸지 않는 internal bootstrap helper라는 점을 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-operator-repair-payload-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- operator repair payload helper는 internal shape bootstrap만 제공하고, current `/account` route나 future mirror-write path에 아직 연결되지 않았다.
- `rollback-recovery-unproven`은 여전히 complete no-write proof가 없는 보수적 상태이며, actual repair closeout contract는 후속 route integration에서 다시 닫아야 한다.
- `[검증 필요]` stored pre-write compare와 legacy verification을 실제 operator/manual repair closeout에서 어떻게 최종 확정할지는 future mirror write integration 단계에서 다시 검증해야 한다.
