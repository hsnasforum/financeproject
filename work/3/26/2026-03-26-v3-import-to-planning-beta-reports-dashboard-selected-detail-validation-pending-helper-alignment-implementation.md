# 2026-03-26 v3 import-to-planning beta reports-dashboard selected-detail-validation-pending helper alignment implementation

## 변경 전 메모
1. 수정 대상 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- 필요하면 관련 테스트 파일

2. 변경 이유
- 현재 stale selected fallback은 정리됐지만, valid saved report인지 아직 검증 중인 순간에는 secondary CTA가 비어 있고 helper도 없어 사용자가 상태를 추측해야 한다.

3. 실행할 검증 명령
- `pnpm planning:current-screens:guard`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1`
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`

## 변경 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-selected-detail-validation-pending-helper-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: reports dashboard selected-query helper 배치에 맞춰 `planning:current-screens:guard`, narrow e2e, `lint`, `build`, `e2e:rc` 순서를 유지하는 데 사용.
- `route-ssot-check`: `/planning/reports`와 `/planning/reports/[id]` 사이의 existing stable route contract만 유지하고 새 route나 새 query contract를 열지 않았는지 확인하는 데 사용.
- `work-log-closeout`: `/work` 종료 기록 형식과 미실행 검증 표기를 저장소 규칙에 맞춰 남기는 데 사용.

## 변경 이유
- 현재 stale selected fallback은 정리됐지만, valid saved report인지 아직 검증 중인 순간에는 secondary CTA가 비어 있고 helper도 없어 사용자가 상태를 추측해야 했다.
- `/planning/reports`는 기본 destination tier라, saved detail secondary CTA가 아직 열리지 않는 짧은 대기 구간도 화면 자체는 계속 usable하다는 신호를 분명히 줘야 했다.

## 핵심 변경
- `PlanningReportsDashboardClient`에서 `savedReportId`가 있고 아직 valid/stale 어느 쪽으로도 확정되지 않은 순간을 pending state로 좁게 계산했다.
- pending state에는 `저장된 상세 리포트를 확인하는 중이며 현재 기본 리포트 화면은 계속 볼 수 있다`는 neutral helper를 추가하고, secondary CTA는 계속 숨긴 채 validation 완료 뒤에만 열리도록 유지했다.
- stale/invalid helper와 pending helper를 서로 다른 tone으로 분리해, pending은 slate notice, stale은 amber notice, valid는 기존 emerald notice를 유지했다.
- `flow-history-to-report` e2e에 valid saved report GET만 짧게 지연시키는 route interception을 추가해 pending helper가 먼저 보이고 `저장된 상세 리포트 열기`는 검증 완료 뒤에만 나타나는지 직접 확인했다.

## 검증
- `pnpm planning:current-screens:guard` → PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1` → PASS
- `pnpm lint` → PASS
  - 기존 warning 24건 유지, 새 error 없음
- `pnpm build` → PASS
- `pnpm e2e:rc` → PASS
- `git diff --check -- src/components/PlanningReportsDashboardClient.tsx src/app/planning/reports/page.tsx src/components/PlanningReportDetailClient.tsx tests/e2e/flow-history-to-report.spec.ts tests/planning-reports-page-fallback.test.tsx tests/planning/reports/reportDashboardOverrides.test.tsx work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-selected-detail-validation-pending-helper-alignment-implementation.md` → PASS
- `[미실행] pnpm planning:ssot:check`
  - route policy/catalog 자체는 바꾸지 않았고, existing stable route 안에서 selected validation pending helper만 좁게 추가해 `planning:current-screens:guard`까지만 실행
- `[미실행] tests/planning-reports-page-fallback.test.tsx`
  - 이번 라운드는 dashboard client의 pending helper만 다뤄 SSR page fallback fixture는 다시 열지 않음
- `[미실행] tests/planning/reports/reportDashboardOverrides.test.tsx`
  - override disclosure나 report VM 조합은 건드리지 않아 범위 밖으로 유지

## 남은 리스크
- pending helper는 client-side validation fetch가 실제로 남아 있는 경우에만 잠깐 보인다. 응답이 아주 빠른 환경에서는 사용자가 helper를 거의 인지하지 못할 수 있다.
- selected saved report가 다른 탭에서 삭제되거나 교체되는 race는 이번 배치 범위 밖이다. 현재 탭은 query 변화나 재진입 시점에 다시 pending/stale 판정을 받는다.
