# 2026-07-01 Planning route auth user scope

## 변경 파일
- `src/lib/planning/api/routeAuth.ts`
- `src/lib/planning/store/userScope.ts`
- `src/lib/planning/server/runs/createRunRouteAdapter.ts`
- `src/app/api/planning/**/route.ts`
- `src/app/api/ops/**/route.ts`
- `src/app/api/products/candidates/route.ts`
- `tests/planning/auth/routeAuth.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `tests/planning-v2-api/create-run-service-boundary.test.ts`
- `tests/planning-v3-news-user-scope.test.ts`
- `package.json`

## 사용 skill
- `planning-gate-selector`: route/auth/store 영향 범위에 맞는 검증 명령을 고르는 데 사용했습니다.
- `work-log-closeout`: 변경 후 `/work` 종료 기록 형식을 맞추는 데 사용했습니다.

## 변경 이유
- Planning API route에서 `requirePlanningRouteUser`/`isPlanningRouteUser` 직접 guard와 `enterPlanningUserScope` 기반 scope 주입이 섞여 있었습니다.
- route handler 실행 경계를 `withPlanningRouteUser` callback 하나로 통일해 요청별 user scope가 callback 수명 안에서만 유지되도록 했습니다.

## 핵심 변경
- `withPlanningRouteUser`가 인증 성공 시 `runWithPlanningUserScope` callback 안에서 handler를 실행하고, 인증 실패 시 표준 인증 오류 `Response`를 반환하도록 정리했습니다.
- `enterPlanningUserScope` export와 route 계층 사용을 제거했습니다.
- planning/ops/product 후보 route의 직접 guard 호출을 `withPlanningRouteUser` callback wrapper로 전환했습니다.
- legacy adapter와 ops backup route의 인증 실패 응답 장식은 mapper callback으로 보존했습니다.
- 병렬 요청 scope 격리 테스트와 route 계층 금지 패턴 coverage test를 보강했습니다.

## 검증
- `pnpm planning:user-scope:check`: PASS, 15 files / 88 tests
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `pnpm test`: PASS, 744 files / 2466 tests
- `pnpm build`: PASS
- `rg -n -e requirePlanningRouteUser -e isPlanningRouteUser -e enterPlanningUserScope -e withPlanningRouteUser src tests`: PASS, 전체 auth helper 사용처 재확인
- `rg -n -e requirePlanningRouteUser -e isPlanningRouteUser src/app/api src/lib/planning/server/runs/createRunRouteAdapter.ts`: PASS, 직접 route guard 잔존 없음
- `rg -n -e enterPlanningUserScope src/app/api src/lib/planning`: PASS, runtime scope enter 잔존 없음
- `git diff --check -- ...`: PASS

## 재시도한 실패
- `rg "requirePlanningRouteUser|isPlanningRouteUser|enterPlanningUserScope|withPlanningRouteUser" src tests` 형태의 PowerShell 경유 실행은 정규식 `|`가 셸 파이프로 분리되어 실패했습니다. 같은 검색을 `rg -e ...` 형식으로 재실행해 통과했습니다.
- 임시 codemod를 Node here-doc으로 실행하려던 시도는 PowerShell이 template literal의 `${}`를 먼저 해석해 실패했습니다. 임시 `.cjs` 파일을 `apply_patch`로 만들고 실행 후 삭제하는 방식으로 전환했습니다.

## 남은 리스크
- `requirePlanningRouteUser`와 `isPlanningRouteUser`는 호환성/단위 테스트 확인용 export로 남아 있습니다. route 계층 직접 사용은 coverage test로 막았습니다.
- legacy route/API 삭제는 이번 범위에서 제외했습니다. telemetry/access log와 실제 사용처 확인 전에는 삭제하지 않는다는 통합 Markdown 조건을 유지했습니다.
