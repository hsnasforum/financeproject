# Frontend Continuity Sweep: Product Detail (2026-03-15)

## Batch Purpose
- `/products/catalog/[id]` (standalone)와 Drawer 기반 상품 상세 UI를 최신 디자인 언어로 정렬한다.
- 정보 위계(요약 -> 옵션 -> 조건 -> 계산기 -> CTA)를 강화하고 시각적 일관성을 확보한다.
- `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 패턴을 전면 적용한다.

## Status & Audit
1. **Standalone Detail (`UnifiedProductDetailClient`)**:
   - `Container`, `SectionHeader`, `BodyTone` 기반 구형 레이아웃 사용 중.
   - 정보 밀도가 낮고 핵심 액션(비교 담기)의 위계가 약함.

2. **Drawer Detail (`ProductDetailDrawer`)**:
   - `BodyDialogSurface` 및 단순 `details` 태그 사용으로 standalone 화면과 디자인 언어 불일치.
   - 계산기 섹션의 시각적 완성도 보완 필요.

3. **List Items (`ProductRowItem`, `ProductOptionRowItem`)**:
   - 호버 상태 배경색(`bg-surface-muted`)이 최신 `bg-slate-50`과 불일치.

## Planning & Strategy
1. **Unified Design Language**:
   - Standalone과 Drawer 모두 동일한 `SubSectionHeader` 및 `Card` (또는 카드 느낌의 레이아웃) 적용.
   - 배경색을 `Slate 50`으로, 강조색을 `Emerald 600`으로 통일.

2. **Information Hierarchy**:
   - 상단: 상품명 및 주요 배지 (PageHeader / Drawer Header).
   - 중단: 기간별 옵션 및 적용 금리 (강조된 그리드 카드).
   - 하단: 우대조건(리스트) 및 금리 계산기(다크 테마 배너형).

3. **Calculator Visualization**:
   - 계산 결과를 4열 그리드로 배치하고, 최종 '예상 수령액'을 Emerald 톤으로 강력하게 시각화.

## Execution Steps
1. `src/components/UnifiedProductDetailClient.tsx` 리팩토링.
2. `src/components/products/ProductDetailDrawer.tsx` 리팩토링 (Standalone과 톤 맞춤).
3. `ProductRowItem`, `ProductOptionRowItem` 호버 및 Radius 보정.
4. `ProductListPage.tsx` 잔여 구형 스타일 및 Skeleton 정비.
5. `docs/frontend-design-spec.md` 반영 (필요시).
6. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] Standalone 상세 페이지와 Drawer 상세 UI의 디자인 언어가 완벽히 일치함.
- [x] 모든 주요 섹션에 `SubSectionHeader`가 적용됨.
- [x] 금리 계산기 결과가 직관적인 그리드와 강조 톤으로 표시됨.
- [x] 리스트 아이템의 호버 및 스타일이 시스템 표준(`Slate 50`, `rounded-[1.5rem]`)을 따름.

## Data Files Exclusion
- `.data/finlife_deposit_snapshot.json`, `.data/finlife_saving_snapshot.json`: 위 파일들은 작업 전부터 worktree에 존재하던 데이터 변경사항으로, 이번 UI/UX 컨텐츠와 무관하므로 스테이징 및 커밋 대상에서 제외함.
