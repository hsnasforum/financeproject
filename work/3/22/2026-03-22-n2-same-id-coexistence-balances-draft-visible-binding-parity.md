# 2026-03-22 N2 same-id coexistence balances-draft visible binding parity

## 변경 파일
- `src/app/api/planning/v3/balances/monthly/route.ts`
- `src/app/api/planning/v3/draft/profile/route.ts`
- `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-balances-api.test.ts`
- `tests/planning-v3-draft-profile-api.test.ts`
- `tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- `work/3/22/2026-03-22-n2-same-id-coexistence-balances-draft-visible-binding-parity.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: balances/draft 계열 consumer가 same-id coexistence에서도 stored-first visible binding 의미를 유지하는지 좁게 확인하고, helper 설명과 회귀 테스트만 최소 범위로 보강했다.
- `planning-gate-selector`: route/service/test 변경에 맞춰 지정된 3개 테스트, `pnpm build`, `git diff --check`만 이번 라운드 최소 검증 세트로 골랐다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 parity 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- same-id coexistence reader-visible boundary는 detail/cashflow/summary 쪽에서 먼저 고정됐지만, `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch`는 coexistence 전용 regression coverage가 약했다.
- 이 consumer들은 이미 stored-first helper를 쓰고 있었지만, same-id stored-meta + legacy coexistence에서 visible result가 정말 stored-first binding을 따르는지 test 이름과 assert 기준으로 더 명시할 필요가 있었다.
- 이번 라운드는 dual-write나 writer merge 없이 read-side consumer parity만 좁게 다루는 것이 목표였다.

## 핵심 변경
- `applyStoredFirstBatchAccountBinding()`에 balances/draft 계열도 same-id coexistence에서 stored-first visible binding view를 재사용한다는 주석을 추가했다.
- `balances/monthly`, `draft/profile`, `generateDraftPatchFromBatch.ts`에 route/service-local comment를 보강해 user-facing aggregate는 stored-first binding view를 읽고, command-side coexistence writer는 여전히 미확정이라는 경계를 더 읽히게 했다.
- `tests/planning-v3-balances-api.test.ts`에는 same-id coexistence에서 stored meta account가 legacy account와 달라도, `omitRowAccountId` stored shadow batch가 stored-first binding을 따라 `accountId`와 `closingKrw`를 계산하는 회귀 테스트를 추가했다.
- `tests/planning-v3-draft-profile-api.test.ts`에는 same-id coexistence + `omitRowAccountId` stored shadow batch에서 draft profile route가 stored-first batch view를 읽어 patch를 계산하는 회귀 테스트를 추가했다.
- `tests/planning-v3-generateDraftPatchFromBatch.test.ts`에는 same-id coexistence + `omitRowAccountId` stored shadow batch에서도 `generateDraftPatchFromBatch()`가 stored-first binding view를 읽고 `unassignedCount`를 `0`으로 유지하는 회귀 테스트를 추가했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts`
  - `pnpm build`
  - `git diff --check -- src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/draft/profile/route.ts src/lib/planning/v3/service/generateDraftPatchFromBatch.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-batches-api.test.ts work/3/22/2026-03-22-n2-same-id-coexistence-balances-draft-visible-binding-parity.md`
- 미실행 검증:
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 balances/draft 계열 consumer parity만 고정했고, same-id coexistence writer 자체를 열거나 dual-write contract를 정의하지 않았다.
- `draft/profile`은 accountId를 직접 노출하지 않는 aggregate surface라 stored-first binding은 helper 사용과 stored-first batch view regression으로만 간접 고정했다.
- detail/cashflow/summary 외 다른 downstream consumer, legacy migration, mirror write, row rewrite, index repair는 여전히 후속 범위다.
