# 2026-06-22 Planning user scope stability guard

## 변경 파일
- `src/lib/planning/store/userScope.ts`
- `tests/planning/store/planningStoreNamespace.test.ts`
- `work/6/22/2026-06-22-planning-user-scope-stability-guard.md`

## 사용 skill
- `finance-skill-routing`: 보안/Auth 이후 사용자 소유권 경계 라운드로 planning user scope 안정성을 선택했습니다.
- `planning-gate-selector`: 공유 storage scope helper 변경에 맞춰 namespace/auth targeted vitest, lint, typecheck, diff check를 선택했습니다.
- `work-log-closeout`: 실제 변경 범위와 검증 결과를 종료 기록으로 남깁니다.

## 변경 이유
- `.data/planning/users/{userId}` ownership 경계는 요청 진입 시점의 current user에 고정되어야 합니다.
- AsyncLocalStorage에 원본 scope 객체를 그대로 저장하면, callback 안팎에서 같은 객체가 mutate될 때 저장소 owner가 흔들릴 수 있습니다.
- routeAuth와 pageAuth가 넘기는 current-user scope를 저장소 계층에서 한 번 더 안정화해 route/service/repository 경계를 단단히 합니다.

## 핵심 변경
- `PlanningUserScope`를 읽기 전용 타입으로 바꾸고 scope 진입 시점에 복사본을 생성합니다.
- `runWithPlanningUserScope`와 `enterPlanningUserScope`가 freeze된 snapshot만 AsyncLocalStorage에 저장하게 했습니다.
- 원본 scope 객체를 `alice`에서 `bob`으로 mutate해도 profile write가 `alice` namespace에만 남는 회귀 테스트를 추가했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/store/planningStoreNamespace.test.ts` (1 file, 2 tests)
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/routeAuth.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/currentUserAuthSession.test.ts` (3 files, 30 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `git diff --check`

## 남은 리스크
- 이번 라운드는 in-process AsyncLocalStorage scope 안정화입니다.
- route handler 내부의 파일/DB 직접 접근을 service/repository로 옮기는 작업은 아직 남아 있습니다.

## 다음 라운드
- planning route repository imports와 ops user-owned storage route의 service boundary를 더 좁힙니다.
- `.data/planning/users/{userId}` namespace와 PostgreSQL `userId` mapper 경계를 한 단계 더 연결합니다.
