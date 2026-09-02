# Data Freshness Report

- Generated at: 2026-09-01T15:48:23.402Z
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
| benefits_snapshot.json | benefits | 2026-06-22T15:58:24.926Z | 70.99 | 7 | stale_exception |
| exchange_snapshot.json | exchange | 2026-06-22T15:58:25.910Z | 70.99 | 1 | stale_exception |
| finlife_credit-loan_snapshot.json | finlife | 2026-06-22T16:02:10.194Z | 70.99 | 3 | stale_exception |
| finlife_deposit_snapshot.json | finlife | 2026-06-22T15:58:01.146Z | 70.99 | 3 | stale_exception |
| finlife_mortgage-loan_snapshot.json | finlife | 2026-06-22T16:02:17.076Z | 70.99 | 3 | stale_exception |
| finlife_pension_snapshot.json | finlife | 2026-06-22T16:02:29.629Z | 70.99 | 3 | stale_exception |
| finlife_rent-house-loan_snapshot.json | finlife | 2026-06-22T16:02:44.452Z | 70.99 | 3 | stale_exception |
| finlife_saving_snapshot.json | finlife | 2026-06-22T16:01:10.369Z | 70.99 | 3 | stale_exception |

## Time-limited Exceptions

| File | Expires at | Reason | Mitigation |
| --- | --- | --- | --- |
| benefits_snapshot.json | 2026-09-30T00:00:00.000Z | CI와 오프라인 실행에서 외부 자격 증명 없이 재현 가능한 초기 화면을 제공하는 저장 스냅샷입니다. | 사용자 화면에 원천 기준 시각과 오래됨 경고를 표시하고 실제 신청 전 원문 확인을 안내합니다. |
| exchange_snapshot.json | 2026-09-30T00:00:00.000Z | CI와 오프라인 실행에서 외부 자격 증명 없이 재현 가능한 초기 화면을 제공하는 저장 스냅샷입니다. | 환율 화면의 기준일을 노출하고 실제 거래 전 최신 영업일 환율을 다시 확인하도록 안내합니다. |
| finlife_credit-loan_snapshot.json | 2026-09-30T00:00:00.000Z | CI와 오프라인 실행에서 외부 자격 증명 없이 상품 흐름을 검증하기 위한 저장 스냅샷입니다. | 상품 화면에 sourceAsOf와 stale 상태를 표시하고 가입 전 최신 금융회사 공시 확인을 요구합니다. |
| finlife_deposit_snapshot.json | 2026-09-30T00:00:00.000Z | CI와 오프라인 실행에서 외부 자격 증명 없이 상품 흐름을 검증하기 위한 저장 스냅샷입니다. | 상품 화면에 sourceAsOf와 stale 상태를 표시하고 가입 전 최신 금융회사 공시 확인을 요구합니다. |
| finlife_mortgage-loan_snapshot.json | 2026-09-30T00:00:00.000Z | CI와 오프라인 실행에서 외부 자격 증명 없이 상품 흐름을 검증하기 위한 저장 스냅샷입니다. | 상품 화면에 sourceAsOf와 stale 상태를 표시하고 가입 전 최신 금융회사 공시 확인을 요구합니다. |
| finlife_pension_snapshot.json | 2026-09-30T00:00:00.000Z | CI와 오프라인 실행에서 외부 자격 증명 없이 상품 흐름을 검증하기 위한 저장 스냅샷입니다. | 상품 화면에 sourceAsOf와 stale 상태를 표시하고 가입 전 최신 금융회사 공시 확인을 요구합니다. |
| finlife_rent-house-loan_snapshot.json | 2026-09-30T00:00:00.000Z | CI와 오프라인 실행에서 외부 자격 증명 없이 상품 흐름을 검증하기 위한 저장 스냅샷입니다. | 상품 화면에 sourceAsOf와 stale 상태를 표시하고 가입 전 최신 금융회사 공시 확인을 요구합니다. |
| finlife_saving_snapshot.json | 2026-09-30T00:00:00.000Z | CI와 오프라인 실행에서 외부 자격 증명 없이 상품 흐름을 검증하기 위한 저장 스냅샷입니다. | 상품 화면에 sourceAsOf와 stale 상태를 표시하고 가입 전 최신 금융회사 공시 확인을 요구합니다. |

## Ignored Auxiliary Files

| File | Reason |
| --- | --- |
| benefits_snapshot_partial.json | auxiliary snapshot (excluded from freshness gate) |
| gov24_sync_checkpoint.json | auxiliary snapshot (excluded from freshness gate) |

## Summary

- total: 8
- fresh: 0
- stale: 0
- staleException: 8
- missingTimestamp: 0
- invalidTimestamp: 0
- ignoredAuxiliary: 2
