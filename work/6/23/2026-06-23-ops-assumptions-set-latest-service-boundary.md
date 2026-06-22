# 2026-06-23 Ops Assumptions Set-Latest Service Boundary

## 변경 파일
- `src/app/api/ops/assumptions/set-latest/route.ts`
- `src/lib/ops/assumptions/assumptionsSetLatestRouteService.ts`
- `tests/planning-assumptions-ops-route.test.ts`
- `tests/planning/ops/ops-assumptions-set-latest-route-service-boundary.test.ts`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 라운드에 필요한 skill 조합을 고르기 위해 사용했습니다.
- `planning-gate-selector`: API route/mutation/service boundary 변경에 맞는 검증 세트를 정하기 위해 사용했습니다.
- `work-log-closeout`: 변경 파일, 실제 검증, 남은 리스크를 `/work` 형식으로 정리하기 위해 사용했습니다.

## 변경 이유
- `/api/ops/assumptions/set-latest`가 route 내부에서 storage 조회, confirm 검증, latest pointer 변경, audit 기록, error message 노출을 직접 처리하고 있었습니다.
- assumptions latest/sync/refresh/history 라운드와 같은 기준으로 route는 guard/auth/body/응답 매핑만 담당하고, mutation·audit·redaction은 service boundary 안으로 이동해야 했습니다.

## 핵심 변경
- `set-latest` route에 `requirePlanningRouteUser`를 추가하고 성공 응답에 `meta.userId/authSource`를 추가했습니다.
- `assumptionsSetLatestRouteService`가 confirm 검증, current latest id best-effort 조회, target snapshot 조회, pointer update, audit append, redacted storage error를 담당합니다.
- confirm mismatch, snapshot missing, pointer write failure, snapshotId missing, auth-required 차단, success audit/user meta를 route 테스트로 고정했습니다.
- route가 storage/audit/redaction helper를 직접 import/call하지 않도록 boundary 테스트를 추가했습니다.
- `pnpm verify`가 재생성한 schema/freshness/DART report는 이번 범위가 아니라 원복했습니다.

## 검증
- PASS: `corepack pnpm vitest run tests/planning-assumptions-ops-route.test.ts tests/planning/ops/ops-assumptions-set-latest-route-service-boundary.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/middleware-security.test.ts`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:ssot:check`
- PASS: `corepack pnpm test` (719 files, 2308 tests)
- PASS: `corepack pnpm verify` (719 files, 2308 tests)

## 남은 리스크
- `set-latest`는 ops/dev guard 뒤의 운영자용 mutation이며 public UX 변경은 없습니다.
- freshness report의 `stale=8`은 기존 운영 데이터 freshness 상태이며 이번 mutation boundary 라운드에서 해결하지 않았습니다.
- live upstream smoke나 E2E는 실행하지 않았습니다. 이번 변경은 API route/service/test 계약 변경이고 UI selector 변경은 없습니다.

## 다음 라운드 우선순위
- assumptions 계열 다음 후보는 overrides/reset route의 current-user boundary 및 service 접근 상태 점검입니다.
- 운영 데이터 freshness 라운드에서는 `daily:refresh:strict` 또는 source별 live smoke 증거로 stale snapshot을 별도 해소해야 합니다.
