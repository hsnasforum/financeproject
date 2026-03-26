# 2026-03-26 v3 import-to-planning beta runs-to-report valid-handoff contract alignment implementation

## 변경 전 메모
1. 수정 대상 파일
- `src/components/PlanningRunsClient.tsx`
- 필요하면 관련 테스트 파일
2. 변경 이유
- 현재 `/planning/runs`의 selected single-run CTA는 `/planning/reports/${selectedRun.id}`를 가리키지만, `/planning/reports/[id]`는 saved report id를 기대한다.
- latest `/work`에서 e2e로 드러난 이 mismatch를 이제 실제 valid handoff contract로 정리해야 한다.
3. 실행할 검증 명령
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- 필요하면 관련 테스트 추가 또는 확장

## 변경 파일
- `src/components/PlanningRunsClient.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-runs-to-report-valid-handoff-contract-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: href/query semantics를 실제로 바꾸는 round로 분류하고 `planning:current-screens:guard`, `lint`, `build`, `e2e:rc`, `git diff --check`까지 필요한 최소 게이트를 고르기 위해 사용.
- `route-ssot-check`: `/planning/runs`, `/planning/reports`, `/planning/reports/[id]`의 stable/public route 분리를 유지한 채 single-run CTA href만 valid existing contract로 바꾸는지 확인하기 위해 사용.
- `work-log-closeout`: 변경 전 메모를 먼저 남기고, 실제 실행한 검증과 남은 리스크를 같은 `/work` 파일에 정리하기 위해 사용.

## 변경 이유
- single-run CTA가 invalid saved-report detail path를 가리키고 있었고, 실제 detail route는 saved report id만 받는 contract라 `/planning/runs -> /planning/reports/[id]` handoff가 깨져 있었다.
- 이번 라운드에서는 새 route나 schema를 만들지 않고, 이미 존재하는 valid stable destination contract인 `/planning/reports?runId=...`로 smallest safe batch를 닫는 것이 목적이었다.

## 핵심 변경
- `src/components/PlanningRunsClient.tsx`의 selected single-run CTA href를 `/planning/reports/${selectedRun.id}`에서 `/planning/reports?runId=${selectedRun.id}`로 바꾸고 `profileId` query는 그대로 유지했다.
- 같은 selected card의 description, helper, CTA copy를 `상세 리포트`가 아니라 `리포트 화면` 기준으로 최소 조정해 실제 destination tier와 wording이 모순되지 않게 맞췄다.
- compare CTA인 `상세 비교 리포트 열기`와 compare helper는 그대로 두어 single-run stable destination과 compare report destination을 섞지 않았다.
- `tests/e2e/flow-history-to-report.spec.ts`에서 selected/compare state helper 검증 뒤 single-run CTA를 직접 클릭해 `/planning/reports?runId=...&profileId=...`로 이동하는지, `report-dashboard`가 열리고 selector 값이 선택한 run id로 맞는지 확인하도록 보강했다.
- `docs/current-screens.md`는 바꾸지 않았고, existing stable route inventory 안에서 href/query semantics만 정리했다.

## 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1`
  - 결과: PASS
  - 비고: single-run CTA handoff와 saved report detail destination helper를 포함한 4개 테스트 통과.
- `pnpm planning:current-screens:guard`
  - 결과: PASS
  - 비고: stable public route 간 href/query semantics 변경이 current-screens 기준과 충돌하지 않음을 확인.
- `pnpm lint`
  - 결과: PASS
  - 비고: 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- `pnpm build`
  - 결과: PASS
- `pnpm e2e:rc`
  - 결과: PASS
  - 비고: 총 17개 테스트 통과.
- `git diff --check -- src/components/PlanningRunsClient.tsx src/app/planning/reports/page.tsx src/components/PlanningReportsDashboardClient.tsx src/components/PlanningReportDetailClient.tsx tests/e2e/flow-history-to-report.spec.ts tests/e2e/flow-planner-to-history.spec.ts work/3/26/2026-03-26-v3-import-to-planning-beta-runs-to-report-valid-handoff-contract-alignment-implementation.md`
  - 결과: PASS
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard 자체를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- 이번 라운드는 invalid href를 valid existing contract로 바꾸는 데만 집중했고, report schema, saved report 생성 규칙, compare 계산, entry policy는 건드리지 않았다.
- single-run CTA는 이제 stable `/planning/reports?runId=...`로 닫히고, saved report detail(`/planning/reports/[id]`)는 여전히 reports 화면에서 별도로 보관한 뒤 여는 tier로 남는다. 즉, runs에서 곧바로 saved report detail을 만드는 동작은 의도적으로 추가하지 않았다.
- `src/components/PlanningReportsDashboardClient.tsx`의 `selectedRunDetailHref` unused warning은 기존 상태 그대로 남아 있다. 이번 라운드 범위에서는 dashboard 내부 contract를 다시 열지 않았다.
