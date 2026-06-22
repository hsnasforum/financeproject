# 2026-06-22 planner compute routeAuth 정리

## 변경 파일
- `src/app/api/planner/compute/route.ts`
- `scripts/security_route_guard_scan.mjs`
- `package.json`
- `docs/current-screens.md`
- `tests/planner-compute-route-auth.test.ts`
- `tests/planning/auth/authConfigContract.test.ts`
- `work/6/22/2026-06-22-planner-compute-route-auth.md`

## 사용 skill
- finance-skill-routing: Auth/User Scope 후속 라운드에서 필요한 기본 skill 조합을 확인했습니다.
- planning-gate-selector: API route, security scan, auth gate, docs 변경에 맞는 검증 세트를 선정했습니다.
- route-ssot-check: route guard 동작 변경 후 `docs/current-screens.md` API 노출 규칙과 current-screens guard 필요성을 확인했습니다.
- work-log-closeout: 실제 변경 파일, 검증 결과, 남은 리스크를 `/work` 종료 기록으로 남겼습니다.

## 변경 이유
- `/api/planner/compute`는 legacy planner 계산 API지만 개인 재무 입력을 받는 POST route입니다.
- 기존 security route scan은 이 route를 public mutation allowlist로 예외 처리하고 있어 Auth/User Scope 완성도 기준과 맞지 않았습니다.
- 최근 ops/user ownership 경계 테스트가 `planning:auth:check` 단일 게이트에 충분히 묶이지 않아 표준 auth 검증 범위도 함께 정렬했습니다.

## 핵심 변경
- `/api/planner/compute`에 same-origin guard와 `withPlanningRouteUser` routeAuth current-user scope를 추가했습니다.
- compute 성공 응답에 `planningUserMeta(currentUser)` 기반 `meta.userId/authSource`를 추가했습니다.
- security route scan에서 `/api/planner/compute` public mutation allowlist 예외를 제거하고, same-origin + routeAuth mutation policy를 명시 허용 조건으로 추가했습니다.
- `planning:auth:check`에 compute route auth, assumptions overrides, ops runs/doctor/action ownership 테스트를 포함했습니다.
- `docs/current-screens.md`에 legacy compute API의 same-origin + routeAuth 계약을 기록했습니다.

## 검증
- FAIL 후 수정: `corepack pnpm test tests/planner-compute-route-auth.test.ts tests/planning/auth/authConfigContract.test.ts` 초기 실행에서 기존 `ORIGIN_MISMATCH` 응답의 `fixHref` 부가 필드를 테스트가 과도하게 고정해 실패했습니다.
- PASS: `corepack pnpm test tests/planner-compute-route-auth.test.ts tests/planning/auth/authConfigContract.test.ts`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:auth:check`
- PASS: `corepack pnpm test tests/planner-compute-route-auth.test.ts tests/planning/auth/authConfigContract.test.ts && corepack pnpm planning:current-screens:guard`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- 미실행: `corepack pnpm e2e:rc`는 화면 navigation, selector, 사용자 flow 변경이 아니라 API route auth와 security gate 변경이라 이번 라운드에서는 실행하지 않았습니다.

## 남은 리스크
- `/api/planner/assumptions`는 저장소를 쓰지 않는 외부 가정값 조회 보조 API로 public GET 상태를 유지합니다. 후속 데이터 freshness 라운드에서 기준 시점/실패 표시를 더 점검할 수 있습니다.
- `planning:auth:check`는 최근 ops ownership 경계를 더 많이 포함하지만, planning v3 전체 user-scope 회귀는 여전히 별도 `planning:user-scope:check`에 남아 있습니다.
- `/api/recommend`, `/api/gov24/sync` 등 남은 public mutation allowlist 6건은 별도 보안 라운드에서 surface별로 줄여야 합니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
