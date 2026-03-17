# 2026-03-16 P2-5 history to report first path

## 변경 파일
- `src/components/RecommendHistoryClient.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-5-history-to-report-first-path.md`

## 사용 skill
- `route-ssot-check`: `/planning/reports`가 실제 public route이고 `current-screens` 기준과 어긋나지 않는지 확인하는 데 사용.
- `planning-gate-selector`: history 링크 변경에 맞는 최소 검증을 `pnpm planning:current-screens:guard`, `pnpm build`로 고르는 데 사용.
- `work-log-closeout`: 이번 first path 배치의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- recommend history의 기존 `리포트 →` 링크는 `SavedRecommendRun.runId`를 그대로 `/planning/reports?runId=...`에 넣고 있어 local history id를 planning run id처럼 잘못 사용하고 있었습니다.
- 이번 라운드는 schema migration 없이도 이미 저장되는 `profile.planning.runId`를 기준으로 history → planning report first path를 올바르게 여는 것이 목적이었습니다.

## 핵심 변경
- history 목록의 report 링크는 이제 `run.profile.planning?.runId`가 있을 때만 보이고, href도 `/planning/reports?runId=<planningRunId>`로 바뀌었습니다.
- `planning.runId`가 없는 기존 history row는 링크를 숨기고 `연결된 플래닝 실행 없음` 안내만 읽기 전용으로 노출합니다.
- active run 상세 카드에는 `추천 실행 ID`와 `플래닝 실행 ID`를 따로 보여 주고, planning run id가 있을 때만 `플래닝 리포트로 이동` 버튼을 노출합니다.
- recommend local history id와 planning run id를 같은 값처럼 쓰는 기존 경로는 제거했고, 새 fallback id는 만들지 않았습니다.

## 검증
- `rg --files src/app -g 'page.tsx' | rg '^src/app/planning/reports/page.tsx$|^src/app/recommend/history/page.tsx$'`
- `rg -n '/planning/reports|/recommend/history' docs/current-screens.md`
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/components/RecommendHistoryClient.tsx work/3/16/2026-03-16-p2-5-history-to-report-first-path.md`
- `git diff --cached --name-only`
- `git diff --check --cached -- analysis_docs/v2/financeproject_next_stage_plan.md src/components/RecommendHistoryClient.tsx work/3/16/2026-03-16-p2-5-history-to-report-first-path.md`
- 마지막 `git status --short`

## 남은 리스크
- 기존 history row 중 `profile.planning.runId`가 없는 기록은 여전히 report 역이동이 불가능하고, 이번 라운드에서는 migration이나 fallback을 추가하지 않았습니다.
- planning report/export 쪽 reverse link는 아직 열지 않았습니다.
- reverse ref용 explicit recommend history id 저장은 별도 후속 범위입니다.

## 다음 우선순위
- `P2-5` 후속: planning report/export에서 explicit recommend history ref를 어떤 최소 필드로 받을지 다시 좁히기
- history/report 역링크를 열더라도 latest-match 같은 추론 없이 explicit owner 기준으로만 여는 방향 유지
