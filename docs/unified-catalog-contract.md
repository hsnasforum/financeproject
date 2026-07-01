# Unified Catalog Contract

기준 엔드포인트: `/api/products/unified`

## 요청 파라미터
- `mode`: `merged | integrated` (기본 `merged`)
- `kind`: `deposit | saving` (기본 `deposit`)
- `includeSources`: `finlife,datago_kdb` 형식 (기본 `finlife`)
- `sourceId`: `finlife | datago_kdb` (single-source cursor용)
- `limit`: `1..1000` (기본 `200`)
- `cursor`: merged/single-source 페이징 커서
- `q`, `qMode`: 검색어 + `contains | prefix`
- `depositProtection`: `any | prefer | require` (기본 `any`, deposit 결과에 적용)

## 응답 스키마(요약)
- 성공: `{ ok:true, data, coverage, meta:{ generatedAt }, fetchedAt }`
- 실패: `{ ok:false, error:{ code, message } }`
- `data.items[]` 필수 핵심 필드:
  - `stableId`, `sourceId`, `kind`, `externalKey`, `providerName`, `productName`
  - `options[]` (term/rate 정렬 완료)
  - `signals.depositProtection`: `matched | unknown` (신호가 확인되지 않은 항목은 `unknown`)
- `data.pageInfo`: `{ hasMore, nextCursor, limit, sourceId? }`
- `coverage.depositProtection`: `{ matched, unknown }`

## Invariants
- Stable ID 규칙
  - FINLIFE 행: `stableId = fin_prdt_cd`
  - 외부 소스 행: 매칭된 FINLIFE 코드가 있으면 해당 코드 사용
  - 매칭 불가 시: `${sourceId}:${externalKey}`
- Options merge 규칙
  - 동일 상품(`stableId`) 내 `termMonths` 기준 병합
  - 동일 term 충돌 시 tie-break: `intrRate2 desc -> intrRate desc -> finlife 우선 -> saveTrm`
- Options 정렬 규칙
  - `termMonths asc(null last) -> intrRate2 desc -> intrRate desc -> source priority -> saveTrm`
- 상품 정렬 tie-break
  - `sort=recent`: 최신시각 desc 이후 `providerName asc -> productName asc -> stableId asc`
  - `sort=name`: `providerName asc -> productName asc -> stableId asc`

## Mode 정책
- `merged`: 사용자 노출 기본 모드
  - 다중 소스 통합 + dedup + stable 정렬
  - cursor 페이지네이션 허용
- `integrated`: debug 전용
  - canonical source는 finlife 강제
  - cursor pagination 금지

## Deposit Protection 정책
- `any`: 결과 집합과 정렬을 deposit protection 신호로 바꾸지 않습니다.
- `prefer`: `signals.depositProtection === "matched"` 항목을 안정적으로 앞에 배치하고, 나머지 상대 순서는 유지합니다.
- `require`: `signals.depositProtection === "matched"` 항목만 반환합니다.
- KDB 매칭으로 예금자보호 신호가 확인된 항목은 `matched`, finlife 단독 또는 확인 근거가 없는 항목은 `unknown`입니다.
- 신호가 없는 항목을 `matched`로 추정하지 않습니다.
