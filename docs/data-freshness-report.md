# Data Freshness Report

- Generated at: 2026-06-22T04:39:42.159Z
- Mode: strict

## Source Thresholds

| Source | maxAgeDays |
| --- | ---: |
| finlife | 3 |
| benefits | 7 |
| gov24 | 7 |
| exchange | 1 |

## Snapshot Status

| File | Source | generatedAt | ageDays | maxAgeDays | Status |
| --- | --- | --- | ---: | ---: | --- |
| benefits_snapshot.json | benefits | 2026-05-25T09:48:14.126Z | 27.79 | 7 | stale |
| exchange_snapshot.json | exchange | 2026-05-25T09:49:27.350Z | 27.78 | 1 | stale |
| finlife_credit-loan_snapshot.json | finlife | 2026-05-25T09:47:49.981Z | 27.79 | 3 | stale |
| finlife_deposit_snapshot.json | finlife | 2026-05-25T09:47:51.182Z | 27.79 | 3 | stale |
| finlife_mortgage-loan_snapshot.json | finlife | 2026-05-25T09:47:48.306Z | 27.79 | 3 | stale |
| finlife_pension_snapshot.json | finlife | 2026-05-25T10:43:58.791Z | 27.75 | 3 | stale |
| finlife_rent-house-loan_snapshot.json | finlife | 2026-05-25T09:47:49.131Z | 27.79 | 3 | stale |
| finlife_saving_snapshot.json | finlife | 2026-05-25T09:47:46.417Z | 27.79 | 3 | stale |

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
