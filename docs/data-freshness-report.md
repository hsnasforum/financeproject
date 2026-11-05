# Data Freshness Report

- Generated at: 2026-11-05T05:55:19.717Z
- Mode: warn

## Source Thresholds

| Source | maxAgeDays |
| --- | ---: |
| finlife | 3 |
| fss_pension | 7 |
| benefits | 7 |
| gov24 | 7 |
| exchange | 1 |

## Snapshot Status

| File | Source | generatedAt | ageDays | maxAgeDays | Status |
| --- | --- | --- | ---: | ---: | --- |
| benefits_snapshot.json | benefits | 2026-11-05T05:53:30.152Z | 0.00 | 7 | fresh |
| exchange_snapshot.json | exchange | 2026-11-05T05:53:04.868Z | 0.00 | 1 | fresh |
| finlife_credit-loan_snapshot.json | finlife | 2026-11-05T05:54:59.623Z | 0.00 | 3 | fresh |
| finlife_deposit_snapshot.json | finlife | 2026-11-05T05:54:58.119Z | 0.00 | 3 | fresh |
| finlife_mortgage-loan_snapshot.json | finlife | 2026-11-05T05:54:59.088Z | 0.00 | 3 | fresh |
| finlife_rent-house-loan_snapshot.json | finlife | 2026-11-05T05:54:59.380Z | 0.00 | 3 | fresh |
| finlife_saving_snapshot.json | finlife | 2026-11-05T05:54:58.688Z | 0.00 | 3 | fresh |
| fss_pension_guaranteed_snapshot.json | fss_pension | 2026-10-14T18:55:21.914Z | 21.46 | 7 | stale_exception |
| fss_pension_products_snapshot.json | fss_pension | 2026-10-14T18:55:21.914Z | 21.46 | 7 | stale_exception |

## Time-limited Exceptions

| File | Expires at | Reason | Mitigation |
| --- | --- | --- | --- |
| fss_pension_guaranteed_snapshot.json | 2026-11-16T00:00:00+09:00 | 2026-11-02 기준 FSS 통합연금포털 OpenAPI가 psGuaranteedProdList area 5에 '001 조회 결과가 없습니다'(NO_DATA)를 돌려줘 pension:sync가 실패하고 스냅샷을 갱신하지 못합니다. 키 문제가 아니라 상류 응답 문제입니다(2026-11-02 로컬 재시도 동일). | 상류가 다시 데이터를 돌려주거나 fss_pension_sync.mjs가 빈 area를 부분 성공으로 처리하면 pension:sync로 갱신하고 이 예외를 제거합니다. 만료 시 기한을 연장하지 말고 응답 상태를 다시 확인합니다. |
| fss_pension_products_snapshot.json | 2026-11-16T00:00:00+09:00 | 2026-11-02 기준 FSS 통합연금포털 OpenAPI가 psGuaranteedProdList area 5에 '001 조회 결과가 없습니다'(NO_DATA)를 돌려줘 pension:sync가 실패하고 스냅샷을 갱신하지 못합니다. 키 문제가 아니라 상류 응답 문제입니다(2026-11-02 로컬 재시도 동일). | 상류가 다시 데이터를 돌려주거나 fss_pension_sync.mjs가 빈 area를 부분 성공으로 처리하면 pension:sync로 갱신하고 이 예외를 제거합니다. 만료 시 기한을 연장하지 말고 응답 상태를 다시 확인합니다. |

## Ignored Auxiliary Files

| File | Reason |
| --- | --- |
| benefits_snapshot_partial.json | auxiliary snapshot (excluded from freshness gate) |
| gov24_sync_checkpoint.json | auxiliary snapshot (excluded from freshness gate) |

## Summary

- total: 9
- fresh: 7
- stale: 0
- staleException: 2
- missingTimestamp: 0
- invalidTimestamp: 0
- ignoredAuxiliary: 2
