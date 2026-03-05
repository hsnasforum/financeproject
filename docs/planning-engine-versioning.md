# Planning Engine Versioning Rules

Last updated: 2026-03-05

## Current Version

- `engineSchemaVersion: 1`
- Meaning: first standardized `engine` envelope contract (`stage`, `financialStatus`, `stageDecision`).

## Version Bump Rules

Increase `engineSchemaVersion` when any of the following changes:

- Remove a required field under `engine`.
- Change field semantics in a non-backward-compatible way.
- Change run persistence shape for `outputs.engine` that requires migration logic.

Do not bump for:

- Additive optional fields that keep existing consumers valid.
- Internal refactors without contract change.

## Compatibility Rules

- Reader must accept current and older versions supported by migration policy.
- Legacy top-level fallback is allowed only for pre-envelope runs and is tracked.
- New writes must always persist `outputs.engine` and `outputs.engineSchemaVersion`.

## Operational Rules

- Any version bump PR must include:
  - contract diff summary,
  - migration path (`lazy` and/or `batch`),
  - rollback/fallback boundary.
- Remove fallback branches only after measured usage reaches agreed threshold.
