# 2026-03-16 P2-5 stored report meta first pass

## 변경 파일
- `src/lib/planning/reports/storage.ts`
- `src/app/api/planning/v2/reports/route.ts`
- `src/app/api/planning/v2/reports/[id]/route.ts`
- `src/components/PlanningReportsClient.tsx`
- `src/components/PlanningReportDetailClient.tsx`
- `tests/planning-reports/storage.test.ts`
- `tests/planning-v2-api/reports-route.test.ts`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-5-stored-report-meta-first-pass.md`

## 사용 skill
- `route-ssot-check`: `/planning/reports`, `/recommend/history`가 실제 public route이고 current-screens 기준과 어긋나지 않는지 확인하는 데 사용.
- `planning-gate-selector`: stored report meta, reports API, list/detail UI 변경에 맞는 최소 검증을 `vitest`, `pnpm planning:current-screens:guard`, `pnpm build`로 고르는 데 사용.
- `work-log-closeout`: 이번 stored report meta first pass 배치의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- query 기반 reverse link는 이미 열려 있었지만, 저장된 report list/detail은 explicit `recommendRunId`를 따로 소유하지 않아 recommend history 역링크를 유지할 수 없었습니다.
- 이번 라운드는 planning canonical owner를 건드리지 않고, 가장 얇은 sidecar owner인 stored report meta에 optional `recommendRunId`를 추가해 saved report UI에서도 read-only reverse link를 열 수 있게 하는 것이 목적이었습니다.

## 핵심 변경
- `PlanningReportMeta`와 `PlanningReportListItem`에 optional `recommendRunId`를 추가했습니다.
- `createReportFromRun(runId, { recommendRunId? })`가 explicit `recommendRunId`를 받아 stored report meta에 저장하도록 맞췄습니다.
- `/api/planning/v2/reports` POST는 optional `recommendRunId`를 받고, list/detail 응답은 값이 있을 때만 `recommendRunId`를 노출합니다.
- `PlanningReportsClient` 목록과 selected detail은 stored `recommendRunId`가 있을 때만 `/recommend/history?open=<recommendRunId>` 링크를 read-only로 보여 줍니다.
- `PlanningReportDetailClient`도 stored report detail에서 `recommendRunId`를 별도 ID로 보여 주고, 값이 있을 때만 recommend history 역링크를 노출합니다.
- `SavedRecommendRun.runId`, `PlanningRunRecord.id`, `profile.planning.runId`, `PlanningReportMeta.recommendRunId`는 서로 대체하지 않았고, fallback id나 heuristic 연결도 넣지 않았습니다.

## 검증
- `pnpm exec vitest run tests/planning-reports/storage.test.ts tests/planning-v2-api/reports-route.test.ts`
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/lib/planning/reports/storage.ts src/app/api/planning/v2/reports/route.ts src/app/api/planning/v2/reports/[id]/route.ts src/components/PlanningReportsClient.tsx src/components/PlanningReportDetailClient.tsx tests/planning-reports/storage.test.ts tests/planning-v2-api/reports-route.test.ts work/3/16/2026-03-16-p2-5-stored-report-meta-first-pass.md`

## 남은 리스크
- stored report meta에 `recommendRunId`를 저장하는 경로는 열렸지만, 어떤 producer가 이 값을 채울지는 후속 라운드에서 더 좁혀야 합니다.
- 기존 stored report 중 `recommendRunId`가 없는 데이터는 역링크가 없고, 이번 라운드에서는 migration이나 backfill을 추가하지 않았습니다.
- export summary와 raw trace/freshness linkage는 이번 라운드 범위 밖입니다.

## 다음 우선순위
- `P2-5` 후속: report 생성 producer가 언제 `recommendRunId`를 함께 저장할지 최소 경로를 더 좁히기
- stored report/detail의 reverse link가 안정된 뒤 export summary에 같은 ref를 요약 메모 수준으로만 붙일지 재검토
