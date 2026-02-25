# Unified Catalog Roadmap

## Goal

`finlife`, `datago_kdb`를 중복 없이 한 카탈로그 계약으로 제공합니다.

## Step 1: `mode=integrated` (현재 단계)

- canonical: `finlife`
- KDB는 canonical 상품에 `badges/signals`로 enrich
- 중복 행 제거: 매칭된 KDB 상품은 별도 행 미출력
- KDB 미매칭은 `extras.kdbOnly`로 분리(옵션)

## Step 2: `mode=grouped` (후속)

- 그룹 엔티티(상품 그룹 + 소스별 변형) 추가
- 그룹/소스 탭 UX와 API 계약 정식화
- 글로벌 커서(그룹 기준) 설계

## Step 3: 품질 확장

- saving 카테고리 확장
- alias/매칭 품질 개선(운영 샘플 피드백 반영)
- KDB 문자열 파싱 케이스 확장

## Risks

- 매칭 임계값(예: 0.92) 튜닝 필요
- 오탐/미탐 관리 필요
- 보호 신호 필터는 비활성 상태이며 추후 별도 소스 재도입 시 복구 예정

## Suggested Metrics

- match coverage % (KDB)
- unknown(미매칭) 비율
- 사용자 신고 기반 false-positive 루프
