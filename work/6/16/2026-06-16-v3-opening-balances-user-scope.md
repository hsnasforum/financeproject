# 2026-06-16 v3-opening-balances-user-scope

## 변경 파일
- `src/app/api/planning/v3/opening-balances/route.ts`
- `src/lib/planning/v3/store/dataDir.ts`
- `src/lib/planning/v3/store/openingBalancesStore.ts`
- `tests/planning-v3-opening-balances-user-scope.test.ts`
- `tests/planning-v3-openingBalancesStore.test.ts`
- `work/6/16/2026-06-16-v3-opening-balances-user-scope.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록에서 opening balances user scope 작업 흔적과 남은 PR 분리 범위를 확인했습니다.
- `planning-gate-selector`: Planning v3 App Router API route, store namespace, auth/user scope 변경에 맞는 검증 세트를 골랐습니다.
- `verification-failure-followthrough`: route/store namespace 테스트 실패를 store resolver 누락과 route async scope 누락으로 나눠 수정했습니다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과, 남은 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- `opening-balances` API route가 인증 사용자를 확인한 뒤에도 store 호출을 사용자 scope 안에서 실행하지 않아, Alice/Bob 요청이 같은 `opening-balances.json`을 공유할 수 있었습니다.
- `openingBalancesStore`가 기존 공용 `planning-v3` 디렉터리를 직접 사용해 namespace enabled 환경에서도 사용자별 경로로 분리되지 않았습니다.
- 입력 오류와 내부 오류 응답에는 인증 후 사용자 meta가 포함되어야 추적과 디버깅이 가능합니다.

## 핵심 변경
- `opening-balances` GET/PATCH route를 `withPlanningRouteUser` callback 안에서 실행해 store 접근이 authenticated planning user scope를 따르도록 했습니다.
- Planning v3 store용 `resolvePlanningV3DataDir` helper를 추가하고 `openingBalancesStore`가 사용자 namespace 경로를 사용하도록 바꿨습니다.
- store 단위와 route 단위에서 Alice/Bob opening balance가 분리되는 테스트를 추가했습니다.
- input error 응답에 `meta.userId`, `meta.authSource`가 포함되는지 확인했습니다.

## 검증
- FAIL `corepack pnpm exec vitest run tests/planning-v3-opening-balances-user-scope.test.ts tests/planning-v3-opening-balances-api.test.ts tests/planning-v3-openingBalancesStore.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
  - 실패 경계: `openingBalancesStore`가 공용 경로를 사용해 사용자별 파일이 생성되지 않았습니다.
- FAIL `corepack pnpm exec vitest run tests/planning-v3-opening-balances-user-scope.test.ts tests/planning-v3-opening-balances-api.test.ts tests/planning-v3-openingBalancesStore.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
  - 실패 경계: store는 분리됐지만 route에서 이전 사용자 scope가 남아 Alice GET이 Bob 데이터를 읽었습니다.
- PASS `corepack pnpm exec vitest run tests/planning-v3-opening-balances-user-scope.test.ts tests/planning-v3-opening-balances-api.test.ts tests/planning-v3-openingBalancesStore.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS `git diff --check`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm build`

## 남은 리스크
- 이번 PR은 `opening-balances` API와 store만 다룹니다. 다른 Planning v3 store의 namespace helper 적용은 남은 dirty 묶음에서 계속 분리해야 합니다.
- `accounts/[id]/starting-balance` route의 인증 후 `NO_DATA`, `INPUT`, `INTERNAL` meta gap은 다음 PR 후보입니다.
- 브라우저 e2e는 실행하지 않았습니다. 이번 변경은 API route와 file-store namespace 검증 중심입니다.

## 다음 라운드
- `accounts/[id]/starting-balance` user scope와 오류 meta 보강을 별도 PR로 분리합니다.
- Planning v3 accounts, batches, drafts, transactions 계열 store namespace 변경은 기능별 테스트와 함께 별도 PR로 나눕니다.
- 원본 dirty worktree의 products/recommend, ops, data/docs 변경은 Planning v3 user-scope 묶음 이후 별도 후보로 다시 분류합니다.
