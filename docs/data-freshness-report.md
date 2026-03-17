# Data Freshness Report

- Generated at: 2026-03-16T13:49:54.176Z
- Mode: warn

## Source Thresholds

| Source | maxAgeDays |
| --- | ---: |
| finlife | 3 |
| benefits | 7 |
| gov24 | 7 |

## Snapshot Status

| File | Source | generatedAt | ageDays | maxAgeDays | Status |
| --- | --- | --- | ---: | ---: | --- |
| benefits_snapshot.json | benefits | 2026-03-05T10:52:48.247Z | 11.12 | 7 | stale |
| exchange_snapshot.json | other | 2026-03-05T10:52:48.726Z | 11.12 | 7 | stale |
| finlife_credit-loan_snapshot.json | finlife | 2026-02-27T01:58:15.745Z | 17.49 | 3 | stale |
| finlife_deposit_snapshot.json | finlife | 2026-03-16T13:46:29.268Z | 0.00 | 3 | fresh |
| finlife_mortgage-loan_snapshot.json | finlife | 2026-02-27T01:58:14.336Z | 17.49 | 3 | stale |
| finlife_pension_snapshot.json | finlife | 2026-02-27T01:58:14.203Z | 17.49 | 3 | stale |
| finlife_rent-house-loan_snapshot.json | finlife | 2026-02-27T01:58:15.040Z | 17.49 | 3 | stale |
| finlife_saving_snapshot.json | finlife | 2026-03-16T13:46:31.026Z | 0.00 | 3 | fresh |

## Ignored Auxiliary Files

| File | Reason |
| --- | --- |
| benefits_snapshot_partial.json | auxiliary snapshot (excluded from freshness gate) |
| gov24_sync_checkpoint.json | auxiliary snapshot (excluded from freshness gate) |

## Summary

- total: 8
- fresh: 2
- stale: 6
- missingTimestamp: 0
- invalidTimestamp: 0
- ignoredAuxiliary: 2
