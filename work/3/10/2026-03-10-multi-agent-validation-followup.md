# 2026-03-10 multi-agent validation follow-up

## 2026-03-11 planning ssot rounding guard cleanup

### 변경 파일

- `work/3/10/2026-03-10-multi-agent-validation-followup.md`

### 변경 이유

- 이번 planning guard 정리 라운드에서 `Math.round`/`Math.floor` baseline 예외가 planning 전반에서 제거된 상태를 운영 로그로 남긴다.
- 현재 `planning:ssot:check` 기준에서 직접 반올림 허용 범위는 `src/lib/planning/calc/**`만 유지되고, 그 외 planning 영역은 guard 위반 없이 정리됐다.

### 핵심 변경

- 운영 메모에 2026-03-11 기준 rounding guard 정리 상태를 추가했다.
- 상태 요약은 `planning:ssot:check PASS`, planning 전반 baseline 예외 제거, `calc/**`만 직접 rounding 허용으로 기록했다.

### 검증

- `pnpm planning:ssot:check`

### 남은 리스크

- 이후 새 코드가 `calc/**` 밖에서 직접 `Math.round`/`Math.floor`를 다시 도입하면 같은 guard에서 즉시 다시 잡힌다.

### 변경 파일

- `src/components/PlanningWorkspaceClient.tsx`
- `src/components/PlanningReportsPrototypeClient.tsx`
- `docs/current-screens.md`
- `src/lib/planning/server/v2/toEngineInput.ts`
- `src/app/api/planning/v2/simulate/route.ts`
- `src/app/api/planning/v2/actions/route.ts`
- `src/app/api/planning/v2/scenarios/route.ts`
- `src/app/api/planning/v2/monte-carlo/route.ts`
- `src/app/api/planning/v2/optimize/route.ts`
- `scripts/planning_v2_route_guard_scan.mjs`
- `scripts/planning_v2_static_guard.mjs`
- `tests/planning/server/v2/toEngineInput.test.ts`
- `tests/e2e/helpers/planningGateHelpers.ts`
- `tests/e2e/planning-v2-full.spec.ts`
- `next.config.ts`
- `playwright.config.ts`
- `work/test.js`

### 변경 이유

- 멀티 에이전트로 남은 작업을 정리한 뒤, 우선순위를 `report/workspace 검증 -> build -> planning:v2:compat`로 올렸다.
- 지정 범위 테스트는 모두 통과했지만 `pnpm build`에서 `PlanningWorkspaceClient`의 scenario VM 필드명이 새 타입과 어긋나며 실패했다.
- 이어서 `planning:v2:compat` 내부 `planning:v2:guard`와 `planning:v2:scan:guards`가 현재 same-origin 정책과 맞지 않는 문자열/스캔 규칙 때문에 막혔다.
- 추가 후속으로 `pnpm test`와 `planning:v2:regress`를 다시 올리자 `current-screens` SSOT 계약과 full E2E 셀렉터/빈 상태 기대값이 어긋나는 문제가 드러났다.
- 검증 라운드를 모두 닫은 뒤에는 explorer 제안에 맞춰 `simulate/actions/scenarios/monte-carlo/optimize` route의 `resolveAssumptionsContext()` 중복을 최소 helper로 수렴했다.

### 핵심 변경

