# 2026-06-16 v3 accounts user scope

## 변경 파일
- `src/app/api/planning/v3/accounts/route.ts`
- `src/app/api/planning/v3/accounts/[id]/route.ts`
- `tests/planning-v3-accounts-user-scope.test.ts`
- `work/6/16/2026-06-16-v3-accounts-user-scope.md`

## 사용 skill
- `work-artifact-intake`: 오늘 `/work` 기록과 현재 worktree 상태를 대조해 accounts CRUD 사용자 범위 후보를 분리했습니다.
- `planning-gate-selector`: Planning v3 App Router API route 변경에 맞춰 전용 테스트, lint, build, guard 검증 세트를 골랐습니다.
- `verification-failure-followthrough`: 첫 `pnpm build` 타임아웃을 미확정 결과로 분리하고 프로세스 종료 확인 후 같은 gate를 재실행했습니다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과, 남은 리스크를 종료 기록으로 남겼습니다.

## 변경 이유
- `/api/planning/v3/accounts` list/create와 `/api/planning/v3/accounts/[id]` update/delete가 사용자별 저장소 scope 안에서 실행되어야 합니다.
- cross-user account id로 update/delete를 호출해도 다른 사용자의 계좌가 노출되거나 변경되면 안 됩니다.
- 인증 이후 발생하는 `INPUT`, `NO_DATA`, `INTERNAL` 응답은 사용자 확인에 필요한 `meta.userId`, `meta.authSource`를 유지해야 합니다.

## 핵심 변경
- accounts GET/POST route를 `withPlanningRouteUser` callback 안에서 저장소 접근을 수행하도록 감쌌습니다.
- accounts PATCH/DELETE route도 같은 callback 구조로 정리해 요청 단위 사용자 scope를 유지했습니다.
- 인증 이후 accounts 에러 응답에 `planningUserMeta` 기반 meta를 붙였습니다.
- Alice/Bob 계좌 list 격리, cross-user update/delete 404, invalid create/patch/delete meta를 확인하는 테스트를 추가했습니다.

## 검증
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-accounts-user-scope.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-accounts-starting-balance-user-scope.test.ts tests/planning-v3-opening-balances-user-scope.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS: `git diff --check -- src/app/api/planning/v3/accounts/route.ts "src/app/api/planning/v3/accounts/[id]/route.ts" tests/planning-v3-accounts-user-scope.test.ts`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm lint`
- TIMEOUT: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build` at 180s. 자식 `next build --webpack` 프로세스가 뒤에서 계속 실행 중이어서 결과 미확정으로 처리했습니다.
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build` with 600s timeout.
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard`
- FAIL: closeout 파일 추가 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` 재실행. 최신 work note에 `다음 라운드` 섹션이 없어 실패했습니다.
- PASS: `다음 라운드` 섹션 추가 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard`
- PASS: staging 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` 재실행. `latestWorkNoteTracking=tracked`를 확인했습니다.

## 남은 리스크
- 이번 라운드는 accounts CRUD API route 범위만 분리했으며, 원본 worktree의 나머지 dirty 항목은 계속 PR 단위 분리가 필요합니다.
- 안정적인 500 재현 테스트는 추가하지 않았고, 인증 후 `INTERNAL` 응답 envelope 유지 구현으로만 보강했습니다.
- 사용자 화면 e2e는 실행하지 않았습니다. 이번 변경은 route/store 사용자 scope와 에러 meta에 집중한 API 단위 변경입니다.

## 다음 라운드
- Planning v3 balances/monthly 또는 journal route user-scope 묶음을 다음 PR 후보로 검토합니다.
- batches, drafts, transactions 계열 store namespace 변경은 기능별 테스트와 함께 별도 PR로 나눕니다.
- products/recommend, ops, data/docs 변경은 Planning v3 user-scope 묶음 이후 별도 후보로 다시 분류합니다.
