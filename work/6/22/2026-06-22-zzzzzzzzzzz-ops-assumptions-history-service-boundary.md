# 2026-06-22 Ops Assumptions History Service Boundary

## 변경 파일
- `src/app/api/ops/assumptions/history/route.ts`
- `src/app/api/ops/assumptions/history/[id]/route.ts`
- `src/lib/ops/assumptions/assumptionsHistoryRouteService.ts`
- `tests/planning-assumptions-ops-route.test.ts`
- `tests/planning/ops/ops-assumptions-history-route-service-boundary.test.ts`

## 사용 skill
- `finance-skill-routing`: Finance Project 작업 라우팅 기준 확인
- `planning-gate-selector`: 변경 범위에 맞는 검증 게이트 선정
- `dart-data-source-hardening`: ops/data freshness 리포트 재생성 범위 확인
- `work-log-closeout`: 종료 기록 형식 정리

## 변경 이유
- `/api/ops/assumptions/history`와 `/api/ops/assumptions/history/[id]`가 storage 조회와 error redaction을 route 내부에서 직접 수행하던 구조를 service boundary로 이동했습니다.
- assumptions latest/sync/refresh 라운드와 같은 방식으로 ops route는 HTTP guard, planning user auth, 입력 파싱, 응답 매핑만 담당하도록 맞췄습니다.

## 핵심 변경
- history list/detail route에 `requirePlanningRouteUser`를 적용하고 성공 응답에 `meta.userId/authSource`를 추가했습니다.
- `assumptionsHistoryRouteService`가 history refs 조회, snapshot 로딩, summary 생성, missing snapshot 필터링, storage error redaction, planning user meta 생성을 담당합니다.
- history list/detail 401, 404, 500 redaction, 성공 meta 계약을 `tests/planning-assumptions-ops-route.test.ts`에 추가했습니다.
- route가 storage/types/redaction helper를 직접 import/call하지 않도록 boundary 테스트를 추가했습니다.
- `set-latest` mutation은 이번 라운드에서 제외하고 다음 mutation service boundary 라운드 후보로 남겼습니다.

## 검증
- PASS: `corepack pnpm vitest run tests/planning-assumptions-ops-route.test.ts tests/planning/ops/ops-assumptions-history-route-service-boundary.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/middleware-security.test.ts`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build` (첫 실행은 184초 제한 초과로 중단, 420초 제한 재실행에서 통과)
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:ssot:check`
- PASS: `corepack pnpm test` (718 files, 2301 tests)
- PASS: `corepack pnpm verify` (718 files, 2301 tests)

## 남은 리스크
- `pnpm verify`는 `docs/schema-drift-report.md`, `docs/data-freshness-report.md`, `docs/dart-rules-quality-report.md`를 재생성했지만 이번 범위가 아니라 원복했습니다.
- freshness report의 `stale=8`은 기존 운영 데이터 freshness 상태이며, 이번 route boundary 변경으로 해결하지 않았습니다.
- history list/detail은 여전히 ops/dev guard 뒤에 있는 운영자용 표면입니다. public UX 변경은 없습니다.

## 다음 라운드 우선순위
- `/api/ops/assumptions/set-latest` mutation을 service boundary로 이동하고 audit/error redaction/current-user meta 계약을 고정합니다.