- `PlanningWorkspaceClient`가 `scenariosBaseSummary.endNetWorth` 대신 `endNetWorthKrw`를 사용하도록 수정해 build 타입 회귀를 해소했다.
- `PlanningReportsPrototypeClient`의 demo ref path에서 client 금지 패턴인 `.data/...` 문자열을 제거했다.
- `docs/current-screens.md`는 실제 page route SSOT 테스트와 맞추기 위해 legacy `/planner`, `/planner/[...slug]` redirect 경로를 다시 문서화했다.
- `planning_v2_route_guard_scan.mjs`를 현재 정책에 맞춰 조정했다.
- `planning-api`: `assertSameOrigin | assertLocalHost | guardLocalRequest` 중 하나의 request guard만 요구
- `ops-api`: request guard + `onlyDev` 동시 요구 유지
- `planning_v2_static_guard.mjs`는 `docs/current-screens.md`의 legacy redirect 목록만 예외로 보고, 다른 파일의 `/planner` 표기는 계속 차단하게 조정했다.
- `planningGateHelpers.ts`는 중복 accessible name 버튼이 있을 때 첫 번째 `샘플 프로필 불러오기` 버튼만 클릭하도록 바꿔 Playwright strict mode 오류를 없앴다.
- `planning-v2-full.spec.ts`는 경고 테이블이 없을 때 `planning-reports-warnings-section`이 존재하는 경우에만 `경고가 없습니다.` 문구를 확인하도록 완화했다.
- `toEngineInput.ts`에 `resolveAssumptionsContextForProfile()`를 추가해 assumptions context 해석과 `SNAPSHOT_NOT_FOUND` 정규화를 공통화했다.
- `simulate/actions/scenarios/monte-carlo/optimize` route는 새 helper를 사용하도록 전환했고, 기존 사용자 응답 계약은 유지했다.
- `toEngineInput.test.ts`에 helper 성공/실패 케이스를 추가해 공통 해석 경계를 고정했다.
- `work/test.js`의 사용하지 않는 `catch (error)` 변수를 제거해 lint warning을 없앴다.

### 검증

- `pnpm test tests/recommend-api.test.ts tests/planning-v2/reportInputContract.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning-v2/reportViewModel.safeBuild.test.ts tests/planning/reports/recommendationSignals.test.ts tests/planning/reports/runSelection.test.ts`
- `pnpm exec eslint tests/recommend-api.test.ts tests/planning-v2/reportInputContract.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning-v2/reportViewModel.safeBuild.test.ts tests/planning/reports/recommendationSignals.test.ts tests/planning/reports/runSelection.test.ts`
- `pnpm test tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceAssumptionsEditor.test.ts tests/planning/ui/workspaceDebtOffersEditor.test.ts tests/planning/ui/profileFormModel.test.ts tests/planning/ui/runPipeline.test.ts tests/planning/ui/workspaceUiState.test.ts`
- `pnpm exec eslint tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceAssumptionsEditor.test.ts tests/planning/ui/workspaceDebtOffersEditor.test.ts tests/planning/ui/profileFormModel.test.ts tests/planning/ui/runPipeline.test.ts tests/planning/ui/workspaceUiState.test.ts`
- `pnpm build`
- `pnpm planning:v2:guard`
- `pnpm planning:v2:scan:guards`
- `pnpm planning:v2:compat`
- `pnpm test tests/planning/catalog/currentScreens.experimentalRoutes.test.ts tests/planning/catalog/currentScreens.fullRouteSet.test.ts`
- `pnpm e2e:rc`
- `env E2E_EXTERNAL_BASE_URL=http://127.0.0.1:3100 pnpm planning:v2:e2e:full`
- `env E2E_EXTERNAL_BASE_URL=http://127.0.0.1:3100 pnpm planning:v2:regress`
- `pnpm test`
- `pnpm lint`
- `pnpm test tests/planning/server/v2/toEngineInput.test.ts tests/planning-v2-api/simulate-route.test.ts tests/planning-v2-api/actions-route.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2-api/monte-carlo-route.test.ts tests/planning-v2-api/optimize-route.test.ts`
- `pnpm build`

### 남은 리스크

- `planning:v2:e2e:full`과 `planning:v2:regress`는 이미 띄운 `3100` 서버에 `E2E_EXTERNAL_BASE_URL`을 주는 방식에서 안정적으로 통과했다.
- 현재 worktree에는 이번 수정 외에도 대량의 in-progress 변경이 이미 있으므로, 후속 작업은 전체 범위 회귀와 충돌 가능성을 별도로 봐야 한다.

## 2026-03-10 playwright webServer follow-up

### 변경 파일

- `next.config.ts`
- `playwright.config.ts`

### 변경 이유

- 남은 리스크였던 Playwright `webServer` 자동 기동 실패를 따로 추적했다.
- 원인은 `pnpm dev` wrapper가 빈 포트로 fallback하더라도 Next dev는 `.next/dev/lock` 하나를 공유한다는 점, 그리고 Playwright는 고정 `url/baseURL`만 재사용 대상으로 본다는 점이었다.
- 기존 dev 인스턴스가 `.next/dev/lock`을 잡고 있으면, Playwright가 다른 포트로 새 dev를 띄우려 할 때 lock 충돌로 시작 단계에서 실패할 수 있었다.

