# 2026-03-12 planning-v3 transactions accounts remote-host contract closeout

## 변경 파일
- `tests/planning-v3-user-facing-remote-host-api.test.ts`
- `tests/planning-v3-accounts-write-remote-host-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 `planning-v3 transactions/accounts user-facing remote-host 계약` 테스트 배치로 좁히고, `vitest + eslint + git diff --check + multi-agent:guard`만 실행하도록 검증 범위를 고르는 데 사용
- `work-log-closeout`: 실제 테스트 추가 범위와 실행한 검증만 `/work` 형식으로 정리하는 데 사용

## 변경 이유
- 최신 `planning-v3 news data-root isolation` closeout 이후 `transactions/accounts` 축을 다시 스캔한 결과, 실제 caller 기준으로 남아 있던 공백은 세 갈래였습니다.
- `tests/planning-v3-user-facing-remote-host-api.test.ts`는 `transactions/batches`, `categorized`, `cashflow`, `balances/monthly`의 same-origin remote-host 성공 쪽만 확인하고 있었고, cross-origin 차단 회귀는 별도 테스트로 고정돼 있지 않았습니다.
- `AccountsClient`가 직접 쓰는 `POST /api/planning/v3/accounts`, `PATCH|DELETE /api/planning/v3/accounts/[id]`, `PATCH /api/planning/v3/opening-balances`는 runtime guard smoke 외에 remote-host happy-path/cross-origin 계약이 따로 없었습니다.
- 추가로 `TransactionBatchDetailClient`와 `TransactionsBatchListClient`가 쓰는 `GET /api/planning/v3/transactions/batches/[id]`, `POST /api/planning/v3/transactions/import/csv`도 dedicated remote-host 계약 파일엔 빠져 있었습니다.

## 핵심 변경
- `tests/planning-v3-user-facing-remote-host-api.test.ts`에 `EVIL_ORIGIN`, `requestCrossOrigin`, `requestCrossOriginJson`, `expectOriginMismatch` 헬퍼를 추가했습니다.
- 아래 GET route들에 대해 cross-origin이면 `ORIGIN_MISMATCH`로 막히는지 별도 테스트를 추가했습니다.
  - `/api/planning/v3/transactions/batches`
  - `/api/planning/v3/transactions/batches/[id]`
  - `/api/planning/v3/transactions/batches/[id]/categorized`
  - `/api/planning/v3/transactions/batches/[id]/cashflow`
  - `/api/planning/v3/balances/monthly`
- 같은 파일의 same-origin 성공 경로도 아래 실제 caller까지 넓혔습니다.
  - `GET /api/planning/v3/transactions/batches/[id]`
  - `POST /api/planning/v3/transactions/import/csv`
- `tests/planning-v3-accounts-write-remote-host-api.test.ts`를 추가해 아래 write route가 same-origin remote host에서는 실제 성공하고 cross-origin은 `ORIGIN_MISMATCH`로 막히는지 고정했습니다.
  - `POST /api/planning/v3/accounts`
  - `PATCH /api/planning/v3/accounts/[id]`
  - `DELETE /api/planning/v3/accounts/[id]`
  - `PATCH /api/planning/v3/opening-balances`
- `tests/planning-v3-write-route-guards.test.ts`의 runtime target에도 `accounts/[id] PATCH`, `accounts/[id] DELETE`, `opening-balances PATCH`, `transactions/import/csv POST`를 추가해 user-facing write route inventory 누락을 줄였습니다.
- 중간 재검증에서 `transactions/import/csv` cross-origin 케이스가 `403`이 아니라 `400`으로 보였는데, route drift가 아니라 테스트 헬퍼 인자 순서 오류였고 `requestCrossOriginJson` 분리 후 PASS로 정리했습니다.

## 검증
- `pnpm test tests/planning-v3-user-facing-remote-host-api.test.ts`
  - PASS
- `pnpm exec eslint tests/planning-v3-user-facing-remote-host-api.test.ts`
  - PASS
- `git diff --check -- tests/planning-v3-user-facing-remote-host-api.test.ts`
  - PASS
- `pnpm multi-agent:guard`
  - PASS
- `pnpm test tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - PASS
- `pnpm exec eslint tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - PASS
- `pnpm test tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - 1차 FAIL: `transactions/import/csv` cross-origin 케이스가 route 문제처럼 보였지만, 실제로는 테스트 헬퍼 인자 순서 오류로 body가 잘못 들어가 `400`이 발생
  - 헬퍼 수정 후 PASS
- `pnpm exec eslint tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - PASS
- `git diff --check -- tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts work/3/12/2026-03-12-planning-v3-transactions-balances-cross-origin-contract-closeout.md`
  - PASS
- `pnpm multi-agent:guard`
  - PASS

## 남은 리스크
- 이번 라운드 범위의 `planning-v3 transactions/accounts remote-host contract` blocker는 없습니다.
- 이번 배치는 테스트-only라서 `pnpm build`, `pnpm e2e:rc`는 재실행하지 않았습니다.
- `transactions/accounts` 축에서는 실제 caller 기준 핵심 remote-host 계약 공백이 크게 줄었지만, 아직 `transactions/overrides`, `transactions/batches/merge`, `transactions/batches/[id]/transfers`는 internal-only 유지 계약이고 user-facing 연동이 생기면 재검토가 필요합니다.
- 더 큰 남은 일은 route contract가 아니라 `planning-v3` 전체 dirty bucket을 `transactions/accounts`, `draft/profile`, `news/indicators`처럼 계속 잘게 분리하는 운영 작업입니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
