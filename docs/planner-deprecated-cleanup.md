# Planner Deprecated Cleanup Inventory

Last updated: 2026-03-05

## Removed in P2 Start

- `src/lib/planner/core.ts`
  - `runPlanner()` direct references: 0
  - Removed as dead deprecated path.
- `src/lib/planner/metrics.ts`
  - Replaced by `src/lib/planner/legacyPlanModel.ts`.
- `src/lib/planner/rules.ts`
  - Replaced by `src/lib/planner/legacyPlanModel.ts`.

## Guard

- CI/script guard: `pnpm planner:deprecated:guard`
- Checks:
  - removed files do not reappear,
  - no `lib/planner/metrics` or `lib/planner/rules` import references remain in `src`/`tests`.

## Legacy Report Boundary

- `src/app/report/page.tsx`
- `src/components/ReportClient.tsx`
- `src/lib/report/reportBuilder.ts`
- `src/components/RecommendHistoryClient.tsx`
- `src/components/home/ServiceLinks.tsx`

위 경로는 planning 공식 report 체계가 아니라 legacy `/report` 제품 경로다.

- 데이터 소스:
  - `planner_last_snapshot_v1`
  - recommend saved run local storage
  - disclosure digest / daily brief
- 원칙:
  - 신규 planning 계산/리포트 기능을 이 경로에 추가하지 않는다.
  - planning 공식 report는 `/planning/reports` 및 `src/lib/planning/reports/*`로만 확장한다.
  - `/report` route 자체는 현재 `/planning/reports`로 영구 리다이렉트되며, 남은 legacy UI는 parked transition 코드로만 취급한다.
  - 홈/추천 히스토리에서 legacy `/report`를 언급할 때는 legacy 표기를 유지한다.

## Next Removal Plan

1. Migrate remaining `src/lib/planner/legacyPlanModel.ts` consumer paths to planning engine contracts.
2. Remove parked legacy `/report` UI/runtime code after redirect stability is confirmed.
3. Remove legacy planner UI/API paths after redirect/API shutdown decision.
4. Enforce sunset target for transition layer: 2026-04-30.