### 핵심 변경

- `next.config.ts`에 `PLAYWRIGHT_DIST_DIR` env-gated `distDir`를 추가해 Playwright 전용 dev 인스턴스가 기본 `.next`와 다른 출력 경로를 쓰게 했다.
- `playwright.config.ts`는 명시적 base URL(`BASE_URL`, `E2E_BASE_URL`, `PLANNING_BASE_URL`, `E2E_EXTERNAL_BASE_URL`)이 들어오면 `webServer`를 켜지 않도록 정리했다.
- Playwright가 자체로 띄우는 dev 서버는 `pnpm dev` wrapper 대신 `pnpm exec next dev --hostname 127.0.0.1 --port {PORT}`를 사용하게 바꿔, 테스트가 기다리는 URL과 실제 bind 포트를 일치시켰다.
- Playwright 관리 dev 서버 env에는 `PLAYWRIGHT_DIST_DIR=.next-e2e` 기본값을 넣어 기존 로컬 dev와 병행 실행될 수 있게 했다.

### 검증

- `PORT=3111 pnpm planning:v2:e2e:fast`
- `env E2E_BASE_URL=http://127.0.0.1:3100 pnpm planning:v2:e2e:fast`
- `pnpm e2e:rc`
- `pnpm build`

### 남은 리스크

- `e2e:ui`처럼 사용자가 직접 Playwright를 여는 흐름은 여전히 사용자가 지정한 base URL과 로컬 실행 상태에 따라 달라질 수 있다.
- 자동 기동과 명시적 base URL 경로는 이번 follow-up에서 각각 `PORT=3111`/`E2E_BASE_URL=http://127.0.0.1:3100` 검증으로 재확인했다.

## 2026-03-10 debug access follow-up

### 변경 파일

- `src/lib/dev/debugAccess.ts`
- `tests/debug-access.test.ts`
- `docs/planning-v2-release-checklist.md`

### 변경 이유

- 문서는 `/debug/*`가 `PLANNING_DEBUG_ENABLED=true`여도 localhost 요청에서만 열려야 한다고 적고 있었지만, 실제 `isDebugPageAccessible()`는 host/x-forwarded-host만 보고 있었다.
- 이 상태에서는 API용 local request guard보다 페이지 쪽 기준이 느슨해질 수 있어, 문서/가드/테스트 정합성이 완전히 맞지 않았다.

### 핵심 변경

- `debugAccess.ts`가 자체 host 판별 대신 `isLocalRequest()`를 재사용하도록 바꿔 forwarded IP, WSL bridge 예외, loopback 판별을 API 가드와 같은 기준으로 맞췄다.
- `tests/debug-access.test.ts`를 추가해 localhost 허용, 외부 forwarded IP 차단, WSL bridge 허용 조건, production 차단을 고정했다.
- `docs/planning-v2-release-checklist.md`는 기존 보류 메모를 제거하고 새 테스트 기반 검증 기록으로 갱신했다.

### 검증

- `pnpm test tests/debug-access.test.ts tests/dev-local-request.test.ts`
- `pnpm build`

### 남은 리스크

- `pnpm build`는 PASS였지만, 기존 Playwright 전용 distDir(`.next-e2e`) traced file 복사에서 warning 1건이 남았다. 현재 게이트 실패는 아니지만 후속 정리 후보다.

## 2026-03-10 debug e2e + tsconfig stabilization

### 변경 파일

- `tsconfig.json`
- `tests/e2e/debug-access.spec.ts`
- `docs/planning-v2-release-checklist.md`

### 변경 이유

- `PLAYWRIGHT_DIST_DIR=.next-e2e`를 쓰는 e2e가 `tsconfig.json` include를 자동 수정해 worktree를 더럽히는 부수효과를 남기고 있었다.
- debug access 정책은 unit test만으로도 고정돼 있었지만, `/debug/*` page 라우트 기준의 실제 HTTP 200/404를 같은 Playwright 런타임에서 다시 잠그는 회귀가 있으면 release checklist 근거가 더 명확해진다.

