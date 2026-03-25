# Data Freshness Report

- Generated at: 2026-03-22T16:42:26.207Z
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
| benefits_snapshot.json | benefits | 2026-03-05T10:52:48.247Z | 17.24 | 7 | stale |
| exchange_snapshot.json | other | 2026-03-05T10:52:48.726Z | 17.24 | 7 | stale |
| finlife_credit-loan_snapshot.json | finlife | 2026-02-27T01:58:15.745Z | 23.61 | 3 | stale |
| finlife_deposit_snapshot.json | finlife | 2026-03-16T13:58:55.552Z | 6.11 | 3 | stale |
| finlife_mortgage-loan_snapshot.json | finlife | 2026-02-27T01:58:14.336Z | 23.61 | 3 | stale |
| finlife_pension_snapshot.json | finlife | 2026-02-27T01:58:14.203Z | 23.61 | 3 | stale |
| finlife_rent-house-loan_snapshot.json | finlife | 2026-02-27T01:58:15.040Z | 23.61 | 3 | stale |
| finlife_saving_snapshot.json | finlife | 2026-03-16T13:59:00.926Z | 6.11 | 3 | stale |

## Ignored Auxiliary Files

| File | Reason |
| --- | --- |
| benefits_snapshot_partial.json | auxiliary snapshot (excluded from freshness gate) |
| gov24_sync_checkpoint.json | auxiliary snapshot (excluded from freshness gate) |

## Summary

- total: 8
- fresh: 0
- stale: 8
- missingTimestamp: 0
- invalidTimestamp: 0
- ignoredAuxiliary: 2
