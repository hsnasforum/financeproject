# Frontend Products Browse Dark Action Cleanup (2026-03-16)

## Batch Purpose
- `/products/catalog` 및 상품 목록 surface에 남아 있는 과도한 `bg-slate-900` 액션들을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 상품 탐색 및 비교 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트로만 사용하도록 격하시킨다.

## Status & Audit
1. **Details CTA in Product Card (`page.tsx`)**:
   - 상품 카드 내 '상세 보기' 버튼이 `bg-slate-900`으로 되어 있어 리스트 전체가 다소 어둡고 무거운 인상을 줌.
2. **Comparison Basket Action (`ProductListPage.tsx`)**:
   - 상단 필터 영역 옆의 '비교함' 이동 버튼이 `bg-slate-900`으로 되어 있어 시각적 흐름을 방해함.
3. **Pagination Indicator (`ProductListPage.tsx`)**:
   - 하단 페이지 번호 표시기가 `bg-slate-900`으로 되어 있어 메타 정보로서의 위계보다 과도하게 강조됨.

## Planning & Strategy
1. **Emerald Action Transition**:
   - '상세 보기' 및 '비교함' 등 주요 진입 액션들을 `bg-emerald-600` 테마로 변경. 이는 금융 상품 탐색의 핵심 액션임을 강조하면서도 1안의 밝은 톤과 조화를 이룸.
   - 그림자에 `shadow-emerald-900/20` (또는 10)을 추가하여 세련된 입체감 확보.
2. **Metadata Neutralization**:
   - 페이지 번호 표시기를 `bg-slate-100`, `text-slate-600`, `border-slate-200` 조합으로 변경하여 정보의 성격에 맞는 차분한 위계 부여.
3. **Consistent Hierarchy**:
   - 카드 내의 '비교 담기' 버튼은 이미 `variant="outline"`을 사용하여 밝은 베이스를 유지하고 있으므로, 주요 동선(상세/이동)만 에메랄드로 정밀 타격.

## Summary of Changes
- **`src/app/products/catalog/page.tsx`**: 
  - 상품 카드 내 '상세 보기' 버튼 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
- **`src/components/ProductListPage.tsx`**: 
  - '비교함' 이동 버튼 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - 하단 페이지 번호 표시기를 다크 톤에서 밝은 슬레이트 톤으로 수정.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 상품 카탈로그 조회, 필터링 및 비교함 로직 영향 없음을 확인.

## Files Exclusion
- `src/lib/finlife/**`, `src/lib/products/**`, `src/lib/state/productShelf.ts`: 상품 데이터 및 저장소 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Primary vs Secondary Action**: '상세 보기'와 '비교 담기'가 나란히 있을 때, 에메랄드색 버튼이 시각적으로 지배적이므로 사용자가 두 액션의 차이를 명확히 인지하는지 관찰 필요.
