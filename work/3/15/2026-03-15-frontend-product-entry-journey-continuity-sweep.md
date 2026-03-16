# Frontend Continuity Sweep: Product Entry Journey (2026-03-15)

## Batch Purpose
- `/products`, `/products/catalog`, 그리고 카테고리별 상품 목록 진입면을 최신 디자인 언어로 정렬한다.
- 상품 탐색 여정(Home -> Catalog/List -> Detail)의 시각적 연속성을 확보한다.
- `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 패턴을 전면 적용하여 일관된 톤앤매너를 유지한다.

## Status & Audit
1. **Products Home (`/products`)**:
   - `main` + `Container` 기반 구형 레이아웃.
   - 히어로 섹션과 카테고리 카드 위계 보완 필요.

2. **Unified Catalog (`/products/catalog`)**:
   - `main` + `Container` 기반.
   - 상단 스티키 필터 카드의 정보 밀도와 내부 위계(Header 등) 조정 필요.
   - 결과 카드 스타일을 리스트 화면과 통일.

3. **Product List Page (`ProductListPage.tsx`)**:
   - 이미 `PageShell`을 일부 적용했으나 내부 `ProductExplorerHeaderCard`와 `ProductResultsHeader`의 스타일 정합성 보완 여지.
   - 필터와 결과 요약 간의 여백(Spacing) 및 폰트 위계 조정.

## Planning & Strategy
1. **Layout Standardization**:
   - 모든 진입점을 `PageShell` (Slate 50 bg) 기반으로 통일.
   - `PageHeader`를 통해 서비스의 가치와 현재 위치를 명확히 전달.

2. **Filter & Header Refinement**:
   - 통합 탐색과 개별 목록의 필터 영역에 `SubSectionHeader`를 적용하여 논리적 구분 강화.
   - `ProductResultsHeader`를 '분석 요약' 톤으로 정렬 (Badge 및 강조 텍스트 활용).

3. **Card & Spacing**:
   - 카테고리 및 상품 결과 카드의 radius를 `rounded-[2rem]` 이상으로 표준화.
   - 섹션 간 `gap-8` (32px) 리듬 유지.

## Execution Steps
1. `src/app/products/page.tsx` 리팩토링 (Home).
2. `src/app/products/catalog/page.tsx` 리팩토링 (Catalog).
3. `src/components/products/ProductExplorerHeaderCard.tsx` 및 `ProductResultsHeader.tsx` 스타일 보정.
4. `src/components/ProductListPage.tsx` 전체 레이아웃 리듬 조정.
5. `docs/frontend-design-spec.md` 반영.
6. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] 홈, 카탈로그, 목록 페이지가 모두 동일한 `PageShell`/`PageHeader` 기반으로 전환됨.
- [x] 필터 영역과 결과 요약 영역의 시각적 위계가 명확해짐.
- [x] 모든 버튼, 입력 요소, 카드가 `Emerald/Slate` 표준 디자인을 준수함.
- [x] 모바일 뷰에서 테이블 대신 카드 구조가 자연스럽게 유지됨.

## Summary of Changes
- **Products Home (`/products`)**:
  - `main` + `Container`를 `PageShell`로 교체하고 배경을 `Slate 50`으로 통일.
  - 히어로 섹션을 명확한 타이포그래피와 Primary CTA로 개편.
  - 카테고리 바로가기를 `SubSectionHeader`와 `rounded-[2rem]` 카드로 정렬.
- **Unified Catalog (`/products/catalog`)**:
  - 상단 필터 영역을 **Sticky Filter Card** 패턴(`rounded-[2.5rem]`, `backdrop-blur`)으로 전면 리뉴얼.
  - 결과 카드를 `rounded-[2rem]` 및 정보 밀도 최적화(대표 옵션 그리드)를 통해 리스트 화면과 통일.
- **Product Explorer & Results**:
  - `ProductExplorerHeaderCard`: 필터 섹션들을 `SubSectionHeader`와 `Card` 조합으로 논리적 분리.
  - `ProductResultsHeader`: 검색 결과를 **Analysis Summary** 톤(강조된 숫자, 상태 배지)으로 정렬하여 비전문가의 빠른 상황 파악 지원.
- **Design Spec**:
  - `docs/frontend-design-spec.md`에 설정된 공통 패턴들이 전체 탐색 여정에서 완결성을 갖도록 적용됨.

## Verification Results
- **pnpm build**: 성공
- **pnpm lint**: 에러 없음, 경고 27건 (클러스터 외 잔여 항목)
- **git diff --check**: 통과

## Data Files Exclusion
- `.data/finlife_deposit_snapshot.json`, `.data/finlife_saving_snapshot.json`: UI/UX 작업 범위 밖의 데이터 스냅샷으로 스테이징 및 커밋 대상에서 제외함.
