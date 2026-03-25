# 2026-03-22 N2 detail shell legacy summary fallback narrowing

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-detail-shell-legacy-summary-fallback-narrowing.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail shell 한 surface만 좁게 다루고 shared helper 안에서 legacy fallback 경계를 줄이는 데 사용.
- `planning-gate-selector`: detail route helper 변경으로 보고 `planning-v3-batches-api`, shared helper 영향 확인용 `/account` API test, `pnpm build`, `git diff --check`만 최소 검증으로 고정하는 데 사용.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 fallback 리스크를 표준 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- detail shell은 stored-first reader facade를 이미 쓰고 있었지만 `buildStoredFirstVisibleBatchShell()`이 `total` / `ok` / `failed` / `fileName`을 legacy summary fallback으로 한꺼번에 들고 있어 public payload 의미가 legacy bridge에 너무 기대고 있었다.
- 이번 라운드는 broad owner merge 없이 detail shell 하나에서만 count-style public 의미를 더 stored-first/current snapshot 쪽으로 좁히는 것이 목표였다.

## 핵심 변경
- `buildStoredFirstVisibleBatchShell()`은 legacy summary fallback이 필요할 때도 `total`, `ok`를 legacy summary 숫자가 아니라 current visible row count 기준으로 계산하게 바꿨다.
- `failed`, `fileName`만 shared helper 내부의 explicit legacy summary fallback으로 남겨 detail shell의 public fallback boundary를 줄였다.
- same-id coexistence verified success response shell도 같은 shared helper를 재사용하므로, route-local success body가 detail shell과 같은 좁아진 source rule을 따르게 했다.
- `tests/planning-v3-batches-api.test.ts`에 legacy summary `total` / `ok`가 과장돼 있어도 detail shell은 visible rows + failed fallback만 반영하는 회귀 테스트를 추가했다.
- `analysis_docs/v2/13...`에는 detail shell의 `total` / `ok`는 current snapshot 기준, `failed` / `fileName`만 explicit legacy fallback이라는 계약 메모를 반영했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-detail-shell-legacy-summary-fallback-narrowing.md`
- 미실행:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 detail shell만 좁혔고 `stats`의 mixed-source fallback contract는 그대로 남아 있어, legacy summary mismatch가 있으면 `batch`와 `stats`가 서로 다른 count 기준을 보일 수 있다.
- `cashflow`, `summary`, `categorized`, `transfers`, `balances/monthly`, `draft/profile`의 legacy bridge containment은 이번 라운드에서 다시 열지 않았다.
- broader owner merge, row rewrite, index repair, success/failure copy redesign은 계속 비범위다.
