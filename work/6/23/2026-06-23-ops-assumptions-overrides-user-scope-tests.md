# 2026-06-23 Ops Assumptions Overrides User Scope Tests

## 변경 파일
- `tests/planning/ops/ops-assumptions-overrides-route-user-scope.test.ts`
- `work/6/23/2026-06-23-ops-assumptions-overrides-user-scope-tests.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 흐름과 Finance Project 조건부 skill 조합을 확인했습니다.
- `planning-gate-selector`: route/auth/user-scope 변경에 맞는 최소 검증과 확장 게이트를 골랐습니다.
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크 형식의 종료 기록을 작성하는 데 사용했습니다.

## 사용 에이전트
- `manager`: 작업을 계약 감사, route 런타임 테스트, service boundary, current-user namespace, 검증/closeout 단계로 분해했습니다.
- `gpt-5.3-codex-spark explorer`: `ops/assumptions/overrides`와 `/reset` route의 success meta, auth-required service 미호출, reset 계약 공백을 정적 조사했습니다.

## 변경 이유
- `/api/ops/assumptions/overrides`와 `/api/ops/assumptions/overrides/reset` route는 이미 `requirePlanningRouteUser`, `assumptionsUserMeta`, `overridesRouteService` 경계를 사용하고 있었습니다.
- 다만 endpoint 전용 런타임 테스트가 부족해 성공 응답의 `meta.userId/authSource`, `PLANNING_AUTH_REQUIRED=1`일 때 service 미호출, `DELETE`와 `/reset` reset 응답 계약이 회귀에 취약했습니다.

## 핵심 변경
- GET 성공 응답이 현재 planning user meta와 service 결과를 유지하는지 고정했습니다.
- PUT과 legacy POST alias가 동일한 replace service와 현재 planning user meta를 쓰는지 고정했습니다.
- PATCH 성공 응답, DELETE reset, `/overrides/reset` POST 응답의 현재 planning user meta와 reset service 호출 계약을 고정했습니다.
- auth-required 상태에서 GET, PUT, POST alias, PATCH, DELETE, `/reset` POST가 401로 막히고 service를 호출하지 않는지 고정했습니다.
- service error에 secret-like 문자열이 있어도 응답 error message에 노출되지 않는지 확인했습니다.

## 검증
- PASS: `corepack pnpm vitest run tests/planning/ops/ops-assumptions-overrides-route-user-scope.test.ts tests/planning-v2-api/assumptions-overrides-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/middleware-security.test.ts` — 4 files, 64 tests.
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:ssot:check` — route SSOT 5 files, 9 tests.
- PASS: `corepack pnpm test` — 720 files, 2315 tests.
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm verify` — `validate:dumps` ok, schema drift breaking 0, freshness total 8/fresh 0/stale 8, DART rules gate PASS, 720 files/2315 tests.

## 정리
- `pnpm verify`가 재생성한 `docs/schema-drift-report.md`, `docs/data-freshness-report.md`, `docs/dart-rules-quality-report.md`는 이번 범위 밖 생성물이므로 원상 복구했습니다.
- UI/selector 변경은 없어 `pnpm e2e:rc`는 실행하지 않았습니다.

## 남은 리스크
- 이번 변경은 코드 동작을 바꾸지 않고 route 계약 테스트만 추가했습니다.
- freshness snapshot 8개 stale 상태는 기존 운영 데이터 이슈로 남아 있으며 이번 범위에서는 해소하지 않았습니다.

## 다음 라운드 우선순위
- ops/data freshness stale 8개를 `daily:refresh:strict` 또는 source별 smoke evidence로 해소합니다.
- auth/user-scope 표준화 후보 route 5개의 `withCurrentPlanningUser` 직접 사용을 routeAuth 계층으로 옮깁니다.
