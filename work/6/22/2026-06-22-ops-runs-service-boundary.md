# 2026-06-22 ops runs service boundary

## 변경 파일
- `src/app/api/ops/runs/route.ts`
- `src/app/api/ops/runs/[runId]/route.ts`
- `src/app/api/ops/runs/cleanup/route.ts`
- `src/lib/planning/server/runs/repository.ts`
- `src/lib/planning/server/runs/opsRouteService.ts`
- `tests/planning/ops/ops-runs-route-service-boundary.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 라운드가 Repository/Data Ownership 구현 라운드인지 판단하는 데 사용했습니다.
- `planning-gate-selector`: ops route/service 변경에 맞는 타깃 테스트, auth 체크, lint, build 검증 범위를 고르는 데 사용했습니다.
- `work-log-closeout`: 종료 기록 형식과 필수 항목 확인에 사용했습니다.

## 변경 이유
- `ops/runs` 3개 route가 runStore, retention 계산, namespace meta, audit side effect를 직접 소유해 route/data ownership 경계가 약했습니다.
- route는 dev guard, CSRF, routeAuth, params/body parse, HTTP 응답 매핑만 담당하고 run index 조회, 삭제, cleanup, audit는 service 계층으로 이동해야 합니다.

## 핵심 변경
- `opsRouteService`를 추가해 ops run 목록 필터/페이지네이션, 단건 삭제, cleanup dry-run/execute, audit/security audit, namespace meta를 담당하게 했습니다.
- `runs` route 3개에서 runStore, namespace, audit, retention direct import를 제거했습니다.
- `runs/repository`에 `listCurrentUserRunIndexEntries`를 추가해 index 조회도 current-user repository 경계로 통과하게 했습니다.
- 새 route service boundary 테스트로 list/delete/cleanup의 current-user namespace 격리와 direct import 금지 계약을 고정했습니다.
- planning route scope coverage에 새 runs service marker를 추가해 user-owned ops route inventory가 유지되게 했습니다.

## 검증
- PASS `corepack pnpm test tests/planning/ops/ops-runs-route-service-boundary.test.ts tests/planning-security-csrf.test.ts tests/planning/ops/runsRetention.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS `corepack pnpm planning:auth:check`
- PASS `git diff --check`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm build`

## 남은 리스크
- `/api/ops/doctor`에는 migration, storage consistency, metrics, profile validation, run probe 책임이 아직 한 route에 남아 후속 분해가 필요합니다.
- `src/lib/ops/actions/registry.ts`에도 runs cleanup/delete와 유사한 ops action 로직이 남아 있어 후속 중복 정리 후보입니다.
- UI나 selector 변경은 없어 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
