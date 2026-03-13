# Planning Report Recommendation Design

## 목적
- 플래닝 리포트에서 사용자의 재무 상태를 바탕으로 다음 액션 후보를 함께 제시합니다.
- 범위:
  - 예금/적금 후보 비교
  - Gov24/보조금24 기반 정부지원 혜택 후보
- 원칙:
  - 확정 추천이 아니라 비교/검토용 후보 제안으로 표시합니다.
  - 점수와 함께 근거 신호, 데이터 기준 시점, 제외 이유를 같이 보여줍니다.
  - 외부 API 호출은 서버 route에서만 수행하고, 리포트는 정규화된 결과만 소비합니다.

## 현재 재사용 가능한 자산
- `/planning/reports`에는 이미 상품 후보 비교 섹션이 있습니다.
  - `src/app/planning/reports/_components/CandidateComparisonSection.tsx`
  - `src/lib/planning/reports/productCandidates.ts`
- `/recommend` 허브에는 예금/적금과 혜택 추천 흐름이 이미 있습니다.
  - `src/components/RecommendHubClient.tsx`
  - `src/lib/recommend/types.ts`
  - `src/lib/recommend/scoreBenefits.ts`
- 혜택 데이터는 지역/주제 기반으로 정규화되어 있습니다.
  - `src/lib/publicApis/contracts/types.ts`
  - `src/lib/publicApis/benefitsSearchView.ts`
  - `src/lib/publicApis/gov24SearchView.ts`

## 목표 UX
- 리포트에서 현재 상태를 먼저 설명합니다.
  - 예: `월 저축 여력 42만원`, `비상금 1.8개월`, `목표 만기 12개월 이내`
- 그 다음 추천 섹션을 두 블록으로 나눕니다.
  - `금융상품 후보`
  - `받을 수 있는 혜택 후보`
- 각 블록은 동일한 출력 규칙을 가집니다.
  - 왜 이 후보가 노출됐는지
  - 어떤 신호를 반영했는지
  - 무엇은 아직 반영하지 않았는지
  - 원문 링크 또는 상세 화면 이동 경로

## 추천 신호 모델
플래닝 결과에서 직접 상품/혜택을 고르는 대신, 먼저 표준 신호를 만듭니다.

### 1) 공통 신호
- `monthlySurplusKrw`
- `savingCapacityKrw`
- `emergencyFundMonths`
- `dsrPct`
- `worstCashMonthIndex`
- `goalHorizonMonthsMin`
- `goalUrgency`
- `housingNeed`
- `householdTags`
- `region`

### 2) 금융상품 신호
- 목적 분류:
  - `emergency-buffer`
  - `short-goal`
  - `seed-money`
  - `idle-cash`
- 추천 kind:
  - `deposit`
  - `saving`
  - `deposit+saving`
- 기간 후보:
  - 목표 만기와 가장 가까운 `3/6/12/24/36개월`
- 유동성 성향:
  - 비상금 부족 또는 현금 변동성 큼 -> `high`
  - 안정적 잉여현금 + 단기 목표 -> `medium`
  - 중장기 여유 자금 -> `low`

### 3) 혜택 신호
- 지역:
  - `sido`, `sigungu`
- 생활 상황 태그:
  - `청년`, `주거`, `전세`, `월세`, `출산`, `교육`, `의료`, `취업`
- 우선순위 주제:
  - 플래닝 경고/목표와 가장 관련 높은 주제 3개 이내
- 검색 보조어:
  - 예: `전세 보증금`, `청년 저축`, `월세 지원`

## 신호 생성 규칙 초안
### 금융상품
- `monthlySurplusKrw <= 0`
  - 신규 가입 추천을 강화하지 않습니다.
  - 대신 `저축 전 선행 과제`로 지출 통제/부채 조정 액션을 먼저 노출합니다.
- `emergencyFundMonths < 3`
  - 단기 적금 또는 유동성 높은 상품을 우선 노출합니다.
  - 장기 묶임 상품은 감점합니다.
- `goalHorizonMonthsMin <= 12`
  - 목표 만기와 맞는 예금/적금을 우선 노출합니다.
- `dsrPct`가 높음
  - 공격적 저축 추천을 약화하고, 대환/상환과 병행 가능한 보수적 후보만 남깁니다.

### 혜택
- 주거 관련 목표/부채/월세 지출이 있으면:
  - `주거`, `전세`, `월세` 주제를 우선 가중합니다.
- 청년 연령대/초기 자산 형성 맥락이면:
  - `청년`, `교육`, `취업` 가중치를 높입니다.
- 의료/양육 지출이 있으면:
  - `의료`, `출산` 계열을 우선 검토합니다.
- 지역 정보가 없으면:
  - 전국 혜택만 기본 노출하고 지역형 혜택은 보수적으로 제외합니다.

## 점수 산식 방향
### 금융상품 점수
- 기존 `/recommend` 점수는 유지하고, 플래닝 신호를 추가 가중치로만 얹습니다.
- 예시:
  - `baseProductScore = existing recommend score`
  - `planningFitScore = liquidityFit + goalTermFit + cashflowFit`
  - `final = baseProductScore * 0.7 + planningFitScore * 0.3`
- 장점:
  - 기존 추천 로직을 재사용할 수 있습니다.
  - 플래닝 쪽 변경이 상품 추천 전체를 흔들지 않습니다.

