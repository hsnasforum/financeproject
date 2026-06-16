# 2026-06-16 v3 transactions batches user scope

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-transactions-batches-user-scope.test.ts`
- `work/6/16/2026-06-16-v3-transactions-batches-user-scope.md`

## 사용 skill
- `work-artifact-intake`: 오늘 `/work` 기록과 직전 balances PR의 남은 리스크를 확인해 `transactions/batches` route-family로 범위를 좁혔습니다.
- `planning-gate-selector`: Planning v3 App Router API route, auth/user scope, batch-family 회귀에 맞는 검증 세트를 골랐습니다.
- `planning-v3-batch-contract-narrowing`: transaction batch list/detail/delete의 기존 stored-first payload와 public metadata 계약을 유지하고 scope 경계만 좁혔습니다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과, 남은 리스크, 다음 라운드 후보를 종료 기록으로 남겼습니다.

## 변경 이유
- transaction batch 목록과 상세 조회가 인증 사용자 scope 안에서 실행되어야 다른 사용자의 batch가 목록이나 상세 응답에 노출되지 않습니다.
- batch 삭제도 인증 사용자 namespace 안에서 실행되어야 cross-user delete가 404로 막힙니다.
- 인증 이후 `NO_DATA`, `INPUT`, `INTERNAL` 오류 응답에는 실제 인증 사용자 meta를 유지해야 후속 UI와 운영 로그가 같은 기준으로 판단할 수 있습니다.

## 핵심 변경
- transaction batch list GET route를 `withPlanningRouteUser` callback 안에서 실행하고 `INTERNAL` 응답에 인증 사용자 meta를 붙였습니다.
- transaction batch detail GET route를 `withPlanningRouteUser` callback 안에서 실행하고 route id를 `sanitizeRecordId`로 정규화했습니다.
- transaction batch DELETE route를 `withPlanningRouteUser` callback 안에서 실행하고 삭제 전 surface 검사와 실제 삭제가 같은 사용자 namespace를 쓰도록 맞췄습니다.
- Alice/Bob fixture로 list 격리, cross-user detail/delete 404, owner detail 200, invalid id 400 meta를 검증하는 테스트를 추가했습니다.

## 검증
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- PASS: `git diff --check -- src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts tests/planning-v3-transactions-batches-user-scope.test.ts`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-transactions-batches-user-scope.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batches-user-scope.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-categorized-api.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` - 6개 파일, 47개 테스트 통과.
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm lint`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build`
- PASS: closeout 파일 추가 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` - `latestWorkNoteTracking=untracked`를 확인했습니다.
- PASS: staging 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` 재실행. `latestWorkNoteTracking=tracked`를 확인했습니다.
- PASS: staging 후 `git diff --cached --check -- src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts tests/planning-v3-transactions-batches-user-scope.test.ts work/6/16/2026-06-16-v3-transactions-batches-user-scope.md`

## 남은 리스크
- 원본 dirty의 `transactionBatchListRows`, `storedFirstVisibleRows`, `storedBatchCommandSurface` 등 helper refactor는 이번 PR에서 제외했습니다.
- `transactions/batches/[id]/summary`, `categorized`, `cashflow`, `txn-overrides` route-family의 사용자 scope/meta는 별도 PR로 계속 분리해야 합니다.
- `PLANNING_V3_TRANSACTIONS_DIR` 또는 명시적 path override 운영 계약은 이번 PR에서 다시 검토하지 않았습니다.
- 브라우저 e2e는 실행하지 않았습니다. 이번 변경은 API route와 file-store namespace 검증 중심입니다.

## 다음 라운드
- `batches/[id]/summary` 또는 `transactions/batches/[id]/categorized`/`cashflow`의 user-scope/meta를 다음 PR 후보로 검토합니다.
- transaction override, category/rule, profile/draft 계열의 남은 인증 이후 오류 meta/user-scope 후보를 계속 route-family 단위로 나눕니다.
