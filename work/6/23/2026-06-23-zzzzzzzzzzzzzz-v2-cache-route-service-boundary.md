# 2026-06-23 v2 cache route service boundary

## 변경 파일
- `src/app/api/planning/v2/actions/route.ts`
- `src/app/api/planning/v2/monte-carlo/route.ts`
- `src/app/api/planning/v2/scenarios/route.ts`
- `src/app/api/planning/v2/simulate/route.ts`
- `src/lib/planning/server/cache/routeService.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzz-v2-cache-route-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 v2 cache route boundary를 다음 구현 라운드로 선택.
- `planning-gate-selector`: Planning v2 route, auth/user scope coverage, build 영향에 맞는 검증 세트 선정.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 잔여 리스크를 종료 기록으로 정리.
- `gpt-5.3-codex-spark + xhigh`: 네 route의 TTL, key, payload/meta, usage stats 계약을 정적 조사.

## 변경 이유
- [사실] `simulate`, `actions`, `scenarios`, `monte-carlo` v2 route가 `getCache`, `setCache`, `recordCacheUsage`를 직접 호출했습니다.
- [해석] route는 인증, 입력 검증, assumptions/context, 계산 호출, 응답 매핑에 집중하고 파일 캐시 저장소 조합은 server cache route service로 분리하는 편이 data ownership 정리에 맞습니다.
- [권고] 캐시 키, TTL, public 응답 meta, engine 계산 로직, `.data/planning/cache` namespace 해석은 유지하고 storage 직접 호출만 제거했습니다.

## 핵심 변경
- `readPlanningRouteCache`와 `writePlanningRouteCache` service를 추가해 hit/miss 기록과 cache entry 저장을 한 곳으로 모았습니다.
- 네 v2 route는 새 service만 호출하고 `server/cache/storage` 직접 import를 제거했습니다.
- `actions`의 products TTL 6시간, 기본 TTL 24시간, `monteCarlo` TTL 7일 등 기존 TTL 계약을 유지했습니다.
- planning route coverage 테스트에 `planning/server/cache/storage` 직접 import 금지 패턴을 추가했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/simulate-route.test.ts tests/planning-v2-api/actions-route.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2-api/monte-carlo-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS: 5 files, 52 tests.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm planning:v2:compat` PASS.
- `corepack pnpm planning:v2:complete` PASS: fast e2e 6 tests 포함.
- `corepack pnpm planning:v2:regress` PASS: regression 9 cases, full e2e 8 tests 포함.
- `corepack pnpm build` PASS. 첫 실행은 180초 도구 제한에 걸려 종료 상태를 받지 못했고, 잔여 대기 루프를 정리한 뒤 600초 제한으로 재실행해 PASS를 확인했습니다.
- `corepack pnpm lint` PASS.
- `git diff --check` PASS.

## 남은 리스크
- [리스크] 이번 PR은 v2 simulate/actions/scenarios/monte-carlo cache storage 경계만 다뤘고, v2 runs assumptions overrides storage 경계는 후속 라운드로 남았습니다.
- [리스크] route path와 화면 셀렉터는 바꾸지 않았으므로 별도 `pnpm e2e:rc`는 실행하지 않았습니다. 대신 `planning:v2:complete`와 `planning:v2:regress`의 Playwright fast/full e2e가 통과했습니다.
- [리스크] v2 freeze guard가 core route 변경으로 분류하므로 commit/PR 제목에는 `[v2-core-change]` 태그를 포함해야 합니다.

## 다음 라운드 우선순위
1. `src/app/api/planning/v2/runs/route.ts`의 assumptions overrides storage 직접 호출을 route service 계층으로 위임합니다.
2. `src/app/api/planning/reports/[runId]/export.html/route.ts`의 report read surface를 CSP/print/local-host contract와 함께 별도 평가합니다.
3. 남은 Planning API route service boundary 후보를 route coverage 테스트 기준으로 재스캔합니다.
