# 2026-03-22 N2 rollback-recovery-unproven operator flow contract

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-rollback-recovery-unproven-operator-flow-contract.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence mirror write 전 단계인 operator/manual repair contract만 가장 작은 범위로 문서에 고정했다.
- `planning-gate-selector`: docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 골랐다.
- `work-log-closeout`: 이번 계약 변경, 실행 검증, 남은 operator flow 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 라운드에서 `classifySameIdCoexistencePostWriteFailure()`는 `repair-required`와 `rollback-recovery-unproven`을 계산할 수 있게 됐지만, 두 outcome을 future mirror-write worker가 어떤 operator/manual repair flow로 승격해야 하는지는 아직 문서로 닫히지 않았다.
- user-facing failure를 언제까지 `INTERNAL`로 유지해야 하는지, operator가 어떤 evidence를 모아야 하는지, internal worker payload에 무엇을 남기고 무엇은 남기지 말아야 하는지 최소 범위 계약이 필요했다.
- 이번 라운드는 docs-only/audit-first로 그 operator flow contract만 잠그는 것이 목표였다.

## 핵심 변경
- `analysis_docs/v2/13...`에 `same-id coexistence operator/manual repair flow contract` 단락을 추가해 `repair-required`와 `rollback-recovery-unproven`의 정의를 분리했다.
- `repair-required`는 rollback 미시도/실패, `parsed-row-committed`, `malformed-tail`처럼 persistence correction 여부를 operator가 바로 판단해야 하는 상태로 적었고, `rollback-recovery-unproven`은 stored rollback은 성공했지만 complete no-write proof가 없는 수동 검토 대기 상태로 적었다.
- 두 상태 모두 user-facing route는 `INTERNAL` failure를 유지하고, success/복구 완료/안전하게 되돌림 같은 문구를 반환하면 안 된다고 명시했다.
- operator evidence checklist에는 `batchId`, target `accountId`, rollback 시도/성공 여부, `legacyVerification.status`, latest parsed legacy batch summary와 `[검증 필요]` stored snapshot 비교·raw tail summary를 남겼다.
- future route-local worker payload에는 outcome, reason, `successAllowed: false`, verification status, rollback flags, latest parsed legacy batch summary 정도만 남기고, raw NDJSON line이나 filesystem path 같은 operator-only detail은 user-facing payload에 싣지 말아야 한다고 적었다.
- `analysis_docs/v2/11...`에는 next cut이 route integration보다 operator flow contract 정리라는 연결 메모를 추가했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-rollback-recovery-unproven-operator-flow-contract.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only라 route나 worker behavior를 실제로 바꾸지 않았다.
- `rollback-recovery-unproven`은 여전히 complete no-write proof가 없다는 뜻이므로, operator/manual repair 없이 closeout할 수 있는 상태가 아니다.
- `[검증 필요]` stored pre-write snapshot 비교와 raw tail summary를 실제 어떤 helper가 공급할지, future route-local worker가 이를 어떤 internal log/payload로 남길지는 후속 구현에서 다시 확인해야 한다.