### 혜택 점수
- 기존 `scoreBenefits()`를 유지하고, 플래닝 유도 topic/query를 입력으로 주입합니다.
- 예시:
  - `region/topic/query/richness` 기본 점수 유지
  - `planningTopicBoost`를 topic/query 입력 단계에서만 반영
- 장점:
  - 혜택 점수 체계가 단순하고, 왜 선택됐는지 설명이 쉽습니다.

## 리포트 출력 형태
### 1) 추천 헤더 카드
- 제목: `지금 내 상황에서 먼저 볼 후보`
- 서브라인:
  - `월 저축 여력`
  - `비상금 개월 수`
  - `가장 가까운 목표 만기`
  - `지역/생활 태그`

### 2) 금융상품 섹션
- 카드 3~5개
- 항목:
  - 상품명/기관명
  - 예금/적금 구분
  - 추천 이유 2~3줄
  - 적용 기간/유동성 적합성
  - 세후 추정이자/만기 추정액
  - `비교용` 배지
- 추가 액션:
  - `후보 비교 열기`
  - `전체 추천 보기(/recommend)`

### 3) 혜택 섹션
- 카드 3~5개
- 항목:
  - 혜택명/기관
  - 전국/지역 태그
  - 매칭 주제
  - 요약
  - 신청방법 존재 여부
  - 상세 보기 링크
- 추가 액션:
  - `혜택 탐색 열기(/benefits)`
  - `Gov24 상세 확인`

### 4) 제외/주의 섹션
- 이번 결과에서 반영하지 않은 것:
  - 실제 심사 자격
  - 개인 신용점수
  - 상세 우대조건 충족 여부
  - 실시간 마감/예산 소진 여부
- 사용자에게 보이는 문구:
  - `후보는 비교/점검용이며 실제 가입/수급 가능 여부는 기관 심사와 상세 조건 확인이 필요합니다.`

## API / ViewModel 제안
### 새 타입
- `PlanningRecommendationSignals`
- `PlanningProductRecommendationCard`
- `PlanningBenefitRecommendationCard`
- `PlanningRecommendationBundle`

### 생성 위치
- 후보 신호 생성:
  - `src/lib/planning/reports/recommendationSignals.ts`
- 리포트 추천 번들 생성:
  - `src/lib/planning/reports/recommendationBundle.ts`
- `reportViewModel.ts`에는 가공된 결과만 합칩니다.

### ReportVM 확장
- `recommendations?: {`
- `signals`
- `products`
- `benefits`
- `disclaimers`
- `}`

### 데이터 흐름
1. `run`에서 `resultDto`, profile, goal, snapshot 메타를 읽음
2. `recommendationSignals`에서 표준 신호 생성
3. 제품 후보는 기존 `/api/products/candidates` 로직 또는 공용 서버 함수 재사용
4. 혜택 후보는 기존 benefits/gov24 search view를 서버에서 호출
5. 카드형 결과로 정규화 후 `ReportVM`에 합침

## 구현 단계
### Phase 1
- 리포트에 `추천 신호 요약` + `금융상품 후보`만 추가
- 기존 `CandidateComparisonSection`을 유지하고 상단에 `Top 3 카드`만 얹습니다.
- 목표:
  - 플래닝 결과와 예금/적금 연결
  - 비교용 문구/근거 표시 고정

### Phase 2
- `혜택 후보` 섹션 추가
- 지역/주제/검색 보조어를 플래닝 신호에서 생성해 benefits score에 연결합니다.
- 목표:
  - `내 상황 -> 정부지원 혜택` 흐름 확인

### Phase 3
- 액션 추천과 후보 추천을 연결합니다.
- 예:
  - `비상금 부족` 액션 카드 아래에 적금 후보
  - `주거비 부담` 액션 카드 아래에 월세/전세 혜택 후보
- 목표:
  - 리포트가 단순 결과 화면이 아니라 다음 행동 화면이 되도록 확장

## 테스트 범위
- 순수함수 테스트
  - `recommendationSignals`
  - `recommendationBundle`
  - 금융상품/혜택 분기 규칙
- 리포트 VM 테스트
  - 특정 run fixture에서 expected recommendation cards 생성
- UI 테스트
  - 카드 노출/빈 상태/주의 문구
- 계약 테스트
  - 지역 미입력, 잉여현금 음수, 목표 없음, 혜택 없음 케이스

## 리스크
- 플래닝과 추천을 너무 강하게 결합하면 설명 가능성이 떨어질 수 있습니다.
- 혜택은 실제 자격 심사와 차이가 클 수 있으므로 과한 점수 문구를 피해야 합니다.
- 지역/연령/가구정보가 불완전하면 혜택 추천 정확도가 빠르게 낮아집니다.
- 제품 추천은 현재도 비교용인데, 리포트 안에 들어오면 사용자가 확정 추천으로 오해할 수 있습니다.

## 결정
- v2 코어 엔진은 유지하고, 리포트 계층에서만 추천 번들을 추가합니다.
- 점수는 기존 추천 엔진을 재사용하고, 플래닝은 `신호 생성기` 역할만 맡습니다.
- 첫 단계는 `예금/적금`, 두 번째 단계는 `정부지원 혜택`, 세 번째 단계는 `액션 연계` 순으로 진행합니다.

## 다음 작업 제안
1. `recommendationSignals.ts` 추가
2. `reportViewModel.ts`에 `recommendations` 필드 확장
3. 리포트 UI에 `Top product cards` 섹션 추가
4. 혜택 추천 서버 조합 함수 추가
5. 플래닝 리포트 fixture 기반 테스트 추가
