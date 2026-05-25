# Data Freshness Report

- Generated at: 2026-05-25T20:59:49.915Z
- Mode: warn

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
| benefits_snapshot.json | benefits | 2026-05-25T09:48:14.126Z | 0.47 | 7 | fresh |
| exchange_snapshot.json | exchange | 2026-05-25T09:49:27.350Z | 0.47 | 1 | fresh |
| finlife_credit-loan_snapshot.json | finlife | 2026-05-25T09:47:49.981Z | 0.47 | 3 | fresh |
| finlife_deposit_snapshot.json | finlife | 2026-05-25T09:47:51.182Z | 0.47 | 3 | fresh |
| finlife_mortgage-loan_snapshot.json | finlife | 2026-05-25T09:47:48.306Z | 0.47 | 3 | fresh |
| finlife_pension_snapshot.json | finlife | 2026-05-25T10:43:58.791Z | 0.43 | 3 | fresh |
| finlife_rent-house-loan_snapshot.json | finlife | 2026-05-25T09:47:49.131Z | 0.47 | 3 | fresh |
| finlife_saving_snapshot.json | finlife | 2026-05-25T09:47:46.417Z | 0.47 | 3 | fresh |

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
