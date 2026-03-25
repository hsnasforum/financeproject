# 2026-03-21 N2 stored-meta only batch account boundary

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/account/route.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/21/2026-03-21-n2-stored-meta-only-batch-account-boundary.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: stored-meta only account command 경계를 helper 하나로 분리하고, existing success/guard path는 유지한 채 route-local 분기를 최소화하는 데 사용했다.
- `planning-gate-selector`: account API route와 helper 변경 범위에 맞춰 targeted test, `pnpm build`, `git diff --check`를 실행 검증으로 유지했다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 canonical account writer 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- `/api/planning/v3/transactions/batches/[id]/account`는 stored meta만 있는 batch를 만나도 legacy writer owner로 write를 시도한 뒤 `NO_DATA` 404를 반환했다.
- 이 상태는 batch가 없는 것이 아니라 stored meta 기준으로는 존재하지만, canonical account writer가 아직 legacy owner라 현재 write path가 지원되지 않는 경우다.
- broad owner merge나 stored meta write-back 없이도, 이 경계는 `NO_DATA`보다 explicit `INPUT` guard로 드러내는 편이 안전했다.

## 핵심 변경
- `getStoredBatchAccountCommandSurfaceState()`가 same-id legacy batch가 없고 stored meta만 있는 경우 `stored-meta-only`를 별도 surface로 반환하도록 좁혔다.
- `/api/planning/v3/transactions/batches/[id]/account`는 `stored-meta-only`를 legacy write로 흘리지 않고, `INPUT` 400과 `저장 메타만 있는 배치는 아직 계좌 연결을 지원하지 않습니다.` 메시지로 guard 한다.
- pure legacy batch account binding success, synthetic stored-only guard, same-id stored-meta + legacy guard는 기존 동작을 유지했다.
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`에 stored-meta only batch가 cashflow read surface에서는 계속 보이지만 account write는 explicit guard로 막히는 회귀 테스트를 추가했다.
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `stored-meta only` account command 메모도 `NO_DATA`가 아니라 explicit guard 기준으로 맞췄다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts work/3/21/2026-03-21-n2-stored-meta-only-batch-account-boundary.md`
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- 미실행 검증:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- stored-meta only batch는 이제 `NO_DATA`가 아니라 explicit guard로 드러나지만, canonical stored account writer 자체를 새로 열지는 않았다.
- `src/lib/planning/v3/service/transactionStore.ts`의 legacy account writer는 그대로 유지되므로, stored meta write-back, owner merge, broader account write contract 재정의는 후속 범위다.
- same-id stored/legacy coexistence와 synthetic stored-only guard는 유지했지만, reader facade와 writer owner를 하나의 pure canonical surface로 합치는 작업은 아직 닫히지 않았다.
