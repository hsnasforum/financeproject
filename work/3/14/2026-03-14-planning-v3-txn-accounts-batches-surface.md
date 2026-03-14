# 2026-03-14 planning-v3 txn-accounts-batches-surface

## 변경 파일
- `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx`
- `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`
- `tests/planning-v3-user-facing-remote-host-api.test.ts`
- `tests/e2e/flow-v3-import-to-cashflow.spec.ts`

## 사용 skill
- `planning-gate-selector`: route + transactions client + direct API/e2e 변경에 맞춰 `vitest -> eslint -> build -> narrow e2e -> diff check` 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: 이번 라운드의 surface mismatch, 실행 검증, 잔여 리스크를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest note `planning-v3 news-search-refresh-storage-join-point`가 다음 우선순위 1번으로 `planning-v3 txn-accounts-batches surface`를 남겼다.
- residue split note도 `accounts/balances/batches/transactions`를 다음 큰 user-facing cluster로 분리해 두었고, 이번 라운드는 이미 닫힌 news / draft-profile / import route contract를 다시 섞지 않는 audit-first reopen으로 진행했다.
- 실제 blocker는 `transactions` surface가 import follow-through를 비존재 사용자 경로 `/planning/v3/import`로 안내하는 한 건이었다. 현재 사용자 경로 SSOT는 `/planning/v3/import/csv`다.

## 핵심 변경
- `TransactionsBatchListClient`의 업로드 실패 help copy를 `/planning/v3/import/csv` 기준으로 맞췄다.
- `TransactionBatchDetailClient`의 `CSV Import` CTA를 `/planning/v3/import/csv`로 수정해 batch detail follow-through가 실제 route contract와 이어지게 했다.
- `planning-v3-user-facing-remote-host-api.test.ts`의 import referer 2곳을 `/planning/v3/import/csv`로 바꿔 direct API test가 실제 사용자 경로를 기준으로 same-origin/cross-origin contract를 고정하게 했다.
- `flow-v3-import-to-cashflow.spec.ts`에 batch detail의 `CSV Import` 링크 href assertion을 추가해 import-to-cashflow follow-through를 narrow e2e로 고정했다.
- 조건부 포함 여부: helper/service는 열지 않았고, `docs/current-screens.md`는 경로 확인용으로만 참고했으며 `pnpm planning:current-screens:guard`는 실행하지 않았다.

## 검증
- 실행: `pnpm exec vitest run tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-batches-import-csv-service.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`
- 실행: `pnpm exec eslint src/app/api/planning/v3/accounts/route.ts src/app/api/planning/v3/accounts/[id]/route.ts src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts src/app/api/planning/v3/opening-balances/route.ts src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/batches/route.ts src/app/api/planning/v3/batches/[id]/summary/route.ts src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts src/app/api/planning/v3/transactions/batches/[id]/transfers/route.ts src/app/api/planning/v3/transactions/batches/import-csv/route.ts src/app/api/planning/v3/transactions/batches/merge/route.ts src/app/api/planning/v3/transactions/import/csv/route.ts src/app/api/planning/v3/transactions/account-overrides/route.ts src/app/api/planning/v3/transactions/overrides/route.ts src/app/api/planning/v3/transactions/transfer-overrides/route.ts src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx src/app/planning/v3/transactions/page.tsx src/app/planning/v3/transactions/batches/page.tsx src/app/planning/v3/transactions/batches/[id]/page.tsx tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-batches-import-csv-service.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- 실행: `pnpm build`
- 실행: `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-v3-import-to-cashflow.spec.ts --workers=1`
- 미실행: `pnpm planning:current-screens:guard`
- 미실행 이유: 이번 라운드는 route 추가/삭제가 아니라 기존 client follow-through 경로 mismatch 수정만 있었고, `docs/current-screens.md` 확인으로 충분했다.

## 남은 리스크
- 이번 라운드는 `transactions` surface의 import follow-through path mismatch만 닫았다. accounts / balances / batches 계산/집계 helper 자체는 reopen하지 않았다.
- `tests/planning-v3-write-route-guards.test.ts`에도 `/planning/v3/import` referer 흔적이 남아 있지만, 이번 배치 포함 파일과 검증 세트 밖이라 그대로 두었다.
- `profile-drafts list load-failure empty/help split`은 아직 다음 user-facing 후보로 남아 있다.

## 다음 라운드 우선순위
1. `[가정] planning-v3 profile-drafts list load-failure empty/help split`
2. news follow-through/copy residue는 blocker가 다시 확인될 때만 reopen
3. txn/accounts/batches helper 계산층에서 실제 mismatch가 다시 확인될 때만 후속 reopen
