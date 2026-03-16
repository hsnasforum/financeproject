# 2026-03-16 P2-5 report to history first path

## 변경 파일
- `src/components/RecommendHistoryClient.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-5-report-to-history-first-path.md`

## 사용 skill
- `route-ssot-check`: `/planning/reports`, `/recommend/history`가 실제 public route이고 current-screens 기준과 어긋나지 않는지 확인하는 데 사용.
- `planning-gate-selector`: history/report 링크 변경에 맞는 최소 검증을 `pnpm planning:current-screens:guard`, `pnpm build`로 고르는 데 사용.
- `work-log-closeout`: 이번 reverse link first path 배치의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- history → report first path는 이미 `profile.planning.runId` 기준으로 열렸지만, planning report에서 recommend history로 돌아가는 역링크는 아직 없었습니다.
- 이번 라운드는 reverse ref persistence 없이도, history에서 report로 들어올 때 explicit `recommendRunId` query를 함께 넘기고 report UI에서 그 값이 있을 때만 read-only 역링크를 여는 것이 목적이었습니다.

## 핵심 변경
- `RecommendHistoryClient`의 planning report 링크는 이제 `runId=<planningRunId>&recommendRunId=<savedRecommendRunId>`를 함께 넘깁니다.
- `PlanningReportsDashboardClient`는 `recommendRunId` query를 직접 읽고, 현재 선택된 report가 query의 `runId`와 일치할 때만 `/recommend/history?open=<recommendRunId>` 링크를 상단 action에 노출합니다.
- report 첫 카드에는 `연결된 추천 실행 ID`를 read-only로 보여 주고, 다른 report로 전환하면 역링크를 숨깁니다.
- `SavedRecommendRun.runId`, `PlanningRunRecord.id`, `profile.planning.runId`를 서로 대체하지 않았고, fallback id나 latest-match도 추가하지 않았습니다.
- `P2-5`는 reverse link first path 1건을 연 상태로 유지하되, export/persistence 역방향 ref는 후속 범위로 남겼습니다.

## 검증
- `rg --files src/app -g 'page.tsx' | rg '^src/app/planning/reports/page.tsx$|^src/app/recommend/history/page.tsx$'`
- `rg -n '/planning/reports|/recommend/history' docs/current-screens.md`
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/components/RecommendHistoryClient.tsx src/components/PlanningReportsDashboardClient.tsx work/3/16/2026-03-16-p2-5-report-to-history-first-path.md`

## 남은 리스크
- 현재 reverse link는 query 기반이라, report UI에서 다른 실행으로 바꾸면 link를 숨기는 방식으로만 안전성을 지킵니다.
- planning report/export 쪽에 explicit `recommendRunId`를 저장하지는 않았으므로, direct report revisit에서는 아직 reverse link가 없습니다.
- export summary linkage와 persistence owner는 별도 후속 범위입니다.

## 다음 우선순위
- `P2-5` 후속: planning report-side metadata에 explicit `recommendRunId`를 어떤 최소 위치로 둘지 구현 범위를 더 좁히기
- export summary는 UI reverse link가 안정된 뒤 같은 ref를 요약 메모 수준으로만 붙이는 방향 유지
