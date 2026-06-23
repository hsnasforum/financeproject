# 2026-06-23 monte-carlo audit boundary

## 변경 파일
- `src/app/api/planning/v2/monte-carlo/route.ts`
- `src/lib/planning/server/v2/monteCarloAuditRouteService.ts`
- `tests/planning-v2-api/monte-carlo-route.test.ts`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기반으로 이번 라운드의 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: v2 API route/core 변경에 필요한 검증 게이트를 골랐습니다.
- `work-log-closeout`: `/work` 종료 기록의 표준 섹션과 검증 기록 기준을 확인했습니다.

## 변경 이유
- `POST /api/planning/v2/monte-carlo` route가 `auditLogStore`를 직접 import해 budget reject audit 기록까지 수행하고 있었습니다.
- route handler의 책임을 guard/auth/input/error response 중심으로 좁히고, audit write는 server route service 경계 뒤로 이동하기 위해 분리했습니다.
- 직전 share-report 라운드와 같은 방식으로 정적 boundary 가드를 테스트에 고정해 direct import 회귀를 막습니다.

## 핵심 변경
- `monteCarloAuditRouteService`를 추가해 Monte Carlo budget reject audit append를 캡슐화했습니다.
- audit write 실패가 원래의 `BUDGET_EXCEEDED` 응답을 가리지 않도록 service 내부에서 실패를 흡수합니다.
- `monte-carlo/route.ts`에서 `auditLogStore` 직접 import와 직접 append 블록을 제거했습니다.
- route 테스트에서 budget reject 시 audit service 호출 여부를 확인합니다.
- route 테스트에 source-boundary assertion을 추가해 route가 `auditLogStore`/`appendAuditLog`를 직접 참조하지 않게 했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/monte-carlo-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm build` PASS
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:regress` PASS
- `git diff --check` PASS
- `rg -n -e 'planning/server/.*/repository' -e 'server/.*/repository' -e auditLogStore -e 'server/.*/storage' -e planning/store -e node:fs -e '@prisma/client' -e better-sqlite3 src/app/api/planning/v2 src/app/api/planning -g route.ts` no matches

## 남은 리스크
- 이번 라운드는 direct route boundary 제거에 한정했고, audit log 저장소 자체의 파일 큐/DB 전환은 다루지 않았습니다.
- 검색 기준은 route 파일의 직접 import 패턴을 대상으로 하므로, 더 넓은 service/repository 계층 정규화는 별도 라운드에서 계속 확인해야 합니다.
- Spark 조건부 지침은 manager 정적 분해에만 적용했고, 구현·최종 검증·PR/merge는 메인 에이전트가 단일 소유자로 처리했습니다.
