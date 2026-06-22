# 2026-06-22 ops planning cache service boundary

## 변경 파일
- `src/app/api/ops/planning-cache/stats/route.ts`
- `src/app/api/ops/planning-cache/purge/route.ts`
- `src/lib/planning/server/cache/opsRouteService.ts`
- `tests/planning/ops/planning-cache-route-user-scope.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 라운드가 Repository/Data Ownership 구현 라운드인지 판단하는 데 사용했습니다.
- `planning-gate-selector`: ops route/service 변경에 맞는 타깃 테스트, auth 체크, lint, build 검증 범위를 고르는 데 사용했습니다.
- `work-log-closeout`: 종료 기록 형식과 필수 항목 확인에 사용했습니다.

## 변경 이유
- `stats`/`purge` route가 planning cache storage, namespace meta, audit append를 직접 소유해 route/data ownership 경계가 약했습니다.
- route는 dev guard, CSRF, routeAuth, response mapping만 담당하고, cache 통계 계산과 purge audit side effect는 service 계층으로 이동해야 합니다.

## 핵심 변경
- `opsRouteService`를 추가해 cache stats 계산, expired purge, audit payload, namespace meta를 담당하게 했습니다.
- `stats`/`purge` route에서 cache storage, namespace, audit direct import를 제거했습니다.
- 기존 `ok/data/meta/message`, `planningUserMeta`, `planningNamespaceEnabled`, purge audit details 계약은 유지했습니다.
- planning cache route 테스트에 direct storage/namespace/audit 접근 금지 정적 계약을 추가했습니다.
- planning route scope coverage에 새 service import marker를 추가해 user-owned ops route inventory가 유지되게 했습니다.

## 검증
- PASS `corepack pnpm test tests/planning/ops/planning-cache-route-user-scope.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS `corepack pnpm test tests/planning-cache/storage.test.ts`
- PASS `corepack pnpm planning:auth:check`
- PASS `git diff --check`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm build`

## 남은 리스크
- `corepack pnpm build`는 최초 184초 제한에서 결과 없이 timeout 되었고, 600초 제한 재실행에서 PASS를 확인했습니다.
- `ops/runs`, `ops/doctor`에는 아직 direct repository/namespace/store import가 남아 후속 ownership 후보입니다.
- UI나 selector 변경은 없어 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
