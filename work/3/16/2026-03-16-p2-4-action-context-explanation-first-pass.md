# 2026-03-16 P2-4 action-context explanation first pass

## 변경 파일
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `src/app/recommend/page.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-4-action-context-explanation-first-pass.md`

## 사용 skill
- `planning-gate-selector`: route/page/query 영향 기준으로 이번 라운드의 최소 검증을 `pnpm build`로 고르는 데 사용.
- `route-ssot-check`: report CTA가 계속 실존 public route인 `/recommend`를 가리키는지 확인하는 데 사용.
- `work-log-closeout`: 이번 explanation first pass 배치의 변경 파일, 검증, 잔여 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P2-3`까지는 planning report의 top action 카드에서 `/recommend`로 바로 이동하는 CTA 두 건이 열렸지만, 결과 화면에서는 어떤 action 맥락으로 들어온 추천인지 즉시 읽기 어려웠습니다.
- 이번 라운드는 recommend API나 saved run 계약을 다시 열지 않고, 결과 화면 설명 블록에서 action context를 읽을 수 있게 하는 view-only first pass를 여는 것이 목적이었습니다.

## 핵심 변경
- `ReportDashboard`의 action CTA 링크에 view-only query인 `planning.actionCode`를 추가했습니다.
- 이번 라운드에서 허용한 action code는 `BUILD_EMERGENCY_FUND`, `COVER_LUMP_SUM_GOAL` 두 건뿐입니다.
- `/recommend`는 `from=planning-report`와 `planning.actionCode`를 함께 읽어, 기존 planning context strip의 제목과 설명을 action 맥락형 문구로 바꿉니다.
- strip에는 `연결된 액션`, `단계`, `연결 방식`, `실행 상태`, `플래닝 실행 ID`를 함께 보여 주어 현재 recommendation이 어떤 planning 결과와 이어졌는지 바로 읽을 수 있게 했습니다.
- action context는 query 기반 view-only 경로로만 쓰고, recommend API request, saved run, 영속 모델에는 넣지 않았습니다.

## 검증
- `rg --files src/app -g 'page.tsx' | rg '^src/app/recommend/page.tsx$'`
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/app/planning/reports/_components/ReportDashboard.tsx src/app/recommend/page.tsx work/3/16/2026-03-16-p2-4-action-context-explanation-first-pass.md`

## 남은 리스크
- 이번 라운드는 결과 화면 상단 strip 설명만 확장했고, 추천 카드별 상세 why나 CTA별 결과 차별화 설명까지는 아직 연결하지 않았습니다.
- `REDUCE_DEBT_SERVICE`, `IMPROVE_RETIREMENT_PLAN` 같은 다른 action code는 아직 view-only 설명 분기가 없습니다.
- action context는 query 기반이라 history 재진입이나 저장된 결과 재열람에서는 그대로 보존되지 않습니다. 이 부분은 아직 `P2-5` 범위입니다.

## 다음 우선순위
- `P2-4` 후속: 현재 strip 수준 설명을 추천 결과 목록이나 카드별 why와 어디까지 연결할지 범위 좁히기
- `P2-3` 후속: `REDUCE_DEBT_SERVICE`처럼 다음 action code 1건을 열지 여부 결정
