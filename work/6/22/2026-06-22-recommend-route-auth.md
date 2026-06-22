# 2026-06-22 recommend routeAuth 정리

## 변경 파일
- `src/app/api/recommend/route.ts`
- `scripts/security_route_guard_scan.mjs`
- `tests/recommend-api.test.ts`
- `package.json`
- `tests/planning/auth/authConfigContract.test.ts`
- `docs/current-screens.md`
- `work/6/22/2026-06-22-recommend-route-auth.md`

## 사용 skill
- finance-skill-routing: 최신 `/work` 기준으로 Auth/User Scope 후속 라운드에 필요한 기본 skill 조합을 확인했습니다.
- planning-gate-selector: 추천 API route, 보안 스캔, auth gate, docs 변경에 맞는 검증 세트를 선정했습니다.
- route-ssot-check: `/api/recommend` route guard 계약 변경 후 `docs/current-screens.md` 갱신과 current-screens guard 필요성을 확인했습니다.
- work-log-closeout: 실제 변경 파일, 검증 결과, 남은 리스크를 `/work` 종료 기록으로 남겼습니다.

## 변경 이유
- `/api/recommend`는 추천 입력과 planning context를 받는 POST route입니다.
- 기존 security route scan은 이 route를 public mutation allowlist로 예외 처리하고 있어 Auth/User Scope 완성도 기준과 맞지 않았습니다.
- `planning:auth:check`가 recommend routeAuth 회귀를 직접 포함하지 않아 표준 auth gate로 묶을 필요가 있었습니다.

## 핵심 변경
- `/api/recommend`에 same-origin guard와 `withPlanningRouteUser` routeAuth current-user scope를 적용했습니다.
- 기존 추천 trace/source meta에 `planningUserMeta(currentUser)`를 병합해 `meta.userId/authSource`를 유지했습니다.
- security route scan에서 `/api/recommend` public mutation allowlist 예외를 제거했습니다.
- `tests/recommend-api.test.ts`에 401, spoofed trusted header 403, cross-origin 403, local fallback meta, trusted-header success meta 회귀를 추가했습니다.
- `planning:auth:check`에 `tests/recommend-api.test.ts`를 포함하고 `docs/current-screens.md`에 `/api/recommend` auth 계약을 기록했습니다.

## 검증
- PASS: `corepack pnpm test tests/recommend-api.test.ts tests/planning/auth/authConfigContract.test.ts`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:auth:check`
- PASS: `corepack pnpm planning:current-screens:guard`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- 미실행: `corepack pnpm e2e:rc`는 `/recommend` 페이지 UI, selector, navigation을 직접 바꾸지 않았고 API route auth/응답 meta 계약 변경이라 이번 라운드에서는 실행하지 않았습니다.

## 남은 리스크
- `/recommend` 화면 자체는 여전히 public route입니다. auth가 필요한 환경에서는 API 401을 기존 오류 영역에 표시합니다.
- security route scan의 public mutation allowlist는 5건 남아 있습니다. `feedback`, `gov24`, `sync/smoke` 계열은 별도 surface별 보안 라운드에서 줄여야 합니다.
- recommend route는 unified products 조회를 사용하므로 데이터 freshness/partial 표시 문제는 후속 Ops/Data Freshness 라운드에서 별도로 점검해야 합니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
