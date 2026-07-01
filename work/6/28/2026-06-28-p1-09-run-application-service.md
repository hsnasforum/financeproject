# 2026-06-28 P1-09 run application service

## 변경 파일
- `src/lib/planning/server/runs/createRunService.ts`
- `src/lib/planning/server/runs/createRunRouteAdapter.ts`
- `src/app/api/planning/v2/runs/route.ts`
- `src/app/api/planning/run/route.ts`
- `src/app/api/planning/v2/run/route.ts`
- `scripts/security_route_guard_scan.mjs`
- `scripts/planning_v2_route_guard_scan.mjs`
- `tests/planning-v2-api/create-run-service-boundary.test.ts`
- `tests/planning-v2-api/persistence-routes.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/28/2026-06-28-p1-09-run-application-service-plan.md`
- `work/6/28/2026-06-28-p1-09-run-application-service.md`

## 사용 skill
- `planning-gate-selector`: planning v2 route/application 경계 변경에 필요한 `planning:v2:complete`, `compat`, `regress`, `planning:auth:check`, lint/typecheck/build 검증 범위를 선택했습니다.
- `work-log-closeout`: `/work` 종료 기록의 필수 섹션과 실제 실행 결과 기록 기준을 확인했습니다.

## 변경 이유
- P1-09 기준 문서는 planning run 생성 유스케이스를 HTTP route에서 분리하고 `/api/planning/run`, `/api/planning/v2/run`, `/api/planning/v2/runs`가 route-to-route import 없이 같은 application service를 사용하도록 요구했습니다.
- 기존 `src/app/api/planning/v2/runs/route.ts`는 parser, legacy/new scenario adapter, assumptions, pipeline, artifact, persistence, audit/metrics, HTTP 응답 매핑을 한 파일에서 처리했습니다.
- alias route 2개는 auth 후 다른 route handler의 `POST`를 직접 import해 호출하고 있어 auth/CSRF 책임과 route 경계가 중복됐습니다.

## 핵심 변경
- `parseCreatePlanningRunCommand`와 `createPlanningRun`을 request-free application service로 분리하고, repository/assumptions/provider/clock/id/audit/metrics 의존성을 주입 가능하게 했습니다.
- `createRunRouteAdapter`를 추가해 JSON parse, same-origin/CSRF, route auth, user meta, service 결과의 HTTP 매핑만 담당하게 했습니다.
- `/api/planning/run`과 `/api/planning/v2/run`은 더 이상 `runs/route.ts`를 import하지 않고 공용 adapter로 위임합니다.
- audit/stage metrics 기록 실패는 run 생성 실패로 전파하지 않는 정책을 장애 주입 테스트로 고정했습니다.
- auth/security/v2 guard scanner가 허용된 공용 route adapter 위임을 따라 guard와 metadata-bearing target을 확인하도록 갱신했습니다.

## 검증
- 선행 실패: `corepack pnpm test tests/planning-v2-api/create-run-service-boundary.test.ts`가 구현 전 2개 테스트 실패(route-to-route import 존재, service 파일 없음).
- 선행 실패: `corepack pnpm planning:auth:check`가 auth coverage 5개 실패(alias route가 routeAuth/userMeta proxy로 인식되지 않음).
- 선행 실패: `corepack pnpm planning:v2:complete`가 2회 실패했습니다. 1회차는 `sec:scan:routes`의 public mutation policy 미인식, 2회차는 `planning:v2:scan:guards`의 request guard 미인식이었습니다.
- 통과: `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
- 통과: `corepack pnpm test tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning-v2-api/run-route.test.ts` (14개 테스트, audit/metrics 장애 주입 포함)
- 통과: `corepack pnpm planning:auth:check`
- 통과: `node scripts/security_route_guard_scan.mjs`
- 통과: `node scripts/planning_v2_route_guard_scan.mjs`
- 통과: `corepack pnpm planning:v2:complete` (fast e2e 6개 포함)
- 통과: `corepack pnpm planning:v2:compat`
- 통과: `corepack pnpm planning:v2:regress` (regression case 9개, full e2e 8개 포함)
- 통과: `corepack pnpm lint`
- 통과: `corepack pnpm typecheck`
- 통과: `git diff --check`
- 통과: `corepack pnpm build`

## 남은 리스크
- scanner의 adapter 위임 인식은 현재 `handleCreatePlanningRunPost`에 한정된 명시 allowlist 방식입니다. 새 공용 route adapter가 추가되면 같은 scanner allowlist와 auth coverage를 함께 갱신해야 합니다.
- route/security 검증 정책 스크립트는 변경했지만 별도 docs 갱신은 하지 않았습니다. 현재 운영 계약은 gate 스크립트와 테스트에만 고정되어 있습니다.
- migration, rollback, quarantine 대상 데이터는 이번 P1-09 범위에서 새로 만들거나 변경하지 않았습니다.
