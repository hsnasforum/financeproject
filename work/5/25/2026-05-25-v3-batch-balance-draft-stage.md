# 2026-05-25 v3 batch balance draft stage

## 변경 파일
- `src/app/planning/v3/balances/_components/BalancesClient.tsx`
- `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`
- `src/lib/planning/v3/service/transactionStore.ts`
- `tests/planning-v3-draft-create-profile-api.test.ts`
- `tests/planning-v3-draft-preview-api.test.ts`
- `tests/planning-v3-drafts-remote-host-api.test.ts`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: balances/batch center와 draft payload fixture가 저장 우선, raw/derived payload 경계를 침범하지 않는지 확인하는 데 사용.
- `planning-gate-selector`: v3 page component, draft API fixture, batch/balances 계약에 맞는 focused test와 build 검증을 고르는 데 사용.
- `work-log-closeout`: 실제 실행 검증과 남은 리스크를 stage 단위로 기록하는 데 사용.

## 변경 이유
- balances와 batch center 화면의 framer-motion 의존을 제거하면서 기존 selector, 링크, 표 구조를 유지해야 했다.
- draft 관련 테스트 fixture가 현재 `createDraft` 입력 계약인 `source/meta/payload` 경계를 따르도록 보정해야 했다.
- transaction store의 same-id coexistence helper에서 의도적으로 쓰지 않는 입력을 명시해 lint/typecheck 계약을 안정화할 필요가 있었다.

## 핵심 변경
- balances, batch center client에서 motion wrapper를 일반 HTML 구조와 CSS transition hover로 대체했다.
- draft create/preview/remote-host 테스트 fixture를 top-level `cashflow/draftPatch` 대신 `payload` 내부 구조로 정렬했다.
- draft fixture의 `rows`는 `meta.rows`에 두고, public draft patch에는 실제 프로필 적용 필드만 남겼다.
- `toSameIdCoexistenceUserFacingInternalFailure`의 미사용 입력을 `void _input`으로 명시했다.

## 검증
- PASS: `git diff --check -- src/app/planning/v3/balances/_components/BalancesClient.tsx src/app/planning/v3/batches/_components/BatchesCenterClient.tsx src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts`
- PASS: `corepack pnpm exec eslint src/app/planning/v3/balances/_components/BalancesClient.tsx src/app/planning/v3/batches/_components/BatchesCenterClient.tsx src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts`
- PASS: `corepack pnpm test tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-batch-center-api.test.ts`
- PASS: `corepack pnpm build`

## 남은 리스크
- 이 stage는 `/planning/v3/balances`와 `/planning/v3/batches`의 visual motion 제거 및 draft fixture 정합성에 한정했다.
- `tests/planning-v3-write-route-guards.test.ts`의 news refresh runtime probe 변경은 news/DART stage로 분리했다.
- news clients, OpenDart status, scripts/docs 변경은 아직 별도 stage로 남아 있다.
