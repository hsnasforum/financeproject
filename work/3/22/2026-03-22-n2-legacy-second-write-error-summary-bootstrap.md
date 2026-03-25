# 2026-03-22 N2 legacy second-write error summary bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-legacy-second-write-error-summary-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence sequencing wrapper의 legacy second-write failure summary만 가장 작은 범위로 추가했다.
- `planning-gate-selector`: service helper/unit test 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 유지했다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, error summary 경계와 남은 미증명 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- `runSameIdCoexistenceStoredThenLegacyRouteLocalSequence()`는 ordered write/rollback trace와 secondary failure payload는 남기지만, legacy second write 예외 자체는 `catch` 안에서 안전한 summary 없이 소비하고 있었다.
- future route integration은 user-facing payload로 raw exception을 내보내지 않더라도, 최소한 어떤 단계에서 어떤 보수적 내부 실패가 났는지는 internal result에서 재사용할 수 있어야 했다.
- 이번 라운드는 route behavior를 바꾸지 않고, `stage/code/message` 수준의 safe error summary bootstrap만 추가하는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `SameIdCoexistenceLegacySecondWriteErrorSummary` 타입과 `summarizeSameIdCoexistenceLegacySecondWriteError()` helper를 추가했다.
- helper는 legacy second write 예외를 raw stack이나 filesystem path 없이 `stage`, conservative `code`, safe `message`만 담는 summary로 축약한다.
- `runSameIdCoexistenceStoredThenLegacyRouteLocalSequence()`의 `secondary-failure` result는 이제 `legacySecondWriteError`를 optional field로 함께 반환한다.
- 기존 `runSameIdCoexistenceSecondaryFailureRouteLocalWorker()`, `buildSameIdCoexistenceOperatorRepairPayload()`, ordered write/rollback trace는 그대로 유지했다.
- `tests/planning-v3-transactionStore.test.ts`에는 conservative summary helper 자체와 legacy append failure 시 `secondary-failure` result에 safe summary가 실리는 회귀 테스트를 추가했다.
- `analysis_docs/v2/13...`에는 sequencing wrapper가 legacy second write 예외를 internal error summary로 남기지만, current `/account` route는 여전히 guard-only라는 점을 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-legacy-second-write-error-summary-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- error summary는 internal bootstrap만 제공하고, current `/account` route는 same-id coexistence에서 여전히 explicit guard 상태로 남아 있다.
- summary가 있어도 complete no-write proof와 actual operator repair closeout은 여전히 `[검증 필요]`이며, success semantics를 열 수 있는 상태는 아니다.
- future route integration은 이 safe summary와 secondary failure payload를 어디서 user-facing `INTERNAL` failure와 분리할지 후속 구현에서 다시 닫아야 한다.