### 핵심 변경

- `tsconfig.json`에 `.next-e2e/types/**/*.ts`, `.next-e2e/dev/types/**/*.ts`를 고정해 Playwright dev 서버 실행 때 타입 include churn이 생기지 않게 했다.
- `tests/e2e/debug-access.spec.ts`를 추가해 `PLANNING_DEBUG_ENABLED=true`일 때 localhost의 `/debug/unified`, `/debug/planning-v2`는 200이고, `x-forwarded-host=example.com`이면 두 경로 모두 404인지 확인하게 했다.
- `docs/planning-v2-release-checklist.md`는 debug-enabled 항목과 Partial Validation Log에 새 e2e 근거를 같이 남겼다.

### 검증

- `env PLANNING_DEBUG_ENABLED=true PORT=3113 pnpm e2e -- tests/e2e/debug-access.spec.ts`
- `PORT=3111 pnpm planning:v2:e2e:fast`
- `pnpm build`

### 남은 리스크

- release checklist의 다른 수동 항목(`5min selftest`, policy defaults, strict doctor, ops runtime 확인)은 아직 남아 있다.

## 2026-03-10 playwright distDir lock follow-up

### 변경 파일

- `playwright.config.ts`
- `tsconfig.json`

### 변경 이유

- `tests/e2e/debug-access.spec.ts`를 실제 Playwright로 돌리자, 이전 `PORT=3111` 실행이 남긴 `.next-e2e/dev/lock` 때문에 `PORT=3113` 실행이 시작 단계에서 막혔다.
- 원인은 Playwright webServer가 포트가 달라도 같은 `.next-e2e` distDir를 공유했다는 점이었다.

### 핵심 변경

- `playwright.config.ts`는 기본 `PLAYWRIGHT_DIST_DIR`를 `.next-e2e-${PORT}`로 바꿔 포트별 dev 서버가 서로 다른 lock/traces 경로를 쓰게 했다.
- `tsconfig.json`은 `.next-e2e*/types/**/*.ts`, `.next-e2e*/dev/types/**/*.ts` glob include로 바꿔 포트별 distDir를 써도 type include churn 없이 유지되게 했다.

### 검증

- `env PLANNING_DEBUG_ENABLED=true PORT=3113 pnpm e2e -- tests/e2e/debug-access.spec.ts`
- `PORT=3111 pnpm planning:v2:e2e:fast`
- `pnpm build`

### 남은 리스크

- `e2e:ui`처럼 사용자가 수동으로 다른 `PLAYWRIGHT_DIST_DIR`를 지정하면 별도 경로가 추가될 수 있지만, 기본 자동 경로에서는 포트 충돌과 stale lock 영향이 줄어든다.

## 2026-03-11 playwright webpack dev follow-up

### 변경 파일

- `playwright.config.ts`
- `work/3/10/2026-03-10-multi-agent-validation-followup.md`

### 변경 이유

- `pnpm planning:v2:compat` 재실행 중 `planning:v2:e2e:fast`의 Playwright webServer가 `next dev` 시작 단계에서 Turbopack 내부 panic 후 120초 타임아웃으로 실패했다.
- 현재 실패는 앱 로직 회귀가 아니라 dev server 런타임 불안정성이므로, Playwright 관리 dev 서버만 webpack 모드로 고정해 compat 게이트를 다시 안정화한다.

### 핵심 변경

- `playwright.config.ts`의 webServer command를 `pnpm exec next dev --webpack --hostname 127.0.0.1 --port {PORT}`로 바꿨다.
- 명시적 external base URL을 주는 경로는 그대로 유지하고, Playwright가 자체 기동하는 dev 서버에만 webpack을 적용한다.
- `scripts/playwright_with_webserver_debug.mjs`를 추가해 Playwright 실행 직전에 `DEBUG=pw:webserver`를 주입하도록 바꾸고, 관련 `e2e` package scripts는 wrapper를 사용하게 했다.

### 검증

- `pnpm planning:v2:e2e:fast`
- `pnpm planning:v2:compat`

### 남은 리스크

- webpack dev는 Turbopack panic 회피에는 유리하지만, 앞으로 Turbopack 전용 회귀는 별도 검증 경로가 필요할 수 있다.

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
