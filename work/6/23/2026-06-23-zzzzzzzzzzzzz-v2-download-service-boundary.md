# 2026-06-23 v2 download service boundary

## 변경 파일
- `src/app/api/planning/v2/reports/[id]/download/route.ts`
- `src/app/api/planning/v2/share-report/[id]/download/route.ts`
- `src/lib/planning/server/reports/downloadRouteService.ts`
- `src/lib/planning/server/share/downloadRouteService.ts`
- `tests/planning-v2-api/reports-route.test.ts`
- `tests/planning-v2-api/share-report-route.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzz-v2-download-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 v2 download pair를 다음 구현 라운드로 선택.
- `planning-gate-selector`: App Router API route, Planning v2 compatibility, auth boundary 변경에 맞는 검증 세트 선정.
- `work-log-closeout`: 실제 변경 파일, 검증 결과, 잔여 리스크를 종료 기록으로 정리.
- `gpt-5.3-codex-spark + xhigh`: 두 download route의 public contract와 기존 테스트 후보를 정적 조사.

## 변경 이유
- [사실] `reports/[id]/download`와 `share-report/[id]/download` route가 current-user repository read를 직접 호출하고 있었습니다.
- [해석] route는 same-origin guard, routeAuth, params 해석, raw markdown response mapping만 담당하고, markdown artifact read와 filename 산출은 server service boundary로 넘기는 편이 repository/data ownership 목표에 맞습니다.
- [권고] route path, raw markdown body, header, `NO_DATA`/`INTERNAL` 오류 계약은 유지하고 direct repository import만 제거했습니다.

## 핵심 변경
- `getCurrentUserReportMarkdownDownload`와 `getCurrentUserShareReportMarkdownDownload` service boundary를 추가했습니다.
- 두 download route는 repository 대신 `downloadRouteService`를 호출하도록 변경했습니다.
- 기존 markdown download 테스트에 service boundary 정적 회귀를 추가했습니다.
- raw response auth coverage guard를 repository 직접 호출 기준에서 download service 기준으로 갱신했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/reports-route.test.ts tests/planning-v2-api/share-report-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS: 3 files, 37 tests.
- `node --import tsx scripts/planning_v2_compat.mjs --keep-sandbox` PASS, 이후 임시 sandbox `/tmp/planning-v2-compat-SohLVI` 삭제.
- `corepack pnpm planning:v2:compat` PASS.
- `git diff --check` PASS.
- `corepack pnpm build` PASS.
- `corepack pnpm multi-agent:guard` PASS.

## 남은 리스크
- [리스크] 첫 `corepack pnpm planning:v2:compat` 실행은 내부 `planning:v2:complete`가 code 1로 실패했지만, 로그가 남지 않았고 재실행 2회는 PASS했습니다.
- [리스크] 이번 PR은 markdown download pair만 다뤘고, v2 simulate/actions/scenarios/monte-carlo cache storage 직접 호출은 후속 라운드로 남았습니다.
- [리스크] route path와 user flow는 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
1. `src/app/api/planning/v2/{simulate,actions,scenarios,monte-carlo}/route.ts`의 cache storage 직접 호출을 route cache service로 이동합니다.
2. `src/app/api/planning/v2/runs/route.ts`의 assumptions overrides storage 직접 호출을 route service 계층으로 위임합니다.
3. `src/app/api/planning/reports/[runId]/export.html/route.ts`의 report read surface를 CSP/print/local-host contract와 함께 별도 평가합니다.
