# 2026-06-16 v3 journal user scope

## 변경 파일
- `planning/v3/journal/store.ts`
- `src/app/api/planning/v3/journal/entries/route.ts`
- `src/app/api/planning/v3/journal/entries/[id]/route.ts`
- `tests/planning-v3-journal-user-scope.test.ts`
- `work/6/16/2026-06-16-v3-journal-user-scope.md`

## 사용 skill
- `work-artifact-intake`: 오늘 `/work` 기록과 원본 dirty 상태를 대조해 journal route/store 사용자 범위 후보를 분리했습니다.
- `planning-gate-selector`: Planning v3 App Router API route와 저장소 namespace 변경에 맞는 전용 테스트, lint, build, guard 검증 세트를 골랐습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크, 다음 라운드 후보를 종료 기록으로 남겼습니다.

## 변경 이유
- journal route가 인증 사용자를 확인하더라도 저장소가 공용 `journal/entries` 경로를 사용하면 사용자별 저널 격리를 보장하기 어렵습니다.
- 인증 이후 `INPUT`/`NOT_FOUND` 응답에는 `meta.userId`, `meta.authSource`가 포함되어야 API 추적과 테스트가 명확합니다.
- 이전 원본 diff의 `requirePlanningRouteUser` 구조는 callback scope 밖 저장소 호출이 생길 수 있어, 이번 PR에서는 `withPlanningRouteUser` 구조로 정리했습니다.

## 핵심 변경
- `PLANNING_NAMESPACE_ENABLED=1`일 때 journal entries 저장 경로를 `users/{userId}/planning-v3/journal/entries` 아래로 분리했습니다.
- journal list/create/detail/update route의 저장소 접근을 `withPlanningRouteUser` callback 안에서 실행하도록 정리했습니다.
- journal create/update/detail의 인증 이후 오류 응답에 `planningUserMeta` 기반 meta를 붙였습니다.
- Alice/Bob 저널 목록·상세·수정 격리와 invalid input meta를 확인하는 user-scope 테스트를 추가했습니다.

## 검증
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-journal-user-scope.test.ts tests/planning-v3-journal-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS: `git diff --check -- planning/v3/journal/store.ts src/app/api/planning/v3/journal/entries/route.ts "src/app/api/planning/v3/journal/entries/[id]/route.ts" tests/planning-v3-journal-user-scope.test.ts`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm lint`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build`
- PASS: closeout 파일 추가 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard`
- PASS: staging 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` 재실행. `latestWorkNoteTracking=tracked`를 확인했습니다.

## 남은 리스크
- namespace 활성화 시 기존 공용 journal entry를 사용자 namespace로 자동 이관하지 않습니다. legacy data migration은 별도 마이그레이션 라운드에서 다뤄야 합니다.
- guard 실패처럼 인증 사용자 확정 전의 500 응답에는 meta를 붙이지 않았습니다.
- 이번 라운드는 API route와 저장소 namespace 검증 중심이라 브라우저 e2e는 실행하지 않았습니다.

## 다음 라운드
- Planning v3 balances/monthly는 `monthlyBalancesProjection`과 helper 의존성을 정리한 뒤 별도 PR 후보로 검토합니다.
- news, transactions, drafts, profile 계열의 남은 인증 이후 오류 meta/user-scope 후보를 계속 작은 route-family 단위로 나눕니다.
- products/recommend, ops, data/docs 변경은 Planning v3 user-scope 묶음 이후 별도 후보로 다시 분류합니다.
