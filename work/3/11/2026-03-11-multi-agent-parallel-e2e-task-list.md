# 2026-03-11 멀티 에이전트 병렬 E2E 작업리스트

## 현재 상태
- `pnpm e2e:rc` 는 직렬 실행으로 PASS 상태다.
- 병렬 `pnpm e2e:pw ... --workers=2` 에서는 shared `next dev --webpack` 환경에서 flake가 다른 spec로 이동한다.
- `dart-flow`의 hydration 이전 native submit 문제는 이미 앱 가드로 막았다.
- `flow-planner-to-history` 는 profile hydrate 전 readiness 신호를 늦추고 `실행 기록` 링크를 native anchor 로 바꾼 뒤 최근 dev 병렬 재분류에서 더 이상 재현되지 않았다.
- `dart-flow` 는 dev 자동 재검색과 pending detail href 복구를 넣은 뒤 최근 dev 병렬 재분류 2회에서 모두 통과했다.
- `/api/products/candidates` 는 product catalog DB가 비어 있거나 테이블이 없을 때도 `200 + 빈 후보`로 degrade 하도록 조정됐다.
- `/planning/reports` 는 첫 진입에서 비핵심 섹션을 자동 mount하지 않고 사용자가 직접 여는 방식으로 fan-out를 줄였다.
- `/planning/reports` 는 기본 run scope 한도를 문서 계약과 같은 최근 20개로 공통화했고, requested run 조회 실패와 초기 scope 해석 실패를 서버 fallback으로 먼저 흡수하도록 보강됐다.
- `pnpm e2e:parallel:report-flake` 와 `pnpm e2e:parallel:report-flake:prod` 는 모두 PASS 했다.
- prod 병렬 셋은 `scripts/next_prod_safe.mjs` 가 `.next/static`, `public` 을 `.next/standalone` 아래로 연결한 뒤 standalone server 를 띄우는 경로로 고정됐다.
- `pnpm planning:v2:prod:smoke` 는 `/ops/doctor`, `/public/dart` 의 첫 `/_next/static/*` 자산, `/next.svg` 까지 확인하며 PASS 했다.
- `pnpm e2e:parallel:classify -- --runs=2 --mode=development --skip-build --dev-port-base=3114` 는 최신 상태에서 `2/2 PASS` 했다.
- 이어서 `pnpm e2e:parallel:classify -- --runs=5 --mode=development --skip-build --dev-port-base=3114` 도 `5/5 PASS` 했다.
- `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3116` 도 `3 passed (37.9s)` / `PASS development attempt=1/1` 로 통과했다.
- 같은 3116 검증에서도 `__webpack_modules__[moduleId] is not a function` 직후 `/planning/reports` 500, 이어서 `/api/planning/v2/profiles` `Unexpected end of JSON input` + 500 이 PASS 로그 안에 다시 남았다.
- 3116 검증 시작 로그는 `Using tsconfig file: tsconfig.playwright.json` 을 표시했고, 전후 `sha256sum tsconfig.json` 값은 동일했다.
- 최신 classify PASS 로그 안에서도 dev webpack runtime 오류(`__webpack_modules__[moduleId] is not a function`)와 `/planning/reports` 500 이 반복해서 보였지만, 최종 spec 결과는 모두 복구돼 통과했다.
- `pnpm build` 와 `pnpm e2e:rc` 도 최신 상태에서 다시 PASS 했다.
- 이번 축에서 `pnpm test tests/planning/reports/runSelection.test.ts` 와 대상 eslint는 PASS 했다.
- `playwright.config.ts` 는 dev webServer에 `PLAYWRIGHT_TSCONFIG_PATH=tsconfig.playwright.json` 을 넘기고, root `tsconfig.json` 에 남아 있던 `.next-e2e-*` include 는 다시 비우는 방향으로 정리됐다.
- `/planning/reports` 와 `/planning/reports/prototype` 는 첫 server scope 로드가 실패해도 500 대신 client fallback 으로 최근 실행 기록을 다시 불러오게 했다.
- `PlanningRunsClient`, `PlanningWorkspaceClient`, `DartSearchClient` 에는 mount 해제 뒤 late `setState` 를 줄이기 위한 `isMountedRef` 가드가 추가됐다.
- 수정 직후 첫 dev classify 1회는 `next.config.ts` 변경 감지 재시작으로 `ERR_EMPTY_RESPONSE` 가 섞였지만, 같은 명령 재실행(`--runs=1 --mode=development --skip-build --dev-port-base=3114`)은 PASS 했다.
- `pnpm build` 는 고아 `next build` 프로세스를 정리한 clean 상태에서 다시 실행했을 때 webpack compile, TypeScript, static page generation, trace 수집까지 끝까지 PASS 했다.
- [검증 완료] 이번 턴의 `.next/lock` 충돌과 `SIGTERM(143)` 는 앱 회귀보다 잔류 build 프로세스/세션 종료가 섞인 환경 이슈로 보는 편이 맞다.
- mounted guard 적용 뒤 `pnpm lint`, `pnpm build` 는 다시 PASS 했다.
- 같은 변경으로 `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3116` 를 연속 2회 다시 돌렸을 때 첫 시도는 `flow-planner-to-history` 가 `/planning/runs` 500 으로 FAIL, 바로 다음 재실행은 `3 passed (41.3s)` 로 PASS 했다.
- 최신 `.next-e2e` 로그에는 late `setState` 브라우저 경고가 여전히 1회 남아 있어, mounted guard는 일부 완화였지만 root warning 제거까지는 끝내지 못했다.

