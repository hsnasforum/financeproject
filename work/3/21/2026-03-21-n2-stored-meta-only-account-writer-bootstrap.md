# 2026-03-21 N2 stored-meta-only account writer bootstrap

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/account/route.ts`
- `src/lib/planning/v3/store/batchesStore.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/21/2026-03-21-n2-stored-meta-only-account-writer-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: stored-first read contract를 유지한 채 `stored-meta-only` account writer bootstrap만 가장 작은 범위로 열기 위해 사용했다.
- `planning-gate-selector`: route/store/test 변경에 맞춰 `pnpm test`, `pnpm build`, `git diff --check`를 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 유지된 guard 경계와 잔여 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- `stored-meta-only` batch는 stored meta 기준으로 존재하지만 `/api/planning/v3/transactions/batches/[id]/account`에서는 canonical writer가 없어 `NO_DATA` 또는 guard처럼 보이는 경계가 남아 있었다.
- stored-first read consumer는 이미 `ImportBatchMeta.accounts[0].id`를 account binding으로 읽을 수 있으므로, legacy owner가 없는 batch에 한해 가장 작은 stored writer bootstrap을 열 필요가 있었다.
- same-id stored/legacy coexistence, synthetic stored-only, pure legacy-only 경계는 그대로 유지한 채 `stored-meta-only`만 별도 success path로 여는 것이 이번 라운드 목표였다.

## 핵심 변경
- `src/lib/planning/v3/store/batchesStore.ts`에 `updateStoredBatchAccountBinding()`을 추가해 `index.json`의 `ImportBatchMeta.accounts`만 부분 갱신할 수 있게 했다.
- 같은 helper 안에서 기존 계정 목록을 보존하면서 새 primary binding을 `accounts[0]`로 올리는 `buildUpdatedBatchAccounts()`를 추가했다.
- `/api/planning/v3/transactions/batches/[id]/account`는 `stored-meta-only`일 때만 새 stored writer helper를 사용하고, same-id stored-meta + legacy guard / synthetic stored-only guard / pure legacy-only success path는 그대로 유지했다.
- route는 stored-meta-only success 응답용 batch shell을 별도로 만들어, legacy writer가 없어도 user-facing response가 binding 변경 사실을 과장하지 않게 정리했다.
- 테스트에 stored-meta-only bootstrap success 케이스를 추가하고, representative stored-first consumer로 detail route가 새 binding과 row fallback accountId를 읽는지 확인했다.
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`에는 stored-meta-only account writer bootstrap이 열린 최신 command snapshot을 반영했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/account/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/store/batchesStore.ts src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-batches-api.test.ts work/3/21/2026-03-21-n2-stored-meta-only-account-writer-bootstrap.md`
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- 미실행 검증:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 bootstrap은 `ImportBatchMeta.accounts`만 부분 갱신하며 stored transaction row rewrite나 index repair는 하지 않았다.
- same-id stored-meta + legacy coexistence는 여전히 explicit guard이고, pure legacy-only writer와 canonical stored writer를 하나로 합치지 않았다.
- detail/cashflow처럼 stored-first binding fallback을 쓰는 consumer는 새 binding을 읽지만, legacy summary precedence가 있는 surface는 coexistence 단계에서 별도 정리가 더 필요하다.
