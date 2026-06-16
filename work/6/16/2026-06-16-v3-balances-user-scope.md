# 2026-06-16 v3 balances user scope

## 변경 파일
- `src/app/api/planning/v3/balances/monthly/route.ts`
- `src/app/api/planning/v3/transactions/batches/import-csv/route.ts`
- `src/lib/planning/v3/store/batchesStore.ts`
- `tests/planning-v3-balances-user-scope.test.ts`
- `work/6/16/2026-06-16-v3-balances-user-scope.md`

## 사용 skill
- `work-artifact-intake`: 오늘 `/work` 기록과 원본 dirty 상태를 대조해 balances/monthly 사용자 범위 후보를 분리했습니다.
- `planning-gate-selector`: Planning v3 App Router API route, batch store namespace, auth/user scope 변경에 맞는 검증 세트를 골랐습니다.
- `planning-v3-batch-contract-narrowing`: balances/monthly 표면의 기존 stored-first 계산 payload를 유지하고 scope 경계만 좁혔습니다.
- `verification-failure-followthrough`: balances user-scope 테스트 실패를 route scope, batch store namespace, import route scope 순서로 좁혀 재검증했습니다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과, 남은 리스크, 다음 라운드 후보를 종료 기록으로 남겼습니다.

## 변경 이유
- monthly balances route의 저장소 조회가 인증 사용자 scope 안에서 실행되어야 cross-user batch 조회를 404로 막을 수 있습니다.
- batch import route가 사용자 scope 없이 batch를 쓰면 balances route가 사용자 namespace를 읽어도 자기 batch를 찾지 못합니다.
- `batchesStore`가 공용 `planning-v3/batches` 경로를 쓰면 namespace enabled 환경에서 batch transaction 파일이 사용자별로 분리되지 않습니다.

## 핵심 변경
- monthly balances GET route를 `withPlanningRouteUser` callback 안에서 실행하고 `INPUT`/`NO_DATA`/`INTERNAL` 응답에 인증 사용자 meta를 붙였습니다.
- transaction batch import-csv POST route를 `withPlanningRouteUser` callback 안에서 실행하고 인증 이후 import 오류 응답에 meta를 붙였습니다.
- `batchesStore` 기본 root를 `resolvePlanningV3DataDir(cwd)/batches`로 바꿔 namespace enabled 환경의 사용자별 batch 저장소를 따르게 했습니다.
- Alice/Bob batch를 만든 뒤 cross-user monthly balances 404, owner monthly balances 200, missing `batchId` meta를 확인하는 테스트를 추가했습니다.

## 검증
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- FAIL: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-balances-user-scope.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batches-user-scope.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` - Bob이 Alice batch를 200으로 읽어 batch store namespace 보강이 필요했습니다.
- FAIL: 같은 테스트 재실행 - batch store만 namespace로 바꾼 뒤 Bob의 own batch가 404가 되어 import-csv route scope 보강이 필요했습니다.
- PASS: 같은 테스트 재실행 - 6개 파일, 45개 테스트 통과.
- PASS: `git diff --check -- src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/transactions/batches/import-csv/route.ts src/lib/planning/v3/store/batchesStore.ts tests/planning-v3-balances-user-scope.test.ts`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm lint`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build`
- PASS: closeout 파일 추가 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard`
- PASS: staging 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` 재실행. `latestWorkNoteTracking=tracked`를 확인했습니다.

## 남은 리스크
- transaction batch list/detail/delete route 전체 사용자 범위는 이번 PR에 포함하지 않았습니다. 별도 `transactions/batches` route-family PR로 분리해야 합니다.
- account mapping, category, transfer override store namespace는 이번 balances 흐름에서 직접 검증하지 않았습니다.
- 원본 dirty의 `monthlyBalancesProjection`/`loadBatchVisiblePipeline` helper refactor는 이번 PR에서 제외했습니다. helper 의존성은 별도 PR에서 좁혀야 합니다.
- 브라우저 e2e는 실행하지 않았습니다. 이번 변경은 API route와 file-store namespace 검증 중심입니다.

## 다음 라운드
- `transactions/batches` list/detail/delete route-family의 user-scope/meta와 batch store namespace 회귀를 다음 PR 후보로 검토합니다.
- balances helper refactor는 `monthlyBalancesProjection`과 `loadBatchVisiblePipeline` 의존성을 정리한 뒤 별도 PR 후보로 검토합니다.
- news, drafts, profile, transactions override 계열의 남은 인증 이후 오류 meta/user-scope 후보를 계속 작은 route-family 단위로 나눕니다.
