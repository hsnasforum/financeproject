# 2026-03-16 P2-3 goal action CTA second path

## 변경 파일
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-3-goal-action-cta-second-path.md`

## 사용 skill
- `planning-gate-selector`: report dashboard 링크 변경에 맞는 최소 검증을 `pnpm build`로 유지하는 데 사용.
- `route-ssot-check`: 새 CTA가 실존 public route인 `/recommend`를 계속 가리키는지 확인하는 데 사용.
- `work-log-closeout`: second path 범위의 변경 파일, 검증, 잔여 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P2-3` first path에서는 `BUILD_EMERGENCY_FUND` 1건만 `/recommend` CTA로 연결되어 있었습니다.
- 이번 라운드는 top action 카드에서 `COVER_LUMP_SUM_GOAL` 1건만 추가로 열어, action-based CTA의 두 번째 경로를 가장 작은 범위로 이어 붙이는 것이 목적이었습니다.

## 핵심 변경
- `ReportDashboard`의 top action 카드에서 `action.code === "COVER_LUMP_SUM_GOAL"`일 때만 CTA를 노출합니다.
- CTA는 `src/lib/planner/compute.ts`에 이미 있던 `PLANNER_ACTION_LINKS.savingRecommend` preset을 그대로 재사용합니다.
- 링크 조합은 기존 `buildActionRecommendHref(...)` 패턴을 그대로 써서 `planning.runId`, `planning.summary.stage`, optional `planning.summary.overallStatus`, `from=planning-report`를 함께 유지합니다.
- 이번 라운드에서도 다른 action code는 열지 않았고, 현재 action-based CTA가 붙은 코드는 `BUILD_EMERGENCY_FUND`, `COVER_LUMP_SUM_GOAL` 두 건뿐입니다.

## 검증
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/app/planning/reports/_components/ReportDashboard.tsx work/3/16/2026-03-16-p2-3-goal-action-cta-second-path.md`

## 남은 리스크
- `REDUCE_DEBT_SERVICE`, `IMPROVE_RETIREMENT_PLAN` 같은 다른 action code는 아직 CTA 매핑이 없습니다.
- 현재 CTA 분기는 `ReportDashboard` 안에서 최소 조건 분기로만 열어 둔 상태라, action-to-preset 매핑 표준화는 후속 라운드가 필요합니다.
- recommend 결과 explanation은 현재 `P2-2` context strip 수준까지만 이어져 있고, action 요약 설명까지는 아직 연결되지 않았습니다.

## 다음 우선순위
- `P2-3` 후속: 다른 action code를 더 열기 전에 현재 두 CTA가 recommend 결과 설명과 어디까지 자연스럽게 이어지는지 확인
- `P2-4`: recommend 결과 explanation을 action 맥락까지 얼마나 확장할지 범위 결정
