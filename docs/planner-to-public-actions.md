# Planner -> Public Actions

플래너 결과의 "우선순위 액션"은 텍스트로 끝나지 않고, 바로 실행 가능한 공개 화면으로 연결한다.

## 매핑 규칙
- 현금흐름 문제(`monthlyFreeCashFlow <= 0`): `/gov24`로 연결해 즉시 지원금/혜택 탐색을 시작한다.
- 주거 목표 감지(목표명에 `주택|집|내집|아파트|전세|월세|청약` 포함): `/housing/subscription?region=전국&mode=all&houseType=apt`로 연결한다.
- 추천/상품 링크는 기존 규칙을 유지하되, 액션 카드에서 1클릭 이동을 보장한다.

## 쿼리 표준
- 청약: `region`, `from`, `to`, `q`, `houseType`, `mode`
- `houseType`: `apt | urbty | remndr`
- `mode`: `all | search`
- 잘못된 쿼리값은 기본값으로 보정한다(`region=전국`, `houseType=apt`, `mode=all`, 기간은 최근 90일).

## UX 원칙
- `/housing/subscription?...` 진입 시 폼 초기값을 쿼리로 세팅하고 자동 조회를 실행한다.
- 결과 상단에는 조건 요약 3줄(지역/유형, 기간, 키워드)을 항상 표시한다.
