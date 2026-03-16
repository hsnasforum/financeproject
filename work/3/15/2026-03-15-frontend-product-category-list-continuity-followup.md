# Frontend Continuity Follow-up: Product Category List (2026-03-15)

## Batch Purpose
- `/products/*` 개별 카테고리 상품 목록 페이지와 `ProductListPage` 공통 컴포넌트를 최신 디자인 언어로 정렬한다.
- `BodyTone` 기반 구형 패턴을 제거하고 `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 패턴을 완성한다.
- 상품 탐색 여정의 중간 지점인 목록 화면의 정보 밀도와 시각적 위계를 최적화한다.

## Status & Audit
1. **Product List Page (`ProductListPage`)**:
   - `PageShell`은 적용되어 있으나 내부적으로 `BodyTone` (`BodyInset`, `BodyStatusInset` 등) 의존성이 남아 있음.
   - 검색/정렬 바가 구형 `bodyFieldClassName` 등을 사용하고 있어 디자인 시스템과 괴리됨.
   - `snapshotStatus` 요약 영역이 단순 `BodyInset`으로 표현되어 시각적 주목도가 낮음.

2. **Result Items (`ProductRowItem`, `ProductOptionRowItem`)**:
   - 이미 상당 부분 현대화되었으나, 호버 상태(`hover:bg-slate-50`) 및 여백 리듬을 재검증하여 일관성을 확보함.

## Planning & Strategy
1. **Remove BodyTone Legacy**:
   - `BodyInset` -> `Card` (rounded-2xl) 또는 표준 여백 컨테이너로 교체.
   - `bodyFieldClassName` -> 표준 인풋 스타일 (`rounded-2xl`, `bg-slate-50`, `focus:border-emerald-500`) 적용.

2. **Refine Status Strip**:
   - `snapshotStatus`를 `Card` 기반의 'Status Strip' 패턴으로 정비하여 데이터 신뢰도를 시각적으로 강화.

3. **Optimized Search Bar**:
   - 검색, 정렬, 즐겨찾기 필터가 포함된 영역을 하나의 `Card`로 묶어 논리적 완결성 부여.

## Execution Steps
1. `src/components/ProductListPage.tsx` 리팩토링 (BodyTone 제거 및 Card 전환).
2. `src/components/products/ProductRowItem.tsx` 및 `ProductOptionRowItem.tsx` 최종 스타일 검수.
3. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] 모든 개별 카테고리 상품 목록이 `BodyTone` 의존성 없이 `PageShell`/`Card` 기반으로 전환됨.
- [x] 검색/정렬 영역의 UI가 통합 카탈로그(`catalog`)와 일관된 톤을 유지함.
- [x] 모든 버튼과 입력 요소가 `Emerald/Slate` 표준 디자인을 준수함.

## Summary of Changes
- **Product List Page (`ProductListPage`)**:
  - `BodyTone` (`BodyInset`, `BodyStatusInset` 등) 의존성을 완전히 제거하고 `Card` 및 표준 Tailwind 유틸리티로 교체.
  - **Snapshot Status**: 단순 텍스트 나열에서 `Card` 기반의 정돈된 'Status Strip'으로 개선하여 데이터 신뢰도를 강조함.
  - **Search & Filter Bar**: 검색, 정렬, 즐겨찾기 필터 영역을 통합 `Card`로 묶고, 입력 요소의 스타일을 `rounded-2xl` 및 `bg-slate-50`으로 현대화함.
  - **Pagination**: 하단 페이지네이션 영역을 더 명확한 버튼과 현재 페이지 표시 인덱스로 정비함.
- **Result Items**:
  - `ProductRowItem`, `ProductOptionRowItem`: 호버 배경색을 `bg-slate-50`으로, radius를 `rounded-[2rem]`으로 맞춤.
  - 모바일 뷰에서의 그룹화된 옵션 표시 레이아웃을 최신 톤으로 보정.

## Verification Results
- **pnpm build**: 성공
- **pnpm lint**: 에러 없음 (기존 경고 27건 유지)
- **git diff --check**: 통과

## Data Files Exclusion
- `.data/finlife_deposit_snapshot.json`, `.data/finlife_saving_snapshot.json`: UI/UX 작업 범위 밖의 데이터 스냅샷으로 스테이징 및 커밋 대상에서 제외함.
