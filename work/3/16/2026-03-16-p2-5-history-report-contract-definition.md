# 2026-03-16 P2-5 history/report contract definition

## 변경 파일
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `analysis_docs/v2/03_DTO_API_명세서.md`
- `analysis_docs/v2/07_history_report_linkage_decision.md`
- `work/3/16/2026-03-16-p2-5-history-report-contract-definition.md`

## 사용 skill
- `work-log-closeout`: 이번 계약 정의 라운드에서 읽은 코드 자산, 문서 결정, 실제 검증 명령을 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- Phase 2 상태판은 `P2-5`가 아직 `[미착수]`였지만, history/report 통합을 구현하려면 먼저 recommend local history id와 planning run id를 어떻게 나눠서 읽고 연결할지 문서로 고정할 필요가 있었습니다.
- 이번 라운드는 구현이 아니라 계약 정의 배치이므로, official planning report 기준과 현재 saved recommend run 구조를 바탕으로 first path를 가장 작게 정하는 것이 목적이었습니다.

## 핵심 변경
- recommend local history owner id는 `SavedRecommendRun.runId`, planning canonical run id는 `PlanningRunRecord.id`, recommend history 안의 planning ref는 `SavedRunProfile.planning.runId`로 분리 고정했습니다.
- history → report first path는 `profile.planning.runId`가 있을 때만 `/planning/reports?runId=...`로 이동하는 경로를 1순위로 정했습니다.
- planning report/export → recommend reverse link는 explicit recommend history id가 planning 쪽에 남기 전까지 자동 latest-match를 하지 않는 원칙으로 정리했습니다.
- freshness / assumptions / trace는 planning report/export가 이미 가진 `snapshot`, `assumptionsLines`, `reproducibility`, interpretation evidence 요약까지만 owner로 인정하고 raw trace 복제는 보류로 남겼습니다.
- `P2-5`는 계약과 first path가 문서로 고정된 상태로 보고 `[진행중]`으로 올렸고, 전체 진행률은 완료 수가 늘지 않아 `62% (8 / 13)`, Phase 2는 `80% (4 / 5)`를 유지했습니다.

## 검증
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md analysis_docs/v2/03_DTO_API_명세서.md analysis_docs/v2/07_history_report_linkage_decision.md work/3/16/2026-03-16-p2-5-history-report-contract-definition.md`
- `git diff --cached --name-only`
- `git diff --check --cached -- analysis_docs/v2/financeproject_next_stage_plan.md analysis_docs/v2/03_DTO_API_명세서.md analysis_docs/v2/07_history_report_linkage_decision.md work/3/16/2026-03-16-p2-5-history-report-contract-definition.md`
- 마지막 `git status --short`

## 남은 리스크
- 현재 `RecommendHistoryClient`의 실제 링크는 아직 local `runId`를 report query에 넣고 있어 구현 라운드에서 canonical field로 바꿔야 합니다.
- reverse link용 explicit recommend history ref는 아직 planning/report/export owner에 저장되지 않았습니다.
- freshness / assumptions / trace를 export에 어떻게 요약 링크로 붙일지는 구현 라운드에서 범위를 더 좁혀야 합니다.

## 다음 우선순위
- `P2-5` first path 구현: recommend history 상세에서 `profile.planning.runId` 기반 planning report 링크로 교체
- reverse link와 export linkage는 first path 이후에 explicit recommend history ref 저장 여부를 따로 결정
