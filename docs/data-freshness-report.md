# Data Freshness Report

- Generated at: 2026-02-26T15:12:34.316Z
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
| benefits_snapshot_partial.json | benefits | 2026-02-21T04:36:09.360Z | 5.44 | 7 | fresh |
| benefits_snapshot.json | benefits | 2026-02-26T12:00:17.016Z | 0.13 | 7 | fresh |
| finlife_credit-loan_snapshot.json | finlife | 2026-02-24T16:49:55.191Z | 1.93 | 3 | fresh |
| finlife_deposit_snapshot.json | finlife | 2026-02-26T13:22:08.212Z | 0.08 | 3 | fresh |
| finlife_mortgage-loan_snapshot.json | finlife | 2026-02-24T16:49:53.590Z | 1.93 | 3 | fresh |
| finlife_pension_snapshot.json | finlife | 2026-02-24T16:49:53.430Z | 1.93 | 3 | fresh |
| finlife_rent-house-loan_snapshot.json | finlife | 2026-02-24T16:49:54.539Z | 1.93 | 3 | fresh |
| finlife_saving_snapshot.json | finlife | 2026-02-26T10:50:49.593Z | 0.18 | 3 | fresh |
| gov24_sync_checkpoint.json | gov24 | - | - | 7 | missing_generated_at |

## Summary

- total: 9
- fresh: 8
- stale: 0
- missingTimestamp: 1
- invalidTimestamp: 0
