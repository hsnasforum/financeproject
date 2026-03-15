# Frontend Continuity Follow-up: Product Category List (2026-03-15)

## Batch Purpose
- `/products/*` 개별 카테고리 상품 목록 페이지와 `ProductListPage` 공통 컴포넌트를 최신 디자인 언어로 정렬한다.
- `BodyTone` 기반 구형 패턴을 제거하고 `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 패턴을 완성한다.
- 상품 탐색 여정의 중간 지점인 목록 화면의 정보 밀도와 시각적 위계를 최적화한다.

## Status & Audit
1. **Product List Page (`ProductListPage`)**:
   - `PageShell` 배경색(`bg-slate-50`) 불일치 및 잔여 `bg-surface-muted` 클래스 존재.
   - 로딩 상태의 `Skeleton` 디자인이 구형이며, `divide-border/30` 등 구형 경계선 사용.

2. **Result Headers & Items**:
   - `ProductResultsHeader`: 텍스트 위계가 약하고 '실시간/대체' 데이터 상태 표시가 눈에 띄지 않음.
   - `ProductRowItem`, `ProductOptionRowItem`: 호버 시 배경색이 최신 시스템과 맞지 않음.

3. **Explorer Header**:
   - `ProductExplorerHeaderCard`: 필터 섹션 간의 구분이 모호하고 `SubSectionHeader` 활용도가 낮음.

## Planning & Strategy
1. **Consistent Surfaces**:
   - `ProductListPage` 전체 배경을 `Slate 50`으로 정렬하고, 결과 목록 영역의 경계선을 `Slate 50`으로 부드럽게 처리.
   - `Skeleton` 요소에 `bg-slate-100` 및 `rounded-2xl` 적용하여 로딩 중에도 일관된 형태 유지.

2. **Refined Hierarchy**:
   - `ProductResultsHeader`에 강조된 숫자와 배지 스타일을 적용하여 검색 결과의 핵심 정보를 즉시 파악 가능하게 함.
   - `ProductExplorerHeaderCard` 내부 섹션들을 `SubSectionHeader`로 명확히 분리.

3. **Interaction & Feedback**:
   - 리스트 아이템 호버 시 `bg-slate-50`과 `rounded-[1.5rem]`을 적용하여 부드러운 반응성 제공.

## Execution Steps
1. `src/components/ProductListPage.tsx` 리팩토링 및 배경/Skeleton 정비.
2. `src/components/products/ProductExplorerHeaderCard.tsx` 내부 위계 정렬.
3. `src/components/products/ProductResultsHeader.tsx` 결과 요약 디자인 강화.
4. `ProductRowItem`, `ProductOptionRowItem` 호버 스타일 보정.
5. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] 모든 개별 카테고리 상품 목록이 `PageShell`/`PageHeader` 기반의 통일된 레이아웃을 가짐.
- [x] 결과 요약 영역의 시각적 완성도가 높아지고 핵심 지표가 강조됨.
- [x] 로딩 상태(Skeleton)와 리스트 아이템의 스타일이 시스템 표준을 따름.
- [x] 불필요한 구형 `BodyTone` 클래스들이 제거됨.

## Data Files Exclusion
- `.data/finlife_deposit_snapshot.json`, `.data/finlife_saving_snapshot.json`: UI/UX 작업 범위 밖의 데이터 스냅샷으로 스테이징 및 커밋 대상에서 제외함.
