# Planning Run Engine Migration Policy

Last updated: 2026-03-05

## Goal

Reduce legacy runs without breaking read paths while keeping compatibility during transition.

## Strategy

Default strategy is lazy migration:

1. Read run.
2. If `outputs.engine` or `outputs.engineSchemaVersion` is missing/legacy:
   - recover engine envelope from available legacy fields or result DTO,
   - persist back with `engineSchemaVersion: 1`.
3. Continue serving migrated run.

Fallback usage is counted to drive removal timing.

## Optional Batch Backfill

Batch migration is optional and enabled only if lazy migration convergence is too slow:

- scan all run partitions,
- apply the same migration utility,
- report migrated/fail counts.

## Implementation Notes

- Migration utility: `src/lib/planning/store/engineEnvelopeMigration.ts`
- Read path integration: `src/lib/planning/store/runStore.ts` (`readRunMetaByPath`)
- Metrics: `legacyRunEngineMigrationCount` in planning fallback snapshot.

## Exit Criteria

- New runs: 100% include `outputs.engine` + `engineSchemaVersion`.
- Legacy reads: migration counter trends down over time.
- Report contract fallback becomes rare enough to remove safely.
