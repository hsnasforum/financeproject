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

## Next Removal Plan

1. Migrate remaining `src/lib/planner/legacyPlanModel.ts` consumer paths to planning engine contracts.
2. Remove legacy planner UI/API paths after redirect/API shutdown decision.
3. Enforce sunset target for transition layer: 2026-04-30.
