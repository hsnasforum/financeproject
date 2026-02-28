# Schema Drift Report

- Generated at: 2026-02-27T19:41:17.334Z
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
| finlife_deposit_snapshot.json | 0 | 25 |
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

### finlife_deposit_snapshot.json

- `added` `$.items[].options[].raw.dcls_month` (- -> string)
- `added` `$.items[].options[].raw.fin_co_no` (- -> string)
- `added` `$.items[].options[].raw.fin_prdt_cd` (- -> string)
- `added` `$.items[].options[].raw.intr_rate` (- -> number)
- `added` `$.items[].options[].raw.intr_rate_type` (- -> string)
- `added` `$.items[].options[].raw.intr_rate_type_nm` (- -> string)
- `added` `$.items[].options[].raw.intr_rate2` (- -> number)
- `added` `$.items[].raw.dcls_end_day` (- -> null|string)
- `added` `$.items[].raw.dcls_month` (- -> string)
- `added` `$.items[].raw.dcls_strt_day` (- -> string)
- `added` `$.items[].raw.etc_note` (- -> string)
- `added` `$.items[].raw.fin_co_no` (- -> string)
- `added` `$.items[].raw.fin_co_subm_day` (- -> string)
- `added` `$.items[].raw.fin_prdt_cd` (- -> string)
- `added` `$.items[].raw.fin_prdt_nm` (- -> string)
- `added` `$.items[].raw.join_deny` (- -> string)
- `added` `$.items[].raw.join_member` (- -> string)
- `added` `$.items[].raw.join_way` (- -> string)
- `added` `$.items[].raw.kor_co_nm` (- -> string)
- `added` `$.items[].raw.max_limit` (- -> null|number)
- `added` `$.items[].raw.mtrt_int` (- -> string)
- `added` `$.items[].raw.spcl_cnd` (- -> string)
- `added` `$.meta.configuredGroups[]` (- -> string)
- `added` `$.meta.groupsScanned[]` (- -> string)
- `added` `$.meta.pagesFetchedByGroup.020000` (- -> number)
