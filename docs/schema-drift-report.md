# Schema Drift Report

- Generated at: 2026-03-02T06:46:26.522Z
- Mode: check
- Snapshot dir: `.data`
- Fingerprint options: maxDepth=8, arraySampleSize=3
- Ignore paths: $.meta.generatedAt, $.generatedAt, $.meta.syncedAt, $.meta.updatedAt, $.meta.fetchedAt, $.status.lastUpdatedAt

## Summary

| Snapshot | Breaking | Non-breaking |
| --- | ---: | ---: |
| benefits_snapshot_partial.json | 0 | 0 |
| benefits_snapshot.json | 0 | 0 |
| exchange_snapshot.json | 0 | 1 |
| finlife_credit-loan_snapshot.json | 0 | 0 |
| finlife_deposit_snapshot.json | 0 | 0 |
| finlife_mortgage-loan_snapshot.json | 0 | 0 |
| finlife_pension_snapshot.json | 0 | 0 |
| finlife_rent-house-loan_snapshot.json | 0 | 0 |
| finlife_saving_snapshot.json | 0 | 0 |
| gov24_sync_checkpoint.json | 0 | 0 |

## Breaking Changes

- 없음

## Non-breaking Changes

### exchange_snapshot.json

- `added` `$` (- -> object)
