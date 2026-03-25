---
name: planning-v3-batch-contract-narrowing
description: Narrow planning v3 batch-family read contracts while preserving stored-first ownership, explicit legacy fallback, public createdAt boundaries, and raw-versus-derived projection semantics. Use when tasks touch batch detail or summary, categorized or cashflow, balances/monthly, draft/profile, batch list or batch center, synthetic stored-only batch discovery, or batch override helper semantics.
---

# Planning v3 Batch Contract Narrowing

Use this skill for small `N2`-style rounds that clarify planning v3 batch-family reader contracts without broad rewrites.

## Inputs

- newest same-day `/work` note, or the newest note from the previous day
- changed files or intended target surface
- whether the round touches detail/summary, categorized/cashflow, balances/draft, batch list/center, or override helpers

## Required workflow

1. Read the newest `/work` note first so the next cut starts from the last narrowed boundary.
2. Pick the narrowest surface before editing:
   - batch detail / summary
   - categorized / cashflow
   - balances / draft profile / draft patch generation
   - batch list / batch center
   - override helper / bridge containment
3. Preserve these invariants unless the task explicitly reopens them:
   - keep writer owner unchanged
   - prefer stored-first readers and keep legacy fallback explicit
   - do not merge legacy unscoped overrides back into user-facing callers
   - keep raw `data` raw and derived projections (`transactions`, `sample`, `accountMonthlyNet`, `stats`) explicit
   - share public `createdAt` decision boundaries even when payload expression differs (`""` vs omission)
   - synthetic stored-only batches may be discovered or ordered on the read side, but do not add write-back or index repair by default
4. When multiple callers share one decision boundary, move the rule into a helper before adding new route-local conditionals.
5. Keep payload shape stable unless the task explicitly changes the contract.
6. Hand verification set selection to `planning-gate-selector` and `/work` note formatting to `work-log-closeout`.

## Surface patterns

- Batch detail / summary
  - touch `src/lib/planning/v3/transactions/store.ts`, `src/app/api/planning/v3/transactions/batches/[id]/route.ts`, `src/lib/planning/v3/service/getBatchSummary.ts`
  - watch `batch`, `sample`, `stats`, `meta`, `data`, and `createdAt`
- Categorized / cashflow
  - touch `src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts`, `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`
  - keep explicit batch-scoped override helpers and stored-first batch readers
- Balances / draft profile
  - touch `src/app/api/planning/v3/balances/monthly/route.ts`, `src/app/api/planning/v3/draft/profile/route.ts`, `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`
  - prefer helper-owned account binding and snapshot policy reads
- Batch list / batch center
  - touch `src/app/api/planning/v3/transactions/batches/route.ts`, `src/app/api/planning/v3/batches/route.ts`
  - keep list discovery, hidden public `createdAt`, and synthetic stored-only handling explicit
- Synthetic stored-only batches
  - list discovery may read `.ndjson` files when index or meta is missing
  - ordering may use deterministic row-date or fallback surrogates
  - public `createdAt` must still respect the synthetic boundary

## Common failure modes

- route-local fallback grows while helper contract stays implicit
- raw rows and derived rows get mixed in the same field without naming it
- hidden public `createdAt` is re-exposed from internal metadata
- a caller imports a generic or compat helper when an explicit batch-scoped helper already exists
- tests cover only one surface while the same rule exists in another surface

## Out of scope by default

- route additions or deletions
- API shape expansion
- beta visibility policy changes
- QA gate or release-doc work
- write-side schema redesign

## Expected outputs

- one narrow code change tied to one batch-family surface
- targeted tests for the touched surface
- `/work` note that names the remaining fallback or contract risk explicitly
