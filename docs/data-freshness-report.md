# Data Freshness Report

- Generated at: 2026-06-22T16:07:03.047Z
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
| benefits_snapshot.json | benefits | 2026-06-22T15:58:24.926Z | 0.01 | 7 | fresh |
| exchange_snapshot.json | exchange | 2026-06-22T15:58:25.910Z | 0.01 | 1 | fresh |
| finlife_credit-loan_snapshot.json | finlife | 2026-06-22T16:02:10.194Z | 0.00 | 3 | fresh |
| finlife_deposit_snapshot.json | finlife | 2026-06-22T15:58:01.146Z | 0.01 | 3 | fresh |
| finlife_mortgage-loan_snapshot.json | finlife | 2026-06-22T16:02:17.076Z | 0.00 | 3 | fresh |
| finlife_pension_snapshot.json | finlife | 2026-06-22T16:02:29.629Z | 0.00 | 3 | fresh |
| finlife_rent-house-loan_snapshot.json | finlife | 2026-06-22T16:02:44.452Z | 0.00 | 3 | fresh |
| finlife_saving_snapshot.json | finlife | 2026-06-22T16:01:10.369Z | 0.00 | 3 | fresh |

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
