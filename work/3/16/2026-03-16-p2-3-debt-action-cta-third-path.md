# 2026-03-16 P2-3 debt action CTA third path

## 변경 파일
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-3-debt-action-cta-third-path.md`

## 사용 skill
- `planning-gate-selector`: route/link 영향 기준으로 이번 라운드의 최소 검증을 `pnpm build`와 `pnpm planning:current-screens:guard`로 고르는 데 사용.
- `route-ssot-check`: debt CTA가 실존 public route인 `/products/credit-loan`를 가리키는지 확인하는 데 사용.
- `work-log-closeout`: third path 범위의 변경 파일, 검증, 잔여 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P2-3`까지는 `BUILD_EMERGENCY_FUND`, `COVER_LUMP_SUM_GOAL` 두 action code만 CTA가 열려 있었습니다.
- 이번 라운드는 `REDUCE_DEBT_SERVICE` 한 건만 관련 public debt route로 연결해, action-based CTA의 세 번째 경로를 가장 작은 범위로 여는 것이 목적이었습니다.

## 핵심 변경
- `ReportDashboard`의 top action 카드에서 `action.code === "REDUCE_DEBT_SERVICE"`일 때만 CTA를 노출합니다.
- CTA는 새 route를 만들지 않고, 기존 `PLANNER_ACTION_LINKS.creditLoanProducts.href`인 `/products/credit-loan`을 그대로 재사용합니다.
- 기존 `BUILD_EMERGENCY_FUND`, `COVER_LUMP_SUM_GOAL` CTA 동작과 query handoff는 그대로 유지했습니다.
- 이번 라운드는 debt action 1건만 열었고, `IMPROVE_RETIREMENT_PLAN` 같은 다른 action code는 열지 않았습니다.

## 검증
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/app/planning/reports/_components/ReportDashboard.tsx work/3/16/2026-03-16-p2-3-debt-action-cta-third-path.md`

## 남은 리스크
- debt CTA는 현재 `/products/credit-loan` 고정 링크만 연결하므로, 부채 구조나 DSR 맥락을 더 좁힌 deep link는 아직 없습니다.
- `IMPROVE_RETIREMENT_PLAN` 같은 다른 action code는 아직 CTA 매핑이 없습니다.
- 이번 라운드는 recommend explanation을 더 확장하지 않았으므로, debt CTA는 결과 설명 연결 없이 별도 public catalog로만 이동합니다.

## 다음 우선순위
- `P2-3` 후속: `IMPROVE_RETIREMENT_PLAN` 같은 다음 action code 1건을 열지 여부 결정
- `P2-4` 후속: 이미 열린 recommend CTA 두 건의 결과 설명을 카드 why와 어디까지 연결할지 범위 좁히기
