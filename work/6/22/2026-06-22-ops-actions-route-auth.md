# 2026-06-22 ops actions routeAuth 정리

## 변경 파일
- `package.json`
- `docs/current-screens.md`
- `src/app/api/ops/actions/preview/route.ts`
- `src/app/api/ops/actions/run/route.ts`
- `tests/planning/auth/authConfigContract.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `tests/planning/ops/actions-preview-route.test.ts`
- `tests/planning/ops/actions-run-route.test.ts`
- `work/6/22/2026-06-22-ops-actions-route-auth.md`

## 사용 skill
- finance-skill-routing: 최신 `/work` 기준으로 Auth/User Scope 라운드에 필요한 기본 skill 조합을 확인했습니다.
- planning-gate-selector: ops API route, auth gate, docs/current-screens 변경에 맞춰 targeted test, auth check, route guard, lint, build 검증을 선정했습니다.
- route-ssot-check: `docs/current-screens.md` API 노출 규칙 변경 후 실제 route 존재와 current-screens guard 필요성을 확인했습니다.
- work-log-closeout: 실제 변경 파일, 검증 결과, 남은 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- `/api/ops/actions/preview`와 `/api/ops/actions/run`은 `ops/actions/registry`를 통해 planning runs cleanup, repair, migration 같은 사용자 소유 planning 작업에 닿지만, 기존 current-user scope coverage는 registry 경유 route를 user-owned ops route로 분류하지 못했습니다.
- 해당 action route도 dev/local unlock과 CSRF만으로는 부족하며, routeAuth current-user scope와 `meta.userId/authSource` 성공 응답 계약에 들어와야 합니다.

## 핵심 변경
- ops action preview/run route에 `requirePlanningRouteUser`와 `isPlanningRouteUser` guard를 추가했습니다.
- preview/run 성공 응답에 `planningUserMeta(currentUser)` 기반 `meta.userId/authSource`를 추가했습니다.
- route coverage가 `ops/actions/registry` import route를 user-owned planning storage route로 분류하도록 보강했습니다.
- preview/run route 테스트에 auth required 401 차단과 local fallback meta 검증을 추가했습니다.
- `planning:auth:check`에 ops action preview/run route 테스트를 포함하고, `docs/current-screens.md`에 ops action routeAuth 계약을 기록했습니다.

## 검증
- PASS: `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/ops/actions-preview-route.test.ts tests/planning/ops/actions-run-route.test.ts tests/planning/ops/ops-action-result-status.test.ts`
- PASS: `corepack pnpm planning:auth:check`
- PASS: `corepack pnpm planning:current-screens:guard`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- 미실행: `corepack pnpm e2e:rc`는 사용자 navigation/selector 변화가 아니라 API 인증 경계와 응답 meta 계약 변경이라 이번 라운드에서는 실행하지 않았습니다.

## 남은 리스크
- `/api/ops/actions/preview`와 `/api/ops/actions/run`은 여전히 local/dev unlock 및 CSRF 전용 운영 route입니다. 이번 변경은 그 위에 planning current-user scope를 추가한 것입니다.
- `ops/actions/registry` 내부에는 여러 action이 남아 있어 후속 service-boundary 라운드에서 action별 소유권과 side effect 분리를 계속 줄일 수 있습니다.
- page route 목록은 변경하지 않았고 API 노출 규칙 문구만 갱신했습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
