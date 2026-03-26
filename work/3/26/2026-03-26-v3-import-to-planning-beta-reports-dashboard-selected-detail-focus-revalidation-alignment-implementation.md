# 2026-03-26 v3 import-to-planning beta reports-dashboard selected-detail-focus-revalidation alignment implementation

## 변경 전 메모
1. 수정 대상 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- 필요하면 관련 테스트 파일

2. 변경 이유
- 현재 selected saved detail은 최초 진입/query 변경 시에는 valid/stale/pending으로 잘 갈리지만, 다른 탭에서 saved report가 삭제되면 현재 탭은 query 변화나 재진입 전까지 기존 valid 상태를 유지할 수 있다.

3. 실행할 검증 명령
- `pnpm planning:current-screens:guard`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1`
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`

## 변경 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-selected-detail-focus-revalidation-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: reports dashboard focus/visibility 재검증 배치에 맞춰 `planning:current-screens:guard`, narrow e2e, `lint`, `build`, `e2e:rc` 순서를 유지하는 데 사용.
- `route-ssot-check`: `/planning/reports`와 `/planning/reports/[id]`의 existing stable route contract만 유지하고 새 route나 새 query contract를 열지 않았는지 확인하는 데 사용.
- `work-log-closeout`: `/work` 종료 기록 형식과 미실행 검증 표기를 저장소 규칙에 맞춰 남기는 데 사용.

## 변경 이유
- 현재 selected saved detail은 최초 진입/query 변경 시에는 valid/stale/pending으로 잘 갈리지만, 다른 탭에서 saved report가 삭제되면 현재 탭은 query 변화나 재진입 전까지 기존 valid 상태를 유지할 수 있었다.
- `/planning/reports`는 기본 destination tier라, focus/visibility 복귀 시점에 한 번 더 좁게 재검증해 stale helper로 자연스럽게 강등돼야 했다.

## 핵심 변경
- `PlanningReportsDashboardClient`에 `useEffectEvent` 기반 `requestSavedReportRevalidation`을 추가해, 현재 selected saved detail이 valid인 경우에만 focus/visibility 복귀 시 `pending -> 재검증`을 한 번 더 타게 만들었다.
- 재검증은 기존 selected validation effect를 그대로 재사용하고, valid 상태를 먼저 pending으로 내려 secondary CTA를 숨긴 뒤 응답 결과에 따라 valid/stale로 다시 정리하도록 유지했다.
- query가 없거나 이미 pending/stale인 상태에서는 focus/visibility 복귀 재검증을 붙이지 않아 계속 polling하지 않게 막았다.
- `flow-history-to-report` e2e에 `첫 GET 200 -> focus 이벤트 -> 두 번째 GET 404` 시나리오를 추가해, valid selected saved detail이 stale helper로 자연스럽게 강등되는지 직접 확인했다.

## 검증
- `pnpm planning:current-screens:guard` → PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1` → PASS
- `pnpm lint` → 1차 PASS
  - 기존 warning 24건 + `PlanningReportsDashboardClient.tsx`의 `useEffectEvent` dependency warning 1건 확인
- `pnpm planning:current-screens:guard` → PASS
  - dependency warning 수정 후 final code 기준 재실행
- `pnpm lint` → 2차 PASS
  - final code 기준 재실행, 기존 warning 24건 유지
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1` → PASS
  - final code 기준 재실행
- `pnpm build` → PASS
- `pnpm e2e:rc` → PASS
- `git diff --check -- src/components/PlanningReportsDashboardClient.tsx src/app/planning/reports/page.tsx src/components/PlanningReportDetailClient.tsx tests/e2e/flow-history-to-report.spec.ts tests/planning-reports-page-fallback.test.tsx tests/planning/reports/reportDashboardOverrides.test.tsx work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-selected-detail-focus-revalidation-alignment-implementation.md` → PASS
- `[미실행] pnpm planning:ssot:check`
  - route policy/catalog 자체는 바꾸지 않았고, existing stable route 안에서 focus/visibility 복귀 시 selected saved detail 재검증만 좁게 추가해 `planning:current-screens:guard`까지만 실행
- `[미실행] tests/planning-reports-page-fallback.test.tsx`
  - 이번 라운드는 dashboard client의 focus 재검증만 다뤄 SSR page fallback fixture는 다시 열지 않음
- `[미실행] tests/planning/reports/reportDashboardOverrides.test.tsx`
  - override disclosure나 report VM 조합은 건드리지 않아 범위 밖으로 유지

## 남은 리스크
- focus/visibility 재검증은 window focus 이벤트나 `visibilitychange` 복귀에만 반응한다. 탭을 떠나지 않은 채 다른 세션에서 삭제가 일어나면 현재 탭은 다음 복귀 전까지 기존 valid CTA를 잠깐 유지할 수 있다.
- 현재 재검증은 dashboard 탭이 다시 foreground로 올 때만 한 번 일어나고, background polling은 하지 않는다. 더 공격적인 freshness가 필요하면 별도 배치에서 product decision으로 다시 열어야 한다.
