# 2026-03-16 P2-5 report save producer first path

## 변경 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/PlanningReportsClient.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-5-report-save-producer-first-path.md`

## 사용 skill
- `route-ssot-check`: `/planning/reports`와 `/recommend/history` 기존 route만 계속 쓰는지, current-screens 기준과 어긋나지 않는지 확인하는 데 사용.
- `planning-gate-selector`: report save producer와 query 기반 embedded detail open 변경에 맞는 최소 검증을 `pnpm planning:current-screens:guard`, `pnpm build`로 고르는 데 사용.
- `work-log-closeout`: 이번 producer first path 배치의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- stored report meta와 saved report UI는 이미 optional `recommendRunId`를 저장/노출할 수 있었지만, 실제 producer path가 없어 값이 채워지지 않았습니다.
- 이번 라운드는 `/planning/reports` 대시보드에서 현재 선택 run을 저장할 때 query의 explicit `recommendRunId`를 함께 POST하고, 생성 직후 embedded saved report detail이 열리도록 최소 경로를 추가하는 것이 목적이었습니다.

## 핵심 변경
- `PlanningReportsDashboardClient`에 `리포트 저장` 버튼을 추가하고, 현재 선택 run으로 `/api/planning/v2/reports` POST를 호출하도록 했습니다.
- POST body는 항상 `runId: selectedRun.id`를 보내고, 현재 query에 explicit `recommendRunId`가 있을 때만 `recommendRunId`를 함께 보냅니다.
- 저장 성공 시 현재 `/planning/reports` query에 `selected=<createdReportId>`를 붙여 같은 화면에서 embedded saved report detail이 바로 열리도록 했습니다.
- 기존 `runId`, `baseRunId`, `recommendRunId` query는 유지하고, `showAdvancedRaw`를 열어 생성 직후 저장 리포트 패널이 보이게 했습니다.
- `PlanningReportsClient`는 `selected` query가 바뀌면 기존 선택보다 query 값을 우선 읽어 새로 만든 saved report detail을 즉시 열 수 있게 맞췄습니다.
- fallback id나 heuristic은 추가하지 않았고, `SavedRecommendRun.runId`, `PlanningRunRecord.id`, `PlanningReportMeta.recommendRunId`를 서로 대체하지 않았습니다.

## 검증
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/components/PlanningReportsDashboardClient.tsx src/components/PlanningReportsClient.tsx work/3/16/2026-03-16-p2-5-report-save-producer-first-path.md`

## 남은 리스크
- 이번 라운드는 report save producer first path만 열었으므로, 다른 producer surface는 여전히 `recommendRunId`를 저장하지 않습니다.
- `recommendRunId`가 없는 기존 saved report는 역링크가 없고, migration이나 backfill은 추가하지 않았습니다.
- export summary나 report-side persistence 확장은 이번 범위 밖입니다.

## 다음 우선순위
- `P2-5` 후속: 어떤 producer surface가 stored report 생성 시 `recommendRunId`를 더 채워야 하는지 범위를 더 좁히기
- report/export reverse link는 explicit ref가 저장된 경우에만 summary 수준으로 연결 범위를 확장할지 재검토
