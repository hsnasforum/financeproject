# 2026-03-12 planning v3 transactions and user-facing guard closeout

## 변경 파일
- `src/app/planning/v3/transactions/page.tsx`
- `src/app/api/planning/v3/transactions/batches/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/account/route.ts`
- `src/app/api/planning/v3/transactions/account-overrides/route.ts`
- `src/app/api/planning/v3/transactions/transfer-overrides/route.ts`
- `src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts`
- `src/app/api/planning/v3/profiles/route.ts`
- `src/app/api/planning/v3/draft/profile/route.ts`
- `docs/current-screens.md`
- `docs/planning-v3-migration.md`
- `tests/planning/catalog/currentScreens.fullRouteSet.test.ts`
- `tests/planning-v3-transactions-page-redirect.test.ts`
- `tests/planning-v3-user-facing-remote-host-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`
- `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- `work/3/12/2026-03-12-planning-v3-transactions-and-user-facing-guard-closeout.md`

## 사용 skill
- `planning-gate-selector`: `planning-v3` 첫 배치를 route/API/e2e/build 영향으로 분류하고 `vitest + current-screens guard + targeted e2e + build + multi-agent:guard` 세트를 고정하는 데 사용했다.
- `route-ssot-check`: `/planning/v3/transactions` 진입점 추가와 `docs/current-screens.md` 정합성을 확인하고 stale `.next` false negative를 source 기준으로 바로잡는 데 사용했다.
- `work-log-closeout`: 이번 라운드의 실제 변경, 실제 실패 원인, 실제 PASS 검증을 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 우선순위 1 `planning-v3`를 `draft/profile/transactions` 첫 배치로 잘라 재검증하던 중, `/planning/v3/transactions` 진입이 실제로 404라서 import-to-cashflow e2e가 시작점에서 막혔다.
- 진입점을 추가한 뒤에는 `tests/planning/catalog/currentScreens.fullRouteSet.test.ts`가 stale `.next` manifest를 우선 사용해 새 source route를 가짜로 누락시키는 문제가 드러났다.
- 추가 정적 분석에서 `transactions` 상세/보정 경로와 `profile draft`의 기존 프로필 선택 경로가 여전히 `local-only/dev-only`에 묶여 있어, experimental user-facing v3 화면과 API 계약이 다시 갈라져 있음을 확인했다.
- 같은 라운드 e2e에서는 `tests/fixtures/planning-v3-upload.sample.csv`가 사라진 상태라 업로드 spec 자체가 fixture 경로 drift로 실패하고 있었다.

## 핵심 변경
- `src/app/planning/v3/transactions/page.tsx`를 추가해 `/planning/v3/transactions`를 공식 진입점으로 복구하고 `/planning/v3/transactions/batches`로 redirect 하도록 맞췄다.
- `tests/planning/catalog/currentScreens.fullRouteSet.test.ts`는 `.next` manifest가 stale해도 `src/app` source route를 우선 보도록 바꿔 새 public route를 거짓 누락시키지 않게 했다.
- `transactions`/`draft/profile`/`profiles` 사용자 화면이 직접 쓰는 v3 API에서 `assertLocalHost`와 `onlyDev()`만 제거하고 same-origin + CSRF는 그대로 유지해 remote same-origin 계약으로 정렬했다.
- `tests/planning-v3-user-facing-remote-host-api.test.ts`와 `tests/planning-v3-write-route-guards.test.ts`를 통해 transactions batch list/detail helpers, override writes, `draft/profile`, `profiles`가 remote same-origin에서 403 없이 동작함을 고정했다.
- `tests/e2e/flow-v3-import-to-cashflow.spec.ts`의 fixture 경로를 실제 존재하는 `tests/fixtures/planning-v3/csv/sample.csv`로 수정해 CSV 업로드 e2e drift를 닫았다.
- `docs/current-screens.md`, `docs/planning-v3-migration.md`에 transactions 진입점과 v3 user-facing API guard 원칙을 반영했다.

## 검증
- `pnpm test tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-draft-scenario-api.test.ts tests/planning-v3-drafts-upload-flow.test.ts tests/planning-v3-batch-center-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-txnOverridesBatchStore.test.ts`
- `pnpm test tests/planning-v3-batch-center-ui.test.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/planning-v3/drafts-upload-flow.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-batches-merge-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-profileDraftStore.test.ts tests/planning-v3-profileDraftFromCashflow.test.ts`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-v3-import-to-cashflow.spec.ts tests/e2e/v3-draft-apply.spec.ts --workers=1`
  - 1차 FAIL: `/planning/v3/transactions` 404, 이후 fixture path drift 확인
  - 수정 후 재실행 PASS
- `pnpm test tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-transactions-page-redirect.test.ts tests/planning/catalog/currentScreens.fullRouteSet.test.ts`
- `pnpm exec eslint src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/app/api/planning/v3/transactions/account-overrides/route.ts src/app/api/planning/v3/transactions/transfer-overrides/route.ts src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts src/app/api/planning/v3/profiles/route.ts src/app/api/planning/v3/draft/profile/route.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-transactions-page-redirect.test.ts tests/planning/catalog/currentScreens.fullRouteSet.test.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `pnpm multi-agent:guard`

## 남은 리스크
- 이번 배치에서 `draft/profile/transactions` 쪽 실제 blocker는 닫혔다. `/planning/v3/transactions` entrypoint, stale current-screens false negative, user-facing same-origin guard drift, upload fixture drift 모두 해소했다.
- `planning-v3` 내부 재스캔 기준으로 다음 same-origin/local-only 정렬 대상은 `balances/monthly`, `categories/rules`, `scenarios/library`이며, 이는 다음 배치에서 따로 처리하는 편이 안전하다.
- `src/app/api/planning/v3/transactions/overrides/route.ts`, `src/app/api/planning/v3/import/csv/route.ts`, `src/app/api/planning/v3/batches*`는 아직 local-only/dev-only가 남아 있지만 현재 user-facing `transactions` 첫 배치에서 직접 쓰는 경로는 아니다. 다음 `planning-v3` batch에서 실제 UI 연결 여부를 확인한 뒤 처리해야 한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
