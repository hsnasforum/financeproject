# Data Freshness Report

- Generated at: 2026-03-01T04:16:02.498Z
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
| benefits_snapshot.json | benefits | 2026-03-01T03:54:12.585Z | 0.02 | 7 | fresh |
| exchange_snapshot.json | other | 2026-03-01T03:54:13.024Z | 0.02 | 7 | fresh |
| finlife_credit-loan_snapshot.json | finlife | 2026-02-27T01:58:15.745Z | 2.10 | 3 | fresh |
| finlife_deposit_snapshot.json | finlife | 2026-03-01T03:54:00.437Z | 0.02 | 3 | fresh |
| finlife_mortgage-loan_snapshot.json | finlife | 2026-02-27T01:58:14.336Z | 2.10 | 3 | fresh |
| finlife_pension_snapshot.json | finlife | 2026-02-27T01:58:14.203Z | 2.10 | 3 | fresh |
| finlife_rent-house-loan_snapshot.json | finlife | 2026-02-27T01:58:15.040Z | 2.10 | 3 | fresh |
| finlife_saving_snapshot.json | finlife | 2026-03-01T03:54:02.199Z | 0.02 | 3 | fresh |

## Ignored Auxiliary Files

| File | Reason |
| --- | --- |
| benefits_snapshot_partial.json | auxiliary snapshot (excluded from freshness gate) |
| gov24_sync_checkpoint.json | auxiliary snapshot (excluded from freshness gate) |

## Summary

- total: 8
- fresh: 8
- stale: 0
- missingTimestamp: 0
- invalidTimestamp: 0
- ignoredAuxiliary: 2
