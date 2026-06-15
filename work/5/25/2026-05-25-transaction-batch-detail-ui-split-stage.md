# 2026-05-25 transaction batch detail UI split stage

## 변경 파일
- `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`
- `src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/sections.tsx`
- `src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/shared.ts`
- `src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/useTransactionBatchDetailController.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/e2e/helpers/e2eTest.ts`
- `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- `work/5/25/2026-05-25-transaction-batch-detail-ui-split-stage.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: batch detail/cashflow/draft 계약에서 payload shape와 split ratio 파라미터를 유지해야 하는지 확인했습니다.
- `planning-gate-selector`: TSX UI 분리, App Router page import, planning v3 batch detail/cashflow 영향에 맞춰 focused lint, API/UI test, typecheck, build, flow e2e를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 검증 결과, 남은 리스크를 `/work` 형식으로 정리했습니다.

## 변경 이유
- `TransactionBatchDetailClient`가 fetch 상태, 파생 계산, action handler, 표시 section을 한 파일에 담고 있어 후속 보정 변경의 위험이 컸습니다.
- batch detail 화면은 `/planning/v3/transactions/batches/[id]`의 deep-link surface라 selector와 follow-through 문구를 유지하면서 controller/shared/sections 경계로 나눌 필요가 있었습니다.
- 분리 중 `fixedRatio`/`variableRatio`, draft `assumptions`, 월별 지출 sign처럼 API 계약과 연결된 helper 의미가 바뀔 수 있어 원래 계약으로 복원했습니다.
- flow e2e는 dev HMR mock이 accounts/transactions hydration을 막는 조건과 오래된 `CSV Import` exact 기대값 때문에 실제 detail 검증 전에 실패했습니다.

## 핵심 변경
- `TransactionBatchDetailClient`는 `PageShell`과 section wiring만 남기고 화면 로직을 `useTransactionBatchDetailController`로 이동했습니다.
- top surface, 계좌 연결, overview, 거래 보정, cashflow, draft review UI를 `sections.tsx`로 분리했습니다.
- `shared.ts`에 타입 guard, KRW/evidence formatting, split query, draft cashflow/assumptions helper를 분리하고 기존 API 계약을 유지했습니다.
- e2e helper에서 `/planning/v3/accounts`와 `/planning/v3/transactions*`를 dev HMR mock 예외로 두어 해당 flow의 hydration 대기를 안정화했습니다.
- flow e2e는 계좌/업로드 select enabled 상태를 기다리고, 실제 화면 문구인 `raw CSV Import` 링크를 검증하도록 맞췄습니다.

## 검증
- `wsl -d Ubuntu -- sh -lc "cd /home/xpdlqj/code/finance && git diff --check -- 'src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx' 'src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail' tests/planning-v3-batches-api.test.ts"` 통과
- `wsl -d Ubuntu -- sh -lc "cd /home/xpdlqj/code/finance && corepack pnpm exec eslint 'src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx' 'src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/sections.tsx' 'src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/shared.ts' 'src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/useTransactionBatchDetailController.ts' tests/planning-v3-import-followthrough-ui.test.tsx tests/planning-v3-batches-api.test.ts"` 통과
- `wsl -d Ubuntu -- sh -lc "cd /home/xpdlqj/code/finance && corepack pnpm test tests/planning-v3-import-followthrough-ui.test.tsx tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts"` 통과: 4 files, 46 tests
- `wsl -d Ubuntu -- sh -lc "cd /home/xpdlqj/code/finance && corepack pnpm exec tsc --noEmit"` 통과
- `wsl -d Ubuntu -- sh -lc "cd /home/xpdlqj/code/finance && corepack pnpm build"` 통과: 254 pages 생성
- `wsl -d Ubuntu -- sh -lc "cd /home/xpdlqj/code/finance && corepack pnpm exec eslint tests/e2e/helpers/e2eTest.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts"` 통과
- `wsl -d Ubuntu -- sh -lc "cd /home/xpdlqj/code/finance && corepack pnpm exec playwright test tests/e2e/flow-v3-import-to-cashflow.spec.ts --workers=1 --reporter=line"` 최종 통과: 1 test
- `wsl -d Ubuntu -- sh -lc "cd /home/xpdlqj/code/finance && corepack pnpm typecheck"`는 package script 내부의 `pnpm exec`가 현재 WSL PATH에서 `pnpm`을 찾지 못해 실패했습니다. 같은 검증 본문인 `corepack pnpm exec tsc --noEmit`를 직접 실행해 통과를 확인했습니다.
- e2e 초기 실행 2회는 `/planning/v3/accounts` hydration 전/중 버튼 disabled 상태에서 실패했고, `E2E_DISABLE_DEV_HMR=0` 재현에서는 detail 화면까지 도달한 뒤 오래된 `CSV Import` exact 기대값에서 실패했습니다. helper/spec 수정 후 기본 설정으로 재실행해 통과했습니다.

## 남은 리스크
- 이번 라운드는 transaction batch detail와 해당 flow e2e 안정화에 한정했습니다. 전체 `pnpm e2e:rc`는 아직 실행하지 않았습니다.
- `tests/e2e/helpers/e2eTest.ts`의 HMR mock 예외가 accounts/transactions flow에는 필요하다는 점을 확인했지만, 다른 e2e 경로의 HMR mock 정책은 이번 라운드에서 재분류하지 않았습니다.
- worktree에는 planning workspace, news, planner wizard, data-source 문서 등 범위 밖 변경이 계속 남아 있습니다.