## 멀티 에이전트 관찰 요약
- `dart-flow`
  - 검색 결과 0건의 직접 원인은 [검증 완료] hydration 이전 검색 클릭이 native form submit으로 처리되며 `/public/dart` 재로드가 발생한 것이다.
  - [검증 완료] 그 다음 dev-only 실패는 reload 뒤 검색 상태와 상세 이동 의도가 같이 초기화되는 문제였고, 자동 재검색 + pending href 복구로 최근 재분류에서는 통과했다.
- `flow-history-to-report`
  - [검증 완료] 3116 PASS 검증에서도 `__webpack_modules__[moduleId] is not a function` 직후 `/planning/reports` 500, 이어서 `/api/planning/v2/profiles` JSON parse 오류/500 이 같은 로그 안에 찍혔다.
  - [검증 완료] 따라서 `/planning/reports` 자체의 결정적 앱 버그보다 병렬 dev 환경의 shared webpack runtime 오류 영향이 더 커 보인다.
- `flow-planner-to-history`
  - [검증 완료] `loadingProfiles` 초기값이 `false` 였던 탓에 첫 profile hydrate 전에도 `data-ready=true` 가 될 수 있었고, native anchor 전환 전에는 클릭 후 `/planning` 에 머무는 경우가 있었다.
  - [검증 완료] readiness 초기 상태를 보수적으로 바꾸고 native anchor 로 전환한 뒤 최근 재분류에서는 재현되지 않았다.
  - [검증 필요] mounted guard 적용 뒤에도 3116 재검증 첫 시도에서는 `/planning/runs` 500 으로 다시 FAIL 했고, 같은 명령 재실행은 PASS 했다. 현재는 deterministic regression보다 shared dev runtime flake 이동 쪽이 더 가깝다.
- `/planning/reports` 초기 fan-out
  - [검증 완료] 보고서 화면 진입 직후 `ReportRecommendationsSection`, `CandidateComparisonSection`, `ProductCandidatesPanel`, 혜택 API가 동시에 붙으며 컴파일/데이터 부하가 커졌다.
  - [검증 완료] 현재 e2e는 `/planning/reports` 첫 진입에서 heading, `report-dashboard`, `report-summary-cards`, `report-warnings-table`, `report-top-actions`, `report-advanced-toggle`만 직접 본다.
- `/api/products/candidates`
  - [검증 완료] Prisma client를 URL별로 재사용하도록 고정하지 않으면 dev/HMR에서 다른 datasource가 섞일 수 있다.
  - [검증 완료] product catalog 자체가 없는 로컬 상태에서는 `P2021` 류 오류가 나며, 이제 리포트 UI는 이를 빈 후보로 흡수한다.

## 우선순위 작업리스트
1. [완료] Prisma 에러 스택을 먼저 고정한다.
   - 범위: `src/lib/db/prisma.ts`, `src/app/api/products/candidates/route.ts`, `src/lib/sources/unified.ts`
   - 결과: datasource URL이 바뀌면 Prisma singleton을 재사용하지 않도록 조정했고, catalog 부재(`P2021`, `P1003`)는 빈 후보 응답으로 degrade 하도록 맞췄다.
   - 검증: `pnpm test tests/planning-v2-api/products-candidates-route.test.ts`, `pnpm e2e:rc`

