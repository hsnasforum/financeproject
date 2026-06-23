# 2026-06-23 v2 runs report service boundary

## 변경 파일
- `src/app/api/planning/v2/runs/[id]/report/route.ts`
- `src/app/api/planning/v2/runs/[id]/report.pdf/route.ts`
- `src/lib/planning/server/reports/runReportRouteService.ts`
- `tests/planning-v2-api/runs-report-route.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzzzzzz-v2-runs-report-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`의 다음 우선순위인 v2 runs report/export 계열 service-boundary 정리를 이번 라운드로 선택.
- `planning-gate-selector`: Planning v2 API route, report artifact, PDF route 변경에 필요한 검증 세트 선정.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 잔여 리스크를 종료 기록으로 정리.
- `gpt-5.3-codex-spark + xhigh`: v2 runs report/export family 정적 조사를 배정했으나 사용량 제한으로 결과를 받지 못해 manager와 메인 정적 조사로 대체.

## 변경 이유
- [사실] 직전 `/work`는 v2 `runs/[id]/report`, `runs/[id]/report.pdf`, `runs/[id]/export` 계열을 한 family로 묶을지 route별로 자를지 결정하는 것을 다음 우선순위로 남겼습니다.
- [사실] `report`와 `report.pdf` route는 같은 `getCurrentUserRun` 조회와 `buildStandaloneReportArtifactsFromRun` HTML artifact 생성을 route 내부에서 직접 수행했습니다.
- [해석] `export` route는 Result DTO 계약을 다루므로 이번 라운드에서 제외하고, 같은 HTML artifact 책임을 공유하는 `report + report.pdf`만 먼저 service boundary로 묶는 것이 안전합니다.

## 핵심 변경
- `getCurrentUserRunReportHtml` service를 추가해 current-user run 조회와 standalone HTML artifact 생성을 route 밖으로 이동했습니다.
- `runs/[id]/report` route는 same-origin guard, auth, `view`/`download` query, HTML response header 매핑만 유지하도록 정리했습니다.
- `runs/[id]/report.pdf` route는 same-origin+CSRF guard, auth, PDF feature flag, PDF render/error mapping, PDF response header 매핑만 유지하도록 정리했습니다.
- report route 테스트에 report/pdf route가 run repository와 artifact builder를 직접 import하지 않는 boundary assertion을 추가했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/runs-report-route.test.ts tests/planning-v2-api/runs-report-pdf-route.test.ts tests/planning-v2-api/report-contract-mode-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS: 4 files, 42 tests.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm lint` PASS.
- `corepack pnpm planning:v2:complete` PASS: guard, security scan, freeze guard, route guard scan, report/guide tests, smoke, fast e2e 6 tests 포함.
- `corepack pnpm planning:v2:regress` PASS: regression 9 cases, full e2e 8 tests 포함.
- `corepack pnpm build` PASS.
- `git diff --check` PASS.
- `corepack pnpm multi-agent:guard` PASS: latest `/work` tracked.

## 남은 리스크
- [리스크] `export` route는 Result DTO 계약이 달라 이번 PR에서 제외했습니다. 후속 라운드에서 별도 `runs/[id]/export` service boundary로 다루는 편이 안전합니다.
- [리스크] PDF route의 enabled 성공 경로는 PDF engine/font 환경 의존성이 있어 기존 테스트처럼 disabled/guard 계약 중심으로 검증했습니다. HTML artifact service 호출은 report route 성공 테스트와 source boundary assertion으로 확인했습니다.
- [리스크] route path, query 이름, 응답 shape는 유지했으므로 별도 route SSOT 문서 변경과 `planning:current-screens:guard`는 실행하지 않았습니다.

## 다음 라운드 우선순위
1. v2 `runs/[id]/export`의 DTO export read boundary를 별도 service로 이동합니다.
2. v2 `trash` route family의 repository 직접 호출을 route service로 이동할 후보로 검토합니다.
3. v3 repository 직접 import 32개는 v3 batch/news/account family별 narrowing 계획으로 분리합니다.
