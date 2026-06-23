# 2026-06-23 v2 runs export service boundary

## 변경 파일
- `src/app/api/planning/v2/runs/[id]/export/route.ts`
- `src/lib/planning/server/reports/runExportRouteService.ts`
- `tests/planning-v2-api/runs-export-route.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzzzzzzz-v2-runs-export-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 흐름에서 v2 `runs/[id]/export` service-boundary 라운드를 다음 PR 범위로 선택.
- `planning-gate-selector`: Planning v2 API route/core 변경에 맞는 targeted tests, lint, build, complete, regress 게이트 선정.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 잔여 리스크를 종료 기록으로 정리.

## 변경 이유
- [사실] 직전 `/work`는 `runs/[id]/export` route의 DTO export read boundary를 별도 service로 이동하는 것을 다음 우선순위로 남겼습니다.
- [사실] export route는 `getCurrentUserRun` 조회와 `resolveReportResultDtoFromRun` projection, export filename 생성을 route 내부에서 직접 수행했습니다.
- [해석] route는 same-origin guard, planning route auth, JSON download response mapping만 담당하고 current-user run 조회와 Result DTO export payload 생성은 server service로 이동하는 편이 기존 report/download service 경계와 더 일관됩니다.

## 핵심 변경
- `getCurrentUserRunResultExport` service를 추가해 current-user run 조회, Result DTO projection, export filename 생성을 route 밖으로 이동했습니다.
- `runs/[id]/export` route는 guard/auth/params, `NO_DATA`/`INTERNAL` 매핑, JSON download response header 조립만 유지하도록 정리했습니다.
- export route 성공 응답의 JSON pretty-print, trailing newline, `content-type`, `content-disposition`, `cache-control` 계약은 유지했습니다.
- `runs-export-route.test.ts`에 route가 run repository와 DTO projection helper를 직접 참조하지 않는 source boundary assertion을 추가했습니다.
- Spark 조건부 모델은 직전 사용량 제한 이력이 있어 이번 라운드에는 새로 배정하지 않고 manager 분해와 메인 정적 검토로 진행했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/runs-export-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS: 2 files, 35 tests.
- `corepack pnpm lint` PASS.
- `corepack pnpm build` PASS.
- `corepack pnpm planning:v2:complete` PASS: guard, sec:check, freeze guard, route guard scan, report/guide tests, smoke, fast e2e 6 tests 포함.
- `corepack pnpm planning:v2:regress` PASS: regression 9 cases, full e2e 8 tests 포함.
- `git diff --check` PASS.
- `git diff --cached --check` PASS.
- `corepack pnpm multi-agent:guard` 1차 FAIL: 최신 `/work` note의 다음 라운드 섹션 누락.
- `corepack pnpm multi-agent:guard` PASS: 다음 라운드 섹션 추가 후 최신 `/work` note 추적 확인.

## 남은 리스크
- [리스크] repo 내부 UI 호출부는 확인되지 않아 이번 검증은 API route 계약과 v2 회귀 게이트 중심입니다. 외부/수동 소비자는 기존 URL, filename, JSON shape 유지에 의존합니다.
- [리스크] route path, query, 사용자 화면, selector는 변경하지 않았으므로 별도 route SSOT 문서 변경과 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
1. v2 `trash` route family의 repository 직접 호출을 route service로 이동할 후보로 검토합니다.
2. v2 `runs/[id]` detail/action-plan 계열의 current-user run read boundary를 별도 라운드로 나눌지 결정합니다.
3. v3 repository 직접 import 32개는 batch/news/account family별 narrowing 계획으로 분리합니다.
