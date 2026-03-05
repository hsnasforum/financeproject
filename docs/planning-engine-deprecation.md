# Planning Engine Legacy Field Deprecation

Last updated: 2026-03-05

## Scope

Legacy top-level fields in planning v2 API responses are deprecated:

- `stage`
- `financialStatus`
- `stageDecision`

Target routes:

- `/api/planning/v2/simulate`
- `/api/planning/v2/optimize`
- `/api/planning/v2/scenarios`
- `/api/planning/v2/actions`
- `/api/planning/v2/debt-strategy`

## Policy

- Primary contract is `engine.*` + `engineSchemaVersion`.
- Legacy top-level fields remain temporary compatibility fields only.
- New UI and tests must not read the top-level fields directly.

## Removal Schedule

1. 2026-03-05: Deprecation started, ESLint guard enabled.
2. 2026-03-12: Freeze date for new legacy consumers (CI violation if added).
3. 2026-03-19: Internal consumer cleanup checkpoint (web + tests fully on `engine.*`).
4. 2026-03-26: Remove top-level fields from v2 response payloads (default plan).

If an external consumer is confirmed, step 4 shifts by one release and the route contract notice is updated with a new absolute date.

## Exit Criteria

- Frontend reads only `response.engine.*`.
- Test fixtures are engine-envelope only.
- Fallback usage is near zero and monitored.
- Removal PR includes route-by-route payload snapshots.

## Related

- Compatibility exit gate and observation policy: `docs/planning-compatibility-exit.md`
