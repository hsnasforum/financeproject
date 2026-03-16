# 2026-03-16 P2-5 reverse-link ref definition

## 변경 파일
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `analysis_docs/v2/03_DTO_API_명세서.md`
- `analysis_docs/v2/07_history_report_linkage_decision.md`
- `work/3/16/2026-03-16-p2-5-reverse-link-ref-definition.md`

## 사용 skill
- `work-log-closeout`: 이번 reverse-link 계약 정의 라운드의 문서 변경, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- history → report first path는 이미 열렸지만, planning report/export에서 recommend history로 돌아가는 역방향 링크는 explicit recommend history ref가 없어 아직 열 수 없는 상태였습니다.
- 이번 라운드는 reverse link 구현을 열기 전에, 어떤 최소 필드로 recommend local history ref를 받을지 문서로 먼저 고정하는 것이 목적이었습니다.

## 핵심 변경
- reverse link용 explicit ref value는 recommend local history id인 `SavedRecommendRun.runId`를 쓰고, canonical field name은 `[권장안] recommendRunId`로 고정했습니다.
- reverse ref owner 위치는 `PlanningRunRecord` core schema가 아니라 planning canonical owner를 해치지 않는 얇은 report-side metadata / read-model projection으로 제한했습니다.
- canonical reverse href는 `/recommend/history?open=<recommendRunId>`로 고정했습니다.
- reverse link first path는 planning report UI에서 explicit `recommendRunId`가 있을 때만 read-only로 노출하고, export summary는 그 다음 순서로 붙이는 방향으로 정리했습니다.
- `latest-match`, 시간대 추정, `PlanningRunRecord.id` / `SavedRecommendRun.runId` / `profile.planning.runId` 혼용은 금지 규칙으로 더 분명히 적었습니다.
- `P2-5`는 contract와 first path가 더 구체화된 상태로 보되, reverse ref 구현은 아직 열지 않았으므로 `[진행중]` 상태를 유지했습니다.

## 검증
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md analysis_docs/v2/03_DTO_API_명세서.md analysis_docs/v2/07_history_report_linkage_decision.md work/3/16/2026-03-16-p2-5-reverse-link-ref-definition.md`

## 남은 리스크
- `recommendRunId`를 실제로 어느 report-side metadata에 저장할지는 구현 라운드에서 더 구체화해야 합니다.
- export summary에 reverse link를 붙이는 범위는 UI first path가 안정된 뒤 다시 좁혀야 합니다.
- 기존 planning report/export 자산에는 explicit recommend history ref가 아직 없으므로, 이번 라운드 문서는 implementation contract만 고정한 상태입니다.

## 다음 우선순위
- `P2-5` first implementation path: planning report UI에서 explicit `recommendRunId`가 있을 때만 `/recommend/history?open=...` 링크를 여는 read-only 경로 구현
- reverse ref를 저장하더라도 `PlanningRunRecord.id`나 heuristic matching으로 대체하지 않고 explicit owner 기준만 유지
