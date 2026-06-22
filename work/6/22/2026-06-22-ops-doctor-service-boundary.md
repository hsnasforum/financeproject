# 2026-06-22 ops doctor service boundary

## 변경 파일
- `src/app/api/ops/doctor/route.ts`
- `src/lib/planning/server/ops/doctorRouteService.ts`
- `src/lib/planning/server/runs/repository.ts`
- `tests/planning/ops/ops-doctor-route-service-boundary.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 라운드가 Repository/Data Ownership 구현 라운드인지 판단하는 데 사용했습니다.
- `planning-gate-selector`: doctor route/service 변경에 맞는 타깃 테스트, auth 체크, lint, build 검증 범위를 고르는 데 사용했습니다.
- `work-log-closeout`: 종료 기록 형식과 필수 항목 확인에 사용했습니다.

## 변경 이유
- `/api/ops/doctor` route가 planning storage, migration, metrics, data-quality, namespace meta를 직접 소유해 route/data ownership 경계가 약했습니다.
- route는 dev guard, CSRF, routeAuth, body/action parse, HTTP 응답 매핑만 담당하고 doctor 실행 orchestration과 action side effect는 service 계층으로 이동해야 합니다.

## 핵심 변경
- `doctorRouteService`를 추가해 doctor GET 진단 집계와 POST action 실행/metric 기록을 담당하게 했습니다.
- doctor route에서 planning store, migration, consistency, metric, dataQuality, namespace direct import를 제거했습니다.
- run-store probe cleanup을 current-user repository 경계로 통과시키기 위해 `hardDeleteCurrentUserRun`을 추가했습니다.
- doctor route boundary 테스트로 direct storage/migration/metric/dataQuality 접근 금지 계약을 고정했습니다.
- planning route scope coverage의 user-owned ops marker와 `doctorRouteMeta` wrapper source를 새 service 경로로 갱신했습니다.

## 검증
- PASS `corepack pnpm test tests/planning/ops/ops-doctor-route-service-boundary.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/ops/support-export-route.test.ts tests/planning/ops/actions-run-route.test.ts`
- PASS `corepack pnpm planning:auth:check`
- PASS `git diff --check`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm build`

## 남은 리스크
- `src/lib/ops/actions/registry.ts`에도 `REPAIR_INDEX`와 `RUN_MIGRATIONS` 실행 흐름이 별도로 남아 있어 후속 중복 정리 후보입니다.
- Spark 정적 확인 기준 `src/e2e/helpers/planningGateHelpers.ts`에 `GET /api/ops/doctor?action=RUN_MIGRATIONS` 호출이 남아 있습니다. 기존 route도 POST action 방식이므로 별도 e2e helper 정리 라운드에서 확인이 필요합니다.
- UI나 selector 변경은 없어 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
