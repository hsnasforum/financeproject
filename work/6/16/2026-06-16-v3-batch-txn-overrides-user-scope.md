# 2026-06-16 v3 batch txn-overrides user scope

## 변경 파일
- `src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts`
- `src/lib/planning/v3/store/txnOverridesStore.ts`
- `tests/planning-v3-batch-txn-overrides-user-scope.test.ts`
- `work/6/16/2026-06-16-v3-batch-txn-overrides-user-scope.md`

## 사용 skill
- `work-artifact-intake`: PR #31 merge 이후 최신 `/work` 기록과 원본 dirty diff를 대조해 `batch txn-overrides` route-family로 범위를 좁혔습니다.
- `planning-gate-selector`: Planning v3 App Router API route, override store namespace, categorized/cashflow 소비자 영향에 맞는 검증 세트를 골랐습니다.
- `planning-v3-batch-contract-narrowing`: batch override helper의 legacy fallback은 유지하고 기본 저장 경로와 route scope 경계만 좁혔습니다.
- `verification-failure-followthrough`: user-scope 테스트 실패를 route callback scope 누락으로 좁혀 수정하고 같은 테스트를 먼저 재실행했습니다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과, 남은 리스크, 다음 라운드 후보를 종료 기록으로 남겼습니다.

## 변경 이유
- batch transaction override 저장소가 공용 `planning-v3/txn-overrides` 경로를 쓰면 같은 batchId/txnId의 사용자별 override가 서로 덮어써질 수 있습니다.
- route에서 인증 사용자만 확인하고 store 호출을 user-scope callback 밖에서 실행하면 namespace context가 적용되지 않습니다.
- 인증 이후 `INPUT`/`INTERNAL` 오류 응답에는 실제 인증 사용자 meta를 유지해야 후속 UI와 운영 로그가 같은 기준으로 판단할 수 있습니다.

## 핵심 변경
- `txnOverridesStore`의 기본 batch override 경로를 `resolvePlanningV3DataDir(cwd)/txn-overrides`로 바꿔 namespace enabled 환경에서 사용자별 저장소를 따르게 했습니다.
- legacy compat path는 `resolvePlanningV3LegacyDataDir(cwd)/txn-overrides.json`으로 명시해 기존 fallback 경계를 유지했습니다.
- batch txn-overrides GET/POST route의 store 호출을 `withPlanningRouteUser` callback 안에서 실행하고 인증 이후 오류 응답에 meta를 붙였습니다.
- Alice/Bob override fixture로 같은 batchId/txnId가 사용자별로 격리되는지와 invalid 입력 meta를 검증하는 테스트를 추가했습니다.

## 검증
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- PASS: `git diff --check -- src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts src/lib/planning/v3/store/txnOverridesStore.ts tests/planning-v3-batch-txn-overrides-user-scope.test.ts`
- FAIL: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-batch-txn-overrides-user-scope.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-txnOverridesStore.test.ts tests/planning-v3-txnOverridesBatchStore.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` - Alice가 Bob override를 읽어 route store 호출이 user-scope callback 안에 있어야 함을 확인했습니다.
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-batch-txn-overrides-user-scope.test.ts` - 1개 파일, 2개 테스트 통과.
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-batch-txn-overrides-user-scope.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-txnOverridesStore.test.ts tests/planning-v3-txnOverridesBatchStore.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` - 8개 파일, 26개 테스트 통과.
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm lint`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build`
- PASS: closeout 파일 추가 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` - `latestWorkNoteTracking=untracked`를 확인했습니다.
- PASS: staging 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` 재실행. `latestWorkNoteTracking=tracked`를 확인했습니다.
- PASS: staging 후 `git diff --cached --check -- src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts src/lib/planning/v3/store/txnOverridesStore.ts tests/planning-v3-batch-txn-overrides-user-scope.test.ts work/6/16/2026-06-16-v3-batch-txn-overrides-user-scope.md`

## 남은 리스크
- `PLANNING_V3_TXN_OVERRIDES_DIR` 또는 `PLANNING_V3_TXN_OVERRIDES_PATH`를 명시한 운영 환경은 기존 override 경로 의미를 유지하므로 사용자 namespace 적용 대상에서 제외됩니다.
- `transactions/batches/[id]/categorized`, `cashflow`, `transfers`, `account` route-family의 user-scope/meta와 helper refactor는 이번 PR에 포함하지 않았습니다.
- 브라우저 e2e는 실행하지 않았습니다. 이번 변경은 API route와 file-store namespace 검증 중심입니다.

## 다음 라운드
- `categories/rules` route-family의 store namespace와 route meta/user-scope를 다음 작은 PR 후보로 검토합니다.
- `transactions/batches/[id]/categorized`/`cashflow`는 helper refactor가 섞여 있으므로 별도 contract narrowing PR로 분리합니다.
