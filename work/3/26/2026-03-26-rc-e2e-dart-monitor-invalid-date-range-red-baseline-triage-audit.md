# 2026-03-26 rc e2e dart-monitor invalid-date-range red-baseline triage audit

## 변경 전 메모
1. 수정 대상 파일
- 우선은 없음
- 실제 원인이 확인될 때만 최소 파일을 추가한다

2. 변경 이유
- full `pnpm e2e:rc`가 DART flow red로 닫혀서 현재 배포 기준선이 완전 green이 아니다

3. 실행할 검증 명령
- `pnpm e2e:rc:dart`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/dart-flow.spec.ts --workers=1`
- 필요하면 artifact 확인
- 수정이 생기면 `pnpm lint`
- 수정이 생기면 `pnpm build`
- fix가 확인되면 `pnpm e2e:rc`

## 변경 파일
- `work/3/26/2026-03-26-rc-e2e-dart-monitor-invalid-date-range-red-baseline-triage-audit.md`

## 사용 skill
- `dart-data-source-hardening`: DART monitor red triage에서 invalid date validation, fallback, upstream/API 의존 여부를 failure mode 기준으로 분리하는 데 사용.
- `planning-gate-selector`: triage-only 범위에 맞춰 `pnpm e2e:rc:dart`, 단일 spec rerun, artifact 확인, `git diff --check`만 우선 실행하고 불필요한 broader gate를 보류하는 데 사용.
- `route-ssot-check`: `/public/dart`, `/public/dart/company`가 current public surface라는 점과 route contract 변경이 없다는 점을 확인하는 데 사용.
- `work-log-closeout`: 실제 실행한 명령과 미실행 검증, triage 결론을 `/work`에 정리하는 데 사용.

## 변경 이유
- full `pnpm e2e:rc`에서 DART flow red가 있었다는 전제로, `/public/dart` invalid date range 케이스가 실제 회귀인지 먼저 분리할 필요가 있었다.
- 방금 닫은 `/planning/reports` manual recheck 배치와 직접 연결되지 않은 red일 가능성이 있어, isolated rerun과 artifact 확인으로 원인을 좁히는 triage audit이 우선이었다.

## 핵심 변경
- 코드 수정 없이 DART 전용 e2e(`pnpm e2e:rc:dart`)와 동일 단일 spec command를 각각 다시 실행해 `tests/e2e/dart-flow.spec.ts:60`이 현재도 재현되는지 확인했다.
- 두 rerun 모두 `dart monitor shows summary and blocks invalid date range`를 포함해 3/3 PASS로 끝나, 현재 시점의 isolated DART surface 회귀는 재현되지 않았다.
- `test-results/`, `playwright-report/`에는 최신 dart-flow failure artifact가 남아 있지 않았고, `git diff --name-only`/`git status --short` 기준으로 DART page/API/test/script/docs 파일에는 이번 planning/reports 배치 연관 변경도 없었다.
- invalid date range 문구와 settings error surface는 `src/lib/dart/disclosureMonitor.ts`와 `src/components/DartDisclosureMonitorClient.tsx`에 그대로 살아 있고, `docs/current-screens.md`에도 `/public/dart`, `/public/dart/company`가 current public stable route로 유지되는 것을 다시 확인했다.
- 현재 evidence 기준으로는 `/public/dart` 실제 회귀보다 earlier full-suite red의 일시적 webserver/startup race, stale observation, 또는 다른 test와의 연쇄 맥락 가능성이 더 크며, 이번 `/planning/reports` 변경과의 직접 연결 근거는 찾지 못했다.

## 검증
- `pnpm e2e:rc:dart` → PASS
  - `tests/e2e/dart-flow.spec.ts` 3 passed
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/dart-flow.spec.ts --workers=1` → PASS
  - 동일 spec direct rerun 3 passed
- `ls -lt test-results | sed -n '1,40p'` → PASS
  - `test-results` 비어 있음, 최신 dart-flow 실패 artifact 없음
- `find playwright-report -maxdepth 2 -type f | sed -n '1,60p'` → FAIL 아님
  - `playwright-report` 디렉터리 자체가 없어 추가 failure report 없음
- `git status --short -- src/app/public/dart/page.tsx src/app/public/dart/company/page.tsx src/app/api/public/dart/search/route.ts src/app/api/public/dart/company/route.ts tests/e2e/dart-flow.spec.ts scripts/playwright_with_webserver_debug.mjs scripts/next_dev_safe.mjs docs/current-screens.md src/components/PlanningReportsDashboardClient.tsx tests/e2e/flow-history-to-report.spec.ts` → PASS
  - 변경 파일은 `PlanningReportsDashboardClient.tsx`, `flow-history-to-report.spec.ts`만 표시되어 DART surface와 겹치지 않음
- `git diff --name-only -- src/app/public/dart/page.tsx src/app/public/dart/company/page.tsx src/app/api/public/dart/search/route.ts src/app/api/public/dart/company/route.ts tests/e2e/dart-flow.spec.ts scripts/playwright_with_webserver_debug.mjs scripts/next_dev_safe.mjs docs/current-screens.md` → PASS
  - 출력 없음, DART 관련 tracked diff 없음
- `rg -n '공시 모니터링|시작일은 종료일보다 늦을 수 없습니다.|dart-monitor-settings-error|dart-monitor-filter-summary|dart-monitor-visibility-summary' src/components src/app src/lib` → PASS
  - invalid date validation copy와 monitor selector surface가 코드상 그대로 존재함
- `git diff --check -- work/3/26/2026-03-26-rc-e2e-dart-monitor-invalid-date-range-red-baseline-triage-audit.md` → PASS
- `[미실행] pnpm lint`
  - 코드 수정이 없어 실행하지 않음
- `[미실행] pnpm build`
  - page/api/runtime 코드를 수정하지 않은 triage-only round라 실행하지 않음
- `[미실행] pnpm e2e:rc`
  - isolated DART rerun 2회가 모두 green이고 이번 라운드에서 fix를 적용하지 않아 full suite 재실행은 triage 범위를 넘는다고 판단
- `[미실행] pnpm planning:ssot:check`
  - route policy/catalog나 current-screens contract를 바꾸지 않았고 route surface 확인만 했으므로 broader SSOT guard는 생략
- `[미실행] tests/planning-reports-page-fallback.test.tsx`
  - 이번 라운드는 DART monitor triage-only 범위라 planning reports fallback test는 열지 않음
- `[미실행] tests/planning/reports/reportDashboardOverrides.test.tsx`
  - 이번 라운드는 DART monitor triage-only 범위라 planning reports override test는 열지 않음

## 남은 리스크
- full-suite red가 사용자가 본 시점에 실제 있었더라도 현재는 isolated rerun으로 재현되지 않아, root cause를 단정할 만큼의 failing artifact가 없다. 다음에 다시 red가 뜨면 그 즉시 `test-results`/trace/screenshot을 보존한 상태로 first failure를 고정해야 한다.
- `pnpm e2e:rc` 전체는 이번 triage round에서 다시 돌리지 않았으므로, full-suite 안에서만 발생하는 inter-test contamination이나 dev webserver cold-start race 가능성은 [미확인]으로 남는다.
