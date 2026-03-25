# 2026-03-22 N2 user-facing INTERNAL failure mapper bootstrap

## 변경 파일
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-user-facing-internal-failure-mapper-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence secondary-failure result를 route-safe `INTERNAL` envelope로 줄이는 helper만 가장 작은 범위로 추가했다.
- `planning-gate-selector`: service helper/unit test 변경으로 분류하고 `pnpm test`와 `git diff --check`만 이번 라운드 최소 검증 세트로 유지했다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, user-facing failure mapper 경계와 남은 미증명 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- `runSameIdCoexistenceStoredThenLegacyRouteLocalSequence()`는 secondary-failure internal result, operator repair payload, legacy second-write error summary를 모두 남기지만, future route integration이 그대로 재사용할 route-safe `INTERNAL` failure mapper는 아직 없었다.
- future route는 operator/internal detail을 직접 노출하지 않고도 같은 failure family를 일관되게 반환해야 하므로, 최소한의 user-facing envelope mapper를 먼저 고정할 필요가 있었다.
- 이번 라운드는 current `/account` route를 바꾸지 않고, generic `INTERNAL` code와 safe message만 남기는 pure helper bootstrap이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/service/transactionStore.ts`에 `SameIdCoexistenceUserFacingInternalFailure` 타입과 `toSameIdCoexistenceUserFacingInternalFailure()` helper를 추가했다.
- 새 helper는 `secondary-failure` sequencing result를 받아 `code: "INTERNAL"`, safe `message`, `successAllowed: false`만 남기고 `legacySecondWriteError`, `operatorRepairPayload`, `secondaryFailure.failure` detail은 user-facing envelope에 싣지 않는다.
- mapper는 `repair-required`와 `rollback-recovery-unproven` 모두를 success처럼 보이지 않는 동일한 generic failure family로 축약한다.
- `tests/planning-v3-transactionStore.test.ts`에는 `repair-required` 성격의 synthetic secondary-failure object와 실제 wrapper 기반 `rollback-recovery-unproven` result 각각에 대해 route-safe `INTERNAL` envelope가 유지되는 회귀 테스트를 추가했다.
- `analysis_docs/v2/13...`에는 user-facing INTERNAL failure mapper bootstrap이 열렸지만, current `/account` route는 여전히 explicit guard-only라는 점을 보강했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `git diff --check -- src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-transactionStore.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-user-facing-internal-failure-mapper-bootstrap.md`
- 미실행 검증:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- mapper는 user-facing envelope bootstrap만 제공하고, current `/account` route는 same-id coexistence에서 여전히 explicit guard 상태로 남아 있다.
- generic `INTERNAL` failure가 생겼다고 해서 complete no-write proof나 actual operator repair closeout이 확보된 것은 아니며, 둘 다 여전히 `[검증 필요]`다.
- future route integration은 이 mapper와 operator/internal payload를 어디서 분기할지, 그리고 어떤 지점에서만 mirror-write sequencing wrapper를 호출할지 후속 구현에서 다시 닫아야 한다.
