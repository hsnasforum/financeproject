# 2026-03-22 N2 detail stats mixed-source fallback narrowing

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-detail-stats-mixed-source-fallback-narrowing.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail route의 `stats` 한 surface만 좁히고 batch shell/source rule을 재사용하는 최소 수정으로 정리하는 데 사용.
- `planning-gate-selector`: detail API route의 route-local helper 변경으로 보고 `pnpm test tests/planning-v3-batches-api.test.ts`, `pnpm build`, `git diff --check`만 실행 검증으로 선택하는 데 사용.
- `work-log-closeout`: 실제 수정 파일, 실행 검증, 미실행 검증, 남은 mixed-source 리스크를 표준 `/work` 형식으로 남기는 데 사용.

## 변경 이유
- detail `batch` shell은 이미 `total` / `ok`를 current visible row count 기준으로 좁혔지만, detail route의 `stats`는 `legacy summary total/ok/failed`를 그대로 더 넓게 들고 있어 같은 payload 안에서 mixed-source 의미가 남아 있었다.
- 이번 라운드는 broad owner merge 없이 detail `stats` 한 surface만 최소 범위로 좁혀, `stats.total` / `stats.ok`가 batch shell과 과도하게 어긋나지 않도록 맞추는 것이 목적이었다.

## 핵심 변경
- detail route의 `toBatchDetailStats()`는 legacy summary를 직접 다시 읽지 않고, 이미 좁혀진 `buildStoredFirstVisibleBatchShell()`의 `total` / `ok` / `failed` count rule을 재사용하도록 바꿨다.
- 그 결과 `stats.total` / `stats.ok`는 current visible row count 기준으로 batch shell과 같은 경계를 따르고, `stats.failed`는 batch shell `failed`와 같은 explicit legacy summary fallback만 유지한다.
- `stats.inferredMonths`는 계속 raw `data` snapshot 기준 월 집계 결과를 그대로 사용해 current raw/recovered row aggregation 의미를 유지한다.
- `tests/planning-v3-batches-api.test.ts`의 legacy summary mismatch fixture에 `stats` 회귀 검증을 추가해 `total: 3`, `ok: 2`, `failed: 1`, `inferredMonths: 1` contract를 고정했다.
- `analysis_docs/v2/13...`에는 detail route에서 `batch.total/ok`, `stats.total/ok`는 stored-first/current snapshot 기준, `batch.failed`, `stats.failed`, `fileName`만 explicit legacy fallback이라는 계약 메모를 반영했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-detail-stats-mixed-source-fallback-narrowing.md`
- 미실행:
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 detail route `stats`만 좁혔고 `cashflow`, `summary`, `categorized`, `transfers`, `balances/monthly`, `draft/profile` 같은 다른 consumer는 다시 열지 않았다.
- `stats.failed`는 여전히 legacy summary fallback에 기대므로, legacy summary 자체가 잘못돼 있으면 failed count는 current visible rows와 다른 source를 계속 따른다.
- writer owner merge, row rewrite, index repair, delete boundary, `/account` route semantics는 이번 범위 밖이라 mixed ownership 자체는 여전히 남아 있다.
