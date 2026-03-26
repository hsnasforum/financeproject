# 2026-03-26 v3 import-to-planning beta stable-report destination copy-empty-state alignment implementation

## 변경 파일
- `src/app/planning/reports/page.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `tests/planning-reports-page-fallback.test.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-stable-report-destination-copy-empty-state-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: report route copy round의 실행 검증과 미실행 조건부 검증을 smallest set으로 고르기 위해 사용.
- `route-ssot-check`: `/planning/reports`, `/planning/reports/[id]`, `/planning/runs`의 stable/public route 계약을 유지한 채 wording만 다루는지 확인하기 위해 사용.
- `work-log-closeout`: 변경 전 메모를 먼저 남기고, 구현 후 실제 변경/검증/잔여 리스크를 같은 파일에 정리하기 위해 사용.

## 변경 이유
- stable `/planning` quickstart 도착까지는 정리됐지만, `/planning/reports` 자체의 header/empty-state/helper copy는 아직 import-to-planning beta funnel의 최종 도착점 문맥으로 완전히 맞춰져 있지 않다.
- 이번 라운드는 route/href 구조나 report contract를 바꾸지 않고, stable `/planning/reports`를 `결과 저장 뒤 다시 읽는 도착점`으로 더 자연스럽게 읽히게 만드는 smallest safe batch가 목적이었다.

## 핵심 변경
- `src/app/planning/reports/page.tsx`의 empty-state `PageHeader`를 `플래닝 리포트` 기준으로 통일하고, top action/link와 설명을 `저장된 실행 결과를 다시 읽는 도착 화면` 문맥으로 다시 썼다.
- 같은 파일의 `EmptyState` 문구를 `먼저 /planning에서 실행을 저장해 둔 뒤 여기서 저장된 결과를 다시 보고 실행 기록 화면과 비교한다`는 쉬운 한국어 계약으로 맞췄다.
- `PlanningReportsDashboardClient.tsx`의 상단 설명과 helper copy를 `새 entry`가 아니라 `저장된 결과를 다시 확인하는 stable destination`으로 읽히게 정리했다.
- dashboard 내부 empty state card의 heading/body/button copy를 `플래닝에서 실행 저장 -> reports로 돌아와 다시 읽기 -> runs에서 비교` 축으로 더 분명히 나눴다.
- `tests/planning-reports-page-fallback.test.tsx`에 no-runs empty-state copy 케이스를 추가하고, `tests/e2e/flow-history-to-report.spec.ts`에 reports 화면의 destination helper 문구 확인을 추가했다.

## 검증
- `pnpm test tests/planning-reports-page-fallback.test.tsx`
  - 결과: PASS
- `pnpm lint`
  - 결과: PASS
  - 비고: 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- `pnpm build`
  - 결과: PASS
- `pnpm e2e:rc`
  - 결과: PASS
- `git diff --check -- src/app/planning/reports/page.tsx src/components/PlanningReportsDashboardClient.tsx src/app/planning/reports/[id]/page.tsx tests/planning-reports-page-fallback.test.tsx tests/e2e/flow-history-to-report.spec.ts work/3/26/2026-03-26-v3-import-to-planning-beta-stable-report-destination-copy-empty-state-alignment-implementation.md`
- [미실행] `pnpm test tests/planning/reports/reportDashboardOverrides.test.tsx` — report VM, overrides panel, metric evidence contract는 바꾸지 않았고 이번 라운드 dashboard copy는 `flow-history-to-report` e2e로 확인했다.
- [미실행] `pnpm planning:current-screens:guard` — route/href/query semantics를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard 자체를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- 이번 라운드는 wording만 조정했고 `/planning/reports`의 run selection, compare mode, fetch fallback, query handling은 건드리지 않았다. destination tier는 더 분명해졌지만 contract 자체는 그대로다.
- e2e는 stable reports landing에서 공통 destination helper 문구가 보이는지까지 확인했지만, no-runs empty state는 서버 렌더 테스트로만 직접 검증했다.
- `docs/current-screens.md`와 route catalog는 건드리지 않았다. `/planning/reports`, `/planning/reports/[id]`, `/planning/runs`는 계속 stable public route로 유지된다.
