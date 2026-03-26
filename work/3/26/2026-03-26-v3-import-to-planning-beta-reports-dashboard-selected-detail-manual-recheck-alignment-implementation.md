# 2026-03-26 v3 import-to-planning beta reports-dashboard selected-detail-manual-recheck alignment implementation

## 변경 전 메모
1. 수정 대상 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- 필요하면 관련 테스트 파일

2. 변경 이유
- 현재는 focus/visibility 복귀 시에만 selected saved detail을 재검증하므로, 같은 탭에 계속 머무는 사용자는 상태 변경을 직접 확인할 방법이 없다.

3. 실행할 검증 명령
- `pnpm planning:current-screens:guard`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1`
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`

## 변경 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-selected-detail-manual-recheck-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: reports dashboard manual recheck 배치에 맞춰 `planning:current-screens:guard`, narrow e2e, `lint`, `build`, `e2e:rc` 조합을 유지하는 데 사용.
- `route-ssot-check`: `/planning/reports`와 `/planning/reports/[id]`의 existing stable route/query contract를 유지하고 route·href 재설계를 열지 않았는지 확인하는 데 사용.
- `work-log-closeout`: `/work` 종료 기록 형식, 실행한 검증, 미실행 검증, 남은 리스크를 저장소 규칙에 맞춰 남기는 데 사용.

## 변경 이유
- 현재는 focus/visibility 복귀 시에만 selected saved detail을 재검증하므로, 같은 탭에 계속 머무는 사용자는 상태 변경을 직접 확인할 방법이 없었다.
- `/planning/reports`는 기본 destination tier라, 사용자가 탭을 떠나지 않아도 helper 영역 안에서 selected saved detail을 다시 확인하고 stale 상태로 자연스럽게 강등시킬 수 있어야 했다.

## 핵심 변경
- `PlanningReportsDashboardClient`에 `showSavedReportRecheckAction`과 `handleSavedReportManualRecheck`를 추가해, selected saved detail이 valid 또는 stale로 확정된 상태에서만 helper 영역 안에 `상태 다시 확인` tertiary action을 노출했다.
- manual recheck는 기존 selected saved detail validation 경로를 그대로 재사용하고, 클릭 시 `validated/invalid` 상태를 비워 pending helper로 잠깐 내린 뒤 기존 fetch 검증 결과로 valid 또는 stale로 다시 정리되게 유지했다.
- focus/visibility 복귀 재검증은 기존 `useEffectEvent` 기반 one-shot recheck로 남겨 두고, click handler는 별도 plain handler를 써 `useEffectEvent`를 직접 JSX에서 호출하지 않게 정리했다.
- saved detail notice 영역은 valid일 때 `저장된 상세 리포트 열기` + `상태 다시 확인`, stale일 때 `상태 다시 확인`만 남기고, pending일 때는 action을 숨겨 secondary CTA가 검증 완료 뒤에만 열리게 유지했다.
- `flow-history-to-report` e2e에 `valid -> helper의 상태 다시 확인 클릭 -> pending helper -> 404 stale helper` 시나리오를 추가해 manual recheck affordance를 직접 확인했다.

## 검증
- `pnpm planning:current-screens:guard` → PASS
- `pnpm lint` → 1차 FAIL
  - `PlanningReportsDashboardClient.tsx`에서 `useEffectEvent` 반환 함수를 click handler에서 직접 호출해 `react-hooks/rules-of-hooks` error 발생
- `pnpm planning:current-screens:guard` → PASS
  - click handler를 plain function으로 분리한 final code 기준 재실행
- `pnpm lint` → 2차 PASS
  - 기존 warning 24건 유지, 새 error 없음
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1` → PASS
  - manual recheck 신규 시나리오 포함 9 passed
- `pnpm build` → PASS
- `pnpm e2e:rc` → PASS
  - 22 passed
- `git diff --check -- src/components/PlanningReportsDashboardClient.tsx src/app/planning/reports/page.tsx src/components/PlanningReportDetailClient.tsx tests/e2e/flow-history-to-report.spec.ts tests/planning-reports-page-fallback.test.tsx tests/planning/reports/reportDashboardOverrides.test.tsx work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-selected-detail-manual-recheck-alignment-implementation.md` → PASS
- `[미실행] pnpm planning:ssot:check`
  - route policy/catalog를 바꾸지 않았고 existing `/planning/reports` selected-detail helper 안에 수동 재검증 action만 좁게 추가해 `planning:current-screens:guard`까지만 실행
- `[미실행] tests/planning-reports-page-fallback.test.tsx`
  - 이번 라운드는 dashboard client의 manual recheck helper만 다뤄 SSR page fallback fixture는 다시 열지 않음
- `[미실행] tests/planning/reports/reportDashboardOverrides.test.tsx`
  - override disclosure나 report VM 조합은 건드리지 않아 범위 밖으로 유지

## 남은 리스크
- manual recheck는 helper 영역의 명시적 클릭이나 focus/visibility 복귀가 있어야만 동작한다. 사용자가 같은 탭에 머문 채 아무 action도 하지 않으면 기존 valid helper는 다음 재검증 전까지 유지될 수 있다.
- pending helper는 manual recheck 뒤 검증 응답이 실제로 남아 있는 짧은 구간에만 보인다. 응답이 매우 빠른 환경에서는 pending 상태가 거의 인지되지 않을 수 있다.
