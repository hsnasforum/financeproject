# 2026-03-22 N2 verified-success response shell helper bootstrap

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-transactionStore.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-verified-success-response-shell-helper-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail batch shell source rule과 same-id coexistence verified-success response shell을 같은 stored-first read contract로 좁히는 데 사용.
- `planning-gate-selector`: shared helper, route import, unit/API regression, build 영향에 맞춰 `pnpm test` 2개와 `pnpm build`, `git diff --check`를 최소 검증 세트로 선택하는 데 사용.
- `work-log-closeout`: `/work` 기록에 변경 파일, 실행 검증, 남은 success closeout 리스크를 짧게 남기는 데 사용.

## 변경 이유
- same-id coexistence success split worker까지는 생겼지만, `verified-success-candidate`를 받았을 때 어떤 `batch` shell과 `updatedTransactionCount`를 route가 조립해야 하는지는 아직 helper로 닫히지 않았다.
- detail route batch shell source rule도 route-local helper로 남아 있어, future success response shell과 drift가 생길 위험이 있었다.
- 이번 라운드는 `/account` route를 열지 않고, detail shell 규칙을 shared helper로 옮긴 뒤 verified-success response shell helper만 bootstrap 하는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/transactions/store.ts`에 `buildStoredFirstVisibleBatchShell()`을 추가해 detail route의 stored-first batch shell source rule을 shared helper로 옮겼다.
- 같은 파일에 `buildSameIdCoexistenceVerifiedSuccessResponseShell()`을 추가해 `verified-success-candidate` 입력에서 post-write reloaded stored-first batch shell과 legacy `updatedTransactionCount`를 함께 조립하게 했다.
- `/api/planning/v3/transactions/batches/[id]` detail route는 이제 shared shell helper를 그대로 재사용해 source rule drift를 줄였다.
- `tests/planning-v3-transactionStore.test.ts`에는 verified-success response shell helper가 detail-shell source rule과 같은 batch shell을 만들고 legacy `updatedTransactionCount`를 그대로 유지하는 케이스를 추가했다.
- `analysis_docs/v2/13...`에는 response shell helper bootstrap이 열렸고, 다음 컷은 helper 추가가 아니라 route-local success branch integration이라는 점을 반영했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-transactionStore.test.ts`
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/service/transactionStore.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts tests/planning-v3-transactionStore.test.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-verified-success-response-shell-helper-bootstrap.md`
- 미실행:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- current `/account` route는 same-id coexistence에서 여전히 explicit guard 상태라, 이번 helper가 실제 success response로 연결되지는 않았다.
- `verified-success-candidate`도 아직 internal candidate일 뿐이며 actual success closeout과 user-facing success semantics는 `[검증 필요]`다.
- `[검증 필요]` visible binding은 target `accountId`로 보이는데 legacy `updatedTransactionCount`가 `0`인 edge case를 success copy에서 어떻게 설명할지는 후속 route integration에서 다시 닫아야 한다.
