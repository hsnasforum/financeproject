# 2026-03-19 N2 batch read owner narrowing

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/lib/planning/v3/service/getBatchSummary.ts`
- `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`
- `src/lib/planning/v3/balances/monthly.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/app/api/planning/v3/balances/monthly/route.ts`
- `src/app/api/planning/v3/draft/profile/route.ts`
- `tests/planning-v3-getBatchSummary.test.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-balances-api.test.ts`
- `tests/planning-v3-draft-profile-api.test.ts`
- `tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- `work/3/19/2026-03-19-n2-batch-read-owner-narrowing.md`

## 사용 skill

- `planning-gate-selector`: batch/service/API/test 변경 범위에 맞춰 targeted test와 `pnpm build` 중심 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 남은 리스크를 `/work` closeout 형식으로 정리하는 데 사용

## 변경 이유

- `N1`/`N2` audit에서 `ImportBatch` / `TransactionRecord` family의 user-facing read facade가 stored batch snapshot이 있어도 legacy batch bridge를 직접 읽는 경로가 남아 있었다.
- 이번 라운드는 writer owner를 바꾸지 않고, batch detail / summary / balances / draft profile generation을 canonical batch store 쪽으로 한 단계 더 기울이는 가장 작은 수정이 필요했다.
- batch list route, draft family facade split, legacy override bridge containment 라운드를 다시 열지 않으면서 stored-first와 dual-read 잔존 범위를 명확히 분리해야 했다.

## 핵심 변경

- `transactions/store.ts`에 `loadStoredFirstBatchTransactions`, `getLatestStoredFirstBatchId` helper를 추가해 stored batch meta + stored transactions를 먼저 읽고, stored snapshot이 불완전하거나 없을 때만 legacy batch bridge로 fallback 하도록 정리했다.
- `getBatchSummary`와 `generateDraftPatchFromBatch`는 더 이상 `readBatchTransactions`를 직접 호출하지 않고 stored-first helper를 통해 batch rows를 읽도록 바꿨다.
- `/api/planning/v3/transactions/batches/[id]`, `/api/planning/v3/balances/monthly`, `/api/planning/v3/draft/profile`도 stored-first helper를 우선 사용하게 바꿨다. draft profile route는 `batchId`가 없을 때 latest stored batch를 먼저 고르고, 그다음 legacy latest batch로 fallback 한다.
- stored batch와 legacy batch가 같은 `batchId`를 공유할 때 user-facing read가 stored snapshot을 우선 읽는지 확인하는 targeted test를 summary/detail/balances/draft profile/draft patch 경로에 추가했다.
- 아직 `stored-only`로 강제하지는 않았고, stored meta rowCount와 stored row 개수를 기준으로 `stored-first`가 충분한 경로와 `dual-read fallback`이 필요한 경로를 helper 안에서 분리했다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- `pnpm build`
- `git diff --check -- src/lib/planning/v3/service/getBatchSummary.ts src/lib/planning/v3/service/generateDraftPatchFromBatch.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/balances/monthly.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/draft/profile/route.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- 이번 라운드는 batch detail / summary / balances / draft profile generation만 stored-first로 좁혔고, batch list route와 draft family facade split은 그대로 남아 있어 전체 batch family가 아직 `stored-only`는 아니다.
- stored snapshot completeness를 `meta.rowCount`와 stored row 개수로 판정하므로, legacy bridge에만 남아 있는 보조 필드나 incomplete snapshot 복구 정책이 더 필요하면 후속 라운드에서 다시 다뤄야 한다.
- 워크트리에는 이전 라운드의 planning/v3 관련 변경과 unrelated dirty 파일이 함께 남아 있으므로, 후속 commit 시 이번 배치 범위를 더 엄격히 분리해야 한다.
