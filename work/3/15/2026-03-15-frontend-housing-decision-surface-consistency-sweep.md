# Frontend Consistency Sweep: Housing Decision (2026-03-15)

## Batch Purpose
- `/housing/afford`, `/housing/subscription`, `/products/mortgage-loan` 등 주거 관련 의사결정 표면을 최신 디자인 언어로 정렬한다.
- `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 공용 패턴을 적용하고 정보 위계를 강화한다.
- 계산 결과(Affordability)에 비전문가가 바로 이해할 수 있는 작은 시각화(Progress/Comparison Bar)를 도입한다.

## Status & Audit
1. **Housing Afford (`/housing/afford`)**:
   - `SectionHeader` 및 raw Grid 레이아웃 사용 중. `PageShell`/`PageHeader` 전환 필요.
   - 결과 섹션이 단순 텍스트 위주임. 주거비 비중 등을 시각적으로 표현할 여지 있음.
   - CTA 버튼들이 단순 리스트 형태임.

2. **Housing Subscription (`/housing/subscription`)**:
   - 이미 `PageHeader`, `Card` 등을 일부 쓰고 있으나 `main` + `Container` 조합이 잔존함. `PageShell`로 완전 통합 필요.
   - 모달 상세 뷰와 리스트 카드의 위계를 타 화면과 맞춤.

3. **Product Lists (Loan Products)**:
   - `ProductListPage`에서 `SectionHeader`를 `PageHeader`로 교체 필요.
   - `BodyTone` 기반의 구형 스타일링 요소를 `Card` 패턴으로 점진적 정렬.

## Planning & Strategy
1. **Housing Afford Visualization**:
   - **Housing Ratio Bar**: 월 소득 대비 주거비 비중을 Emerald 바(안전) -> Amber 바(주의) -> Rose 바(위험)로 표시.
   - **Cashflow Breakdown**: [소득] 대비 [주거비 + 기타지출]의 점유율을 한 줄의 스택 바(Stacked Bar)로 시각화.

2. **CTA Hierarchy**:
   - 계산 결과 하단에 '다음 단계' 액션(대출 상품 보기, 청약 보기 등)을 강조된 카드 또는 버튼 그리드로 배치.

3. **Layout Integration**:
   - 모든 화면을 `PageShell` (Slate 50 bg) 기반으로 통일하여 제품 전체의 톤앤매너를 맞춤.

## Execution Steps
1. `src/components/HousingAffordClient.tsx` 리팩토링 및 시각화 추가.
2. `src/components/SubscriptionClient.tsx`를 `PageShell` 기반으로 정리.
3. `src/components/ProductListPage.tsx` 헤더 및 톤 보정.
4. `docs/frontend-design-spec.md`에 주거 시각화 패턴 반영.
5. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] `/housing/afford` 결과 섹션에 주거비 비중 시각화(Bar)가 포함됨.
- [x] 관련 모든 페이지가 `PageShell`/`PageHeader` 기반으로 전환됨.
- [x] 입력 폼과 결과 요약의 정보 위계가 공통 spec을 따름.
- [x] CTA 흐름이 자연스럽게 연결됨.

## Summary of Changes
- **Housing Afford (`/housing/afford`)**:
  - `HousingAffordClient`: 전면 리팩토링. `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 패턴 적용.
  - **시각화 도입**: 주거비 비율을 보여주는 `Ratio Progress Bar`와 월 소득 대비 지출 구성을 보여주는 `Stacked Bar` (Cashflow Composition) 추가.
  - 리스크/경고 및 추천 액션(CTA) 섹션의 디자인을 강화하여 다음 단계로의 전환 유도.
- **Housing Subscription (`/housing/subscription`)**:
  - `SubscriptionClient`: `main` + `Container` 조합을 `PageShell`로 교체하여 배경색과 여백 통일.
  - 필터 섹션과 결과 카드 디자인을 최신 패턴(`rounded-[2.5rem]`, `p-8`)으로 정렬.
- **Product Lists**:
  - `ProductListPage`: `SectionHeader`를 `PageHeader`로 교체하고 `PageShell` 클래스 조정으로 일관성 확보.
- **Shared Primitives**:
  - `SubSectionHeader`: 어두운 배경 카드 등에서 활용 가능하도록 `descriptionClassName` prop 추가.
- **Design Spec**:
  - `docs/frontend-design-spec.md`에 `Calculators & Visualizations` 섹션을 신설하고 `Ratio Progress Bar`, `Stacked Bar` 패턴 명문화.

## Verification Results
- **pnpm build**: 성공
- **pnpm lint**: 에러 없음, 경고 27건 (기존 프로젝트 레벨 미사용 변수)
- **git diff --check**: 통과
