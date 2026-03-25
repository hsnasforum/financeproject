# 2026-03-22 N2 categorized stored-first account binding parity

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-categorized-api.test.ts`
- `work/3/22/2026-03-22-n2-categorized-stored-first-account-binding-parity.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: categorized route 하나만 좁혀 same-id coexistence stored-first account binding drift를 정리하고, existing helper 재사용으로 범위를 최소화했다.
- `planning-gate-selector`: categorized route/test 변경에 맞춰 지정된 2개 테스트, `pnpm build`, `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 수정한 helper 재사용 방식, 실행 검증, 남은 parity 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- `/api/planning/v3/transactions/batches/[id]/categorized`는 stored-first batch read를 쓰고도 detect/categorize 입력에는 raw `loaded.transactions`를 직접 넘겨 same-id coexistence drift가 남아 있었다.
- stored shadow row에 `accountId`가 비어 있는 경우 categorized payload의 visible `accountId`가 `unassigned`로 새어, detail/cashflow/summary와 다른 visible binding 의미를 만들 수 있었다.
- 이번 라운드는 writer merge나 route 확장 없이 categorized consumer 한 surface만 stored-first projection helper 기준으로 맞추는 것이 목표였다.

## 핵심 변경
- categorized route가 raw `loaded.transactions` 대신 `getStoredFirstBatchSummaryProjectionRows(loaded)`를 detect/categorize 입력으로 사용하도록 바꿨다.
- `src/lib/planning/v3/transactions/store.ts`의 summary projection helper 주석을 summary뿐 아니라 categorized도 같은 stored-first visible binding view를 읽는다는 설명으로 보강했다.
- categorized route에는 raw row payload가 없으므로 same-id coexistence에서도 summary와 같은 stored-first projection을 쓴다는 route-local comment를 추가했다.
- `tests/planning-v3-categorized-api.test.ts`에 same-id coexistence + `omitRowAccountId` stored shadow batch 회귀 테스트를 추가해, payload `accountId`가 `unassigned`가 아니라 stored meta account binding(`acc-stored`)을 읽는지 고정했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-batches-api.test.ts work/3/22/2026-03-22-n2-categorized-stored-first-account-binding-parity.md`
- 미실행 검증:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 categorized 한 surface만 정리했고, transfers route나 broader downstream categorized consumer는 다시 수정하지 않았다.
- same-id coexistence writer, dual-write, legacy migration, row rewrite, index repair는 여전히 비범위다.
- categorized도 raw payload를 따로 노출하지 않으므로, visible binding parity는 projection layer 기준으로만 맞췄다.
