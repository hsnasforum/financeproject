# 2026-03-26 v3 import-to-planning beta reports-dashboard stale-selected-report fallback alignment implementation

## 변경 전 메모
1. 수정 대상 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- 필요하면 관련 테스트 파일

2. 변경 이유
- 현재 saved detail handoff는 valid selected saved report에는 맞지만, stale/invalid `selected` query가 들어오면 secondary CTA/helper가 실제 destination contract와 어긋날 수 있다.

3. 실행할 검증 명령
- `pnpm planning:current-screens:guard`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1`
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`

## 변경 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-stale-selected-report-fallback-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: reports dashboard query/handoff 배치에 맞춰 `planning:current-screens:guard`, narrow e2e, `lint`, `build`, `e2e:rc` 순서를 유지하는 데 사용.
- `route-ssot-check`: `/planning/reports`와 `/planning/reports/[id]` 사이의 existing stable route contract만 유지하고 새 route를 열지 않았는지 확인하는 데 사용.
- `work-log-closeout`: `/work` 종료 기록 형식을 저장소 규칙에 맞춰 남기고 미실행 검증을 명시하는 데 사용.

## 변경 이유
- 현재 saved detail handoff는 valid selected saved report에는 맞지만, stale/invalid `selected` query가 들어오면 secondary CTA/helper가 실제 destination contract와 어긋날 수 있다.
- `/planning/reports`는 primary stable destination으로 계속 usable해야 하므로, stale selected 상태에서도 dashboard 자체는 흔들리지 않고 secondary CTA만 좁게 숨겨야 한다.

## 핵심 변경
- `PlanningReportsDashboardClient`에서 `selected` query로 들어온 saved report id를 `/api/planning/v2/reports/[id]`로 좁게 검증하고, valid id일 때만 `저장된 상세 리포트 열기` secondary CTA를 노출하도록 바꿨다.
- `저장된 리포트로 보관` 성공 직후에는 생성된 report id를 즉시 valid로 반영해 기존 saved-detail handoff가 끊기지 않게 유지했다.
- stale/invalid `selected` query가 확인되면 secondary CTA를 숨기고, `저장된 상세 리포트를 찾지 못했지만 현재 리포트 화면은 계속 볼 수 있다`는 fallback helper를 amber notice로 노출한다.
- `flow-history-to-report` e2e에 stale selected query로 `/planning/reports`에 들어왔을 때 fallback helper만 보이고 saved-detail CTA는 숨겨지는 narrow 시나리오를 추가했다.

## 검증
- `pnpm planning:current-screens:guard` → PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1` → PASS
- `pnpm lint` → PASS
  - 기존 warning 24건 유지, 새 error 없음
- `pnpm build` → 1차 FAIL
  - `parsePlanningV2Response` 타입 좁히기 없이 `payload.data`를 바로 읽어 TypeScript error 발생
- `pnpm build` → 2차 PASS
- `pnpm planning:current-screens:guard` → PASS
  - final code 기준 재실행
- `pnpm lint` → PASS
  - final code 기준 재실행, 기존 warning 24건 유지
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1` → PASS
  - final code 기준 재실행
- `pnpm e2e:rc` → PASS
- `git diff --check -- src/components/PlanningReportsDashboardClient.tsx src/app/planning/reports/page.tsx src/components/PlanningReportDetailClient.tsx tests/e2e/flow-history-to-report.spec.ts tests/planning-reports-page-fallback.test.tsx tests/planning/reports/reportDashboardOverrides.test.tsx work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-stale-selected-report-fallback-alignment-implementation.md` → PASS
- `[미실행] pnpm planning:ssot:check`
  - route policy/catalog 자체는 바꾸지 않았고, documented stable route 안의 stale selected fallback만 좁게 조정해 `planning:current-screens:guard`까지만 실행
- `[미실행] tests/planning-reports-page-fallback.test.tsx`
  - 이번 라운드는 dashboard client의 selected-query fallback만 다뤄 SSR page fallback fixture는 다시 열지 않음
- `[미실행] tests/planning/reports/reportDashboardOverrides.test.tsx`
  - override disclosure나 report VM 조합은 건드리지 않아 범위 밖으로 유지

## 남은 리스크
- stale `selected` query 검증은 client-side fetch에 의존하므로, `/planning/reports` 진입 직후에는 saved-detail CTA 대신 기본 dashboard만 먼저 보였다가 검증 후 상태가 확정된다.
- query에 없는 saved detail id를 새로 만들거나 삭제하는 race는 이번 배치 범위 밖이다. 사용자가 다른 탭에서 saved report를 지우면 현재 탭 fallback은 다음 진입이나 query 변경 시점에 반영된다.