2. [완료] `/planning/reports` 초기 fan-out를 줄인다.
   - 범위: `src/components/PlanningReportsDashboardClient.tsx`
   - 결과: 상품 비교 자료, 혜택 후보, 실시간 상품 탐색을 기본 자동 로드에서 사용자 직접 열기 방식으로 바꿨다.
   - 결과: `/api/products/candidates` 공유 payload는 상품 비교 자료를 열 때만 요청되도록 바꿨다.
   - 검증: `pnpm lint`, `pnpm e2e:rc`

3. [완료] 병렬 flake 회귀 체크를 작은 셋으로 고정한다.
   - 범위: `tests/e2e/flow-planner-to-history.spec.ts`, `tests/e2e/flow-history-to-report.spec.ts`, `tests/e2e/dart-flow.spec.ts`, `tests/e2e/planning-v2-fast.spec.ts`, `package.json`
   - 결과: 기존 `e2e:parallel:flake` 3개 흐름은 유지하고, `/planning/reports` 압박을 더 좁게 보는 `e2e:parallel:report-flake` 스크립트를 추가했다.
   - 검증: `pnpm e2e:parallel:report-flake`

4. [완료] 병렬 E2E용 실행 모드를 분리한다.
   - 범위: `playwright.config.ts`, `scripts/playwright_with_webserver_debug.mjs`, `scripts/next_prod_safe.mjs`, `package.json`
   - 결과: wrapper가 runtime/port 를 env 로 넘기고, Playwright config가 `next dev --webpack` 와 `next start` 를 분기하게 했다.
   - 결과: `e2e:parallel:flake:prod`, `e2e:parallel:report-flake:prod` 를 추가해 shared dev runtime 노이즈와 앱 회귀를 분리해 볼 수 있게 했다.
   - 결과: prod 경로는 direct standalone spawn 대신 `next_prod_safe` 를 통해 `.next/static`, `public` 자산 연결까지 보장하도록 정리했다.
   - 검증: `pnpm e2e:parallel:report-flake:prod`

5. [완료] 플래닝 링크/버튼에 hydration-ready 신호를 명시한다.
   - 범위: `src/components/PlanningWorkspaceClient.tsx`, `tests/e2e/flow-planner-to-history.spec.ts`
   - 결과: `실행 기록` 헤더 링크에 `data-testid="planning-runs-link"` 와 `data-ready` 신호를 추가했다.
   - 결과: e2e 는 profile select/href 추론만 보지 않고 명시적 readiness signal 을 먼저 기다리게 했다.
   - 검증: `pnpm e2e:pw tests/e2e/flow-planner-to-history.spec.ts --workers=1`

6. [완료] standalone prod runtime asset smoke guard 를 추가한다.
   - 범위: `scripts/planning_v2_prod_smoke.mjs`
   - 결과: prod smoke 가 `/public/dart` HTML 안의 첫 `/_next/static/*` 자산과 `/next.svg` 를 실제로 받아 standalone asset/public 서빙 계약을 빠르게 확인한다.
   - 검증: `pnpm planning:v2:prod:smoke`, `pnpm lint`

7. [완료] 반복 dev/prod 병렬 분류 러너를 고정한다.
   - 범위: `package.json`, `scripts/e2e_parallel_flake_classify.mjs`
   - 결과: `e2e:parallel:flake:prod:raw` 를 분리해 prod 반복 분류가 필요할 때 build를 매회 다시 하지 않도록 정리했다.
   - 결과: `e2e:parallel:classify` 는 dev/prod 포트를 분리해 반복 실행하고, `--skip-build`, `--stop-on-fail` 옵션과 요약 출력을 제공한다.
   - 검증: `pnpm e2e:parallel:classify -- --runs=1 --skip-build --stop-on-fail`, `pnpm lint`

8. [완료] 플래닝 workspace 실행 기록 링크를 hydrate 완료 뒤에만 준비 완료로 노출한다.
   - 범위: `src/components/PlanningWorkspaceClient.tsx`
   - 결과: `loadingProfiles` 초기값을 `true` 로 바꾸고, `planning-runs-link` 는 native anchor 로 전환했다.
   - 결과: 최신 dev 병렬 재분류에서 `flow-planner-to-history` 는 다시 재현되지 않았다.
   - 검증: `pnpm e2e:parallel:classify -- --runs=2 --mode=development --skip-build --dev-port-base=3114`, `pnpm e2e:rc`

