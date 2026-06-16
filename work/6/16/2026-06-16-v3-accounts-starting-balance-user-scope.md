# 2026-06-16 v3-accounts-starting-balance-user-scope

## 변경 파일
- `src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts`
- `src/lib/planning/v3/store/accountsStore.ts`
- `tests/planning-v3-accounts-starting-balance-user-scope.test.ts`
- `work/6/16/2026-06-16-v3-accounts-starting-balance-user-scope.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록의 다음 라운드 후보인 `accounts/[id]/starting-balance` user scope/meta gap을 확인했습니다.
- `planning-gate-selector`: Planning v3 App Router API route, accounts store namespace, auth/user scope 변경에 맞는 검증 세트를 골랐습니다.
- `verification-failure-followthrough`: 직전 opening balances PR에서 확인한 route async scope 누수 패턴을 반영해 `withPlanningRouteUser` 구조로 적용했습니다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과, 남은 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- `accounts/[id]/starting-balance` route가 인증 사용자를 확인하더라도 store 호출이 사용자 scope 안에서 실행되지 않으면 사용자별 계좌 초기잔액이 섞일 수 있습니다.
- `accountsStore`가 공용 `planning-v3/accounts.json` 경로를 직접 사용해 namespace enabled 환경의 사용자별 accounts 저장소를 따르지 않았습니다.
- `NO_DATA`, `INPUT`, `INTERNAL` 오류 응답에는 인증 후 사용자 meta가 포함되어야 추적과 디버깅이 쉽습니다.

## 핵심 변경
- starting-balance GET/PATCH route를 `withPlanningRouteUser` callback 안에서 실행해 계좌 조회와 저장이 authenticated planning user scope를 따르도록 했습니다.
- `accountsStore`가 Planning v3 namespace-aware data dir helper를 사용하도록 바꿨습니다.
- Alice/Bob 계좌와 starting balance가 사용자별로 분리되는 route 테스트를 추가했습니다.
- missing account, missing value, invalid value, invalid id 오류 응답에 `meta.userId`, `meta.authSource`가 포함되는지 확인했습니다.

## 검증
- PASS `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- PASS `corepack pnpm exec vitest run tests/planning-v3-accounts-starting-balance-user-scope.test.ts tests/planning-v3-accounts-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-opening-balances-user-scope.test.ts tests/planning-v3-openingBalancesStore.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS `git diff --check`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm multi-agent:guard`
- PASS `corepack pnpm build`

## 남은 리스크
- 이번 PR은 accounts starting-balance route와 accounts store namespace만 다룹니다. 다른 Planning v3 route/store user-scope 변경은 아직 원본 dirty worktree에 남아 있습니다.
- 전체 accounts CRUD route의 인증 meta 표준화는 별도 범위입니다.
- 브라우저 e2e는 실행하지 않았습니다. 이번 변경은 API route와 file-store namespace 검증 중심입니다.

## 다음 라운드
- Planning v3 accounts CRUD route 또는 balances/monthly user-scope 묶음을 다음 PR 후보로 검토합니다.
- batches, drafts, transactions 계열 store namespace 변경은 기능별 테스트와 함께 별도 PR로 나눕니다.
- products/recommend, ops, data/docs 변경은 Planning v3 user-scope 묶음 이후 별도 후보로 다시 분류합니다.
