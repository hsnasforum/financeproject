# 2026-06-23 v2 report export html service boundary

## 변경 파일
- `src/app/api/planning/reports/[runId]/export.html/route.ts`
- `src/lib/planning/server/reports/exportHtmlRouteService.ts`
- `tests/planning-v2-api/reports-export-html-route.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzzzz-v2-report-export-html-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`의 다음 우선순위인 report export HTML read surface를 이번 라운드로 선택.
- `planning-gate-selector`: Planning API route와 report export 계약 변경에 필요한 최소 검증 세트 선정.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 잔여 리스크를 종료 기록으로 정리.
- `gpt-5.3-codex-spark + xhigh`: `export.html` route의 local-host, CSP, print, current-user run read surface를 정적 조사.

## 변경 이유
- [사실] 직전 `/work`는 `src/app/api/planning/reports/[runId]/export.html/route.ts`의 report read surface 평가를 후속 우선순위로 남겼습니다.
- [사실] 기존 route는 local-host guard, route auth, query parsing, CSP/Content-Disposition 응답 매핑과 함께 `getCurrentUserRun` 및 standalone report artifact 생성을 직접 수행했습니다.
- [해석] public HTTP 계약은 유지하되 현재 사용자 run 조회와 HTML artifact 생성을 server service로 옮기면 route의 책임이 인증, 입력, 응답 매핑으로 좁아집니다.

## 핵심 변경
- `getCurrentUserRunStandaloneReportHtml` service를 추가해 current-user run 조회와 standalone HTML 생성을 route 밖으로 이동했습니다.
- `export.html` route는 local-host guard, `requirePlanningRouteUser`, `view=print|view`, CSP, attachment/inline disposition 계약만 유지하도록 정리했습니다.
- 기존 HTML export 테스트에 route가 run repository와 artifact builder를 직접 import하지 않는 정적 경계 테스트를 추가했습니다.
- CSP, style nonce, print script, production local bridge, strict contract 동작은 기존 테스트 계약을 그대로 유지했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/reports-export-html-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS: 2 files, 38 tests.
- `corepack pnpm test tests/planning-v2-api/report-contract-mode-route.test.ts tests/dev-guards.test.ts tests/dev-local-request.test.ts` PASS: 3 files, 20 tests.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm lint` PASS.
- `corepack pnpm planning:v2:complete` PASS: guard, security scan, freeze guard, route guard scan, report/guide tests, smoke, fast e2e 6 tests 포함.
- `corepack pnpm build` PASS.
- `git diff --check` PASS.
- `corepack pnpm multi-agent:guard` PASS: latest `/work` tracked.

## 남은 리스크
- [리스크] `exportHtmlRouteService.ts`는 기존 artifact builder 위치를 유지하기 위해 `src/app/planning/reports/_lib/standaloneReportArtifacts`를 호출합니다. builder 위치 자체의 lib 승격은 더 큰 이동이라 이번 라운드 범위에서 제외했습니다.
- [리스크] local-host guard, same-origin guard, strict-only `contract` 쿼리 동작은 기존 public 계약으로 보존했으며 정책 변경은 하지 않았습니다.
- [리스크] route path와 화면 셀렉터는 바꾸지 않았으므로 별도 `pnpm e2e:rc`는 실행하지 않았습니다. 대신 `planning:v2:complete` fast e2e가 `/api/planning/reports/{runId}/export.html` 200 흐름을 확인했습니다.

## 다음 라운드 우선순위
1. 남은 Planning API route service boundary 후보를 route coverage 테스트 기준으로 재스캔합니다.
2. `planning:v2:compat` 일반 실행의 비결정적 실패 로그 확보 방식을 스크립트 개선 후보로 분리합니다.