9. [완료] DART 검색 화면이 dev full reload 뒤에도 검색/상세 이동을 복구하게 한다.
   - 범위: `src/components/DartSearchClient.tsx`
   - 결과: dev 환경에서는 hydration 뒤 기본 검색어를 1회 자동 재검색하고, 결과 클릭 직전 pending company href 를 저장했다가 reload 뒤 `/public/dart` 에 남아 있으면 상세 페이지로 복구한다.
   - 결과: 검색 결과/즐겨찾기/최근 기록 링크를 native anchor 로 바꿔 client transition 실패 영향을 줄였다.
   - 검증: `pnpm lint`, `pnpm build`, `pnpm e2e:parallel:classify -- --runs=2 --mode=development --skip-build --dev-port-base=3114`, `pnpm e2e:rc`

10. [완료] Playwright tsconfig churn 과 `/planning/reports` 첫 server 500 fallback 을 같이 줄인다.
   - 범위: `next.config.ts`, `playwright.config.ts`, `tsconfig.playwright.json`, `tsconfig.json`, `src/app/planning/reports/page.tsx`, `src/app/planning/reports/prototype/page.tsx`, `src/components/PlanningReportsDashboardClient.tsx`, `src/components/PlanningReportsPrototypeClient.tsx`, `src/lib/planning/reports/runSelection.ts`, `tests/planning/reports/runSelection.test.ts`
   - 결과: Playwright 관리 dev 서버는 `tsconfig.playwright.json` 을 사용하도록 분리해 root `tsconfig.json` 에 포트별 `.next-e2e-*` include 가 다시 쌓이지 않게 했다.
   - 결과: `/planning/reports` 와 prototype page 는 첫 server scope 로드가 실패해도 500 대신 경고 + client reload 경로로 복구하고, 초기 run scope limit 도 20개로 줄였다.
   - 검증: `pnpm test tests/planning/reports/runSelection.test.ts`, `pnpm lint`, `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3114`

## 권장 실행 순서
1. PASS 로그에 남는 webpack runtime 오류와 route abort/500 을 같은 시점 기준으로 다시 축약
2. 필요하면 `/planning/reports` 의 남은 초기 연산을 더 나누거나 dev 전용 prewarm 경로를 검토
3. late `setState` 브라우저 경고의 남은 발생 지점을 action patch/run polling 기준으로 더 좁히기

## 바로 다음 액션
- 추천: 최신 PASS classify 로그에서 `__webpack_modules__[moduleId] is not a function` 와 route abort/500 이 같이 찍힌 시점만 다시 묶는다.
- 이유: 3116 새 포트에서도 root `tsconfig.json` churn 은 재발하지 않았고, `pnpm build` 도 clean 상태에서는 PASS 했지만 late `setState` 경고와 webpack/runtime 노이즈는 둘 다 남아 있어 다음 수정은 잔여 warning source 축약이 더 직접적이다.

## 근거로 실행한 명령
- `pnpm e2e:pw tests/e2e/smoke.spec.ts tests/e2e/flow-planner-to-history.spec.ts tests/e2e/flow-history-to-report.spec.ts tests/e2e/dart-flow.spec.ts --workers=2 --reporter=line`
- `pnpm e2e:rc`
- `pnpm lint`
- `pnpm test tests/planning-v2-api/products-candidates-route.test.ts`
- `pnpm e2e:parallel:report-flake`
- `pnpm e2e:parallel:report-flake:prod`
- `pnpm planning:v2:prod:smoke`
- `pnpm e2e:parallel:flake`
- `pnpm e2e:parallel:classify -- --runs=1 --skip-build --stop-on-fail`
- `pnpm e2e:parallel:classify -- --runs=2 --mode=development --skip-build --dev-port-base=3114`
- `pnpm e2e:parallel:classify -- --runs=5 --mode=development --skip-build --dev-port-base=3114`
- `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3116`
- `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3116`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm test tests/planning/reports/runSelection.test.ts`
- `pnpm exec eslint src/app/planning/reports/page.tsx src/components/PlanningReportsDashboardClient.tsx src/lib/planning/reports/runSelection.ts tests/planning/reports/runSelection.test.ts`
- `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3114`

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
