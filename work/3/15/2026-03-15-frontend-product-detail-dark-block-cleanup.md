# Frontend Product Detail Dark Block Cleanup (2026-03-15)

## Batch Purpose
- `/products/catalog/[id]` (Standalone Detail) 및 `ProductDetailDrawer` (Drawer Detail)에 남아 있는 과도한 `bg-slate-900` 블록을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 읽기 경험의 연속성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(작은 배지, CTA 버튼 일부)로만 사용하도록 격하시킨다.

## Status & Audit
1. **Compare & Save Section (`UnifiedProductDetailClient.tsx`)**:
   - 상품 상세 우측 하단의 비교함 담기 영역이 큰 `bg-slate-900` 블록으로 되어 있어 페이지 전체의 밝은 톤과 충돌함.
2. **Interest Calculator Section (`ProductDetailDrawer.tsx`)**:
   - 드로어 하단의 계산기 섹션이 `bg-slate-900` 블록으로 되어 있어 무거운 인상을 주고 1안 디자인 언어와 어긋남.
3. **Badges (`ProductOptionRowItem.tsx`, `UnifiedProductDetailClient.tsx`)**:
   - "옵션 기준", "상품 종류" 등을 나타내는 일부 배지가 `bg-slate-900`으로 되어 있어 시각적 파편화가 발생함.

## Planning & Strategy
1. **Bright Surface Transition**:
   - `bg-slate-900` 섹션 배경을 `bg-slate-50` 또는 `bg-white`로 변경.
   - `border-slate-100`과 `shadow-sm`을 활용하여 면(Surface)의 위계를 분리.
   - 텍스트 컬러를 `text-white`에서 `text-slate-900` 또는 `text-slate-600`으로 전환.
2. **Emerald Highlighting**:
   - 결과값(예: 예상 수령액) 등 핵심 정보는 `bg-emerald-500`과 `text-white`를 유지하여 시각적 강조점(Anchor)으로 활용.
3. **Consistent Badges**:
   - 무거운 다크 배지를 `bg-slate-100`, `text-slate-600`, `border-slate-200` 조합으로 변경하여 다른 배지들과 톤을 맞춤.

## Summary of Changes
- **`UnifiedProductDetailClient.tsx`**: 
  - "비교 및 저장" 카드를 `bg-slate-50/50` 베이스로 전환.
  - 상단 "종류(kind)" 배지를 다크 톤에서 밝은 슬레이트 톤으로 변경.
- **`ProductDetailDrawer.tsx`**: 
  - "금리 계산기" 섹션을 `bg-slate-50` 베이스로 대폭 수정.
  - 내부 입력 필드, 레이블, 중간 계산 결과 박스를 밝은 테마에 맞게 조정.
- **`ProductOptionRowItem.tsx`**: 
  - "옵션 기준" 배지를 다크 톤에서 밝은 톤으로 수정하여 시각적 무게감 감소.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. UI/UX 및 타입 시스템 정합성 확인.

## Files Exclusion
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 비즈니스 로직 및 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 디자인 가드레일 보호를 위해 제외.

## Remaining Risks
- **Highlight Focus**: 어두운 면적을 줄였으므로, 사용자의 시선이 계산 결과나 주요 CTA에 충분히 머무는지 지속적인 관찰 필요.
