# 2026-03-22 N2 transfers stored-first account binding parity

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/transfers/route.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-transfers-api.test.ts`
- `work/3/22/2026-03-22-n2-transfers-stored-first-account-binding-parity.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: transfers support surface 하나만 좁혀 stored-first binding helper 계약 밖에 남아 있던 row 선택 로직을 정리하고, existing projection helper를 재사용해 범위를 최소화했다.
- `planning-gate-selector`: transfers route/test 변경과 shared helper 영향에 맞춰 `pnpm test`, `pnpm build`, `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 수정한 helper 재사용 방식, 실행 검증, 남은 support-surface 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- `/api/planning/v3/transactions/batches/[id]/transfers`는 `stored.length > 0 ? stored : legacy` 조합을 직접 사용해, detail/cashflow/summary/categorized가 따르는 stored-first binding helper 계약 밖에 남아 있었다.
- same-id coexistence에서 stored shadow row에 `accountId`가 비어 있으면 `detections`와 `unassignedCount`가 visible binding과 다르게 `unassigned` 기준으로 계산될 수 있었다.
- 이번 라운드는 support/internal route 한 곳만 stored-first projection helper 기준으로 좁혀 parity를 맞추는 것이 목표였다.

## 핵심 변경
- transfers route가 `readBatchTransactions()` + `getBatchTransactions()` 직접 조합 대신 `loadStoredFirstBatchTransactions()`를 사용하도록 바꿨다.
- transfer detection 입력은 raw 조합 대신 `getStoredFirstBatchSummaryProjectionRows(loaded)`를 재사용해 same-id coexistence에서도 stored-first visible binding view를 따르게 했다.
- `src/lib/planning/v3/transactions/store.ts`의 summary projection helper 주석은 summary/categorized에 더해 transfers도 같은 stored-first projection을 읽는다는 설명으로 보강했다.
- `tests/planning-v3-transfers-api.test.ts`에는 same-id coexistence + `omitRowAccountId` stored shadow batch 회귀 테스트를 추가해, `stats.totalTxns`, `detections`, `unassignedCount`가 stored-first visible binding view 기준으로 계산되는지 고정했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transfers-api.test.ts tests/planning-v3-categorized-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/transfers/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-transfers-api.test.ts tests/planning-v3-categorized-api.test.ts work/3/22/2026-03-22-n2-transfers-stored-first-account-binding-parity.md`
- 미실행 검증:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 transfers support surface 하나만 정리했고, command-side coexistence writer나 dual-write contract는 여전히 비범위다.
- transfers도 raw payload를 따로 노출하지 않으므로, stored-first parity는 projection/detection 입력 기준으로만 맞췄다.
- broader legacy migration, row rewrite, index repair, other support surface 재점검은 후속 범위다.
