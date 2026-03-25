# 2026-03-22 N2 route-local sequencing wrapper bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `src/lib/planning/v3/store/batchesStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-route-local-sequencing-wrapper-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence future mirror write 직전 단계인 route-local sequencing wrapper bootstrap만 가장 작은 범위로 구현했다.
- `planning-gate-selector`: service/helper/unit test 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 유지했다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, ordered write/rollback trace와 남은 미증명 경계를 `/work` 형식으로 정리했다.

## 변경 이유
- current `/account` route는 same-id coexistence를 계속 explicit guard로 끊고 있지만, future mirror write가 재사용할 ordered write/rollback trace wrapper는 아직 없었다.
- verification/classification/evidence/payload helper stack은 이미 있었지만, stored pre-write snapshot capture, stored first write, legacy second write, stored rollback attempt를 한 곳에서 조합해 secondary failure input까지 만드는 service wrapper가 필요했다.
- 이번 라운드는 route behavior를 바꾸지 않고, future route integration이 그대로 호출할 internal sequencing wrapper bootstrap만 여는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/store/batchesStore.ts`에 `restoreStoredBatchAccountBindingSnapshot()`을 추가해 stored meta `accounts` pre-write snapshot을 그대로 복원할 수 있게 했다.
- `src/lib/planning/v3/service/transactionStore.ts`에 `runSameIdCoexistenceStoredThenLegacyRouteLocalSequence()`와 관련 trace/result type을 추가했다. 이 wrapper는 stored pre-write snapshot capture, stored first write, legacy second write, second-write failure 시 stored rollback, secondary failure worker input 조립을 한 곳에서 수행한다.
- wrapper는 secondary failure가 나면 `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`와 `buildSameIdCoexistenceOperatorRepairPayload()`까지 조합하지만, success semantics를 열거나 current `/account` route를 바꾸지는 않는다.
- `tests/planning-v3-transactionStore.test.ts`에는 stored-first success trace와 legacy second write failure + stored rollback trace를 고정하는 회귀 테스트를 추가했다.
- `analysis_docs/v2/13...`에는 route-local sequencing wrapper bootstrap이 열렸지만 current `/account` route는 여전히 explicit guard-only라는 점을 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts src/lib/planning/v3/store/batchesStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-route-local-sequencing-wrapper-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- wrapper는 internal sequencing bootstrap만 제공하고, current `/account` route는 여전히 same-id coexistence에서 explicit guard 상태로 남아 있다.
- `rollback-recovery-unproven`과 complete no-write proof 부재는 그대로라서, actual operator repair closeout과 user-facing `INTERNAL` failure 연결은 후속 route integration에서 다시 닫아야 한다.
- `[검증 필요]` legacy append exception summary shape와 ordered write/rollback trace를 future route code가 어떤 internal log/payload 경계로 소비할지는 다음 구현 컷에서 다시 검증해야 한다.
