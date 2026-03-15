# Frontend Housing Afford Dark Block Cleanup (2026-03-15)

## Batch Purpose
- `/housing/afford` 결과 영역에 남아 있는 대형 `bg-slate-900` 블록들을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 주거비 부담 계산 결과 확인 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(배지, CTA 버튼)로만 사용하도록 격하시킨다.

## Status & Audit
1. **Cashflow Composition Bar (`HousingAffordClient.tsx`)**:
   - 지출 구조를 보여주는 하단 바 섹션이 큰 `bg-slate-900` 블록으로 되어 있어 시각적 무게감이 너무 큼.
2. **Recommended Actions Card (`HousingAffordClient.tsx`)**:
   - 계산 결과에 따른 다음 단계를 제안하는 카드가 `bg-slate-900`으로 되어 있어 페이지 하단에서 과도하게 튐.

## Planning & Strategy
1. **Bright Surface Transition**:
   - `bg-slate-900` 지출 구조 섹션을 `bg-slate-50` 베이스로 전환. `border-slate-100`과 `shadow-sm`을 활용하여 입체감은 유지하되 밝은 톤으로 정리.
2. **Emerald Highlighting**:
   - 추천 액션 카드를 `bg-emerald-600` 테마로 변경. 이는 계산 결과의 'Next Step'임을 명확히 강조하면서도 1안의 디자인 언어(Emerald 강조)를 따름.
   - 내부 링크 버튼들을 `bg-white/10` 기반의 화이트 반전 스타일로 수정하여 현대적인 느낌을 줌.
3. **Typography Alignment**:
   - 다크 배경에서 사용하던 `text-white/x` 조합을 슬레이트 기반의 고대비 텍스트(`text-slate-500`, `text-emerald-600`)로 전환.

## Summary of Changes
- **`HousingAffordClient.tsx`**: 
  - 'Cashflow Composition' 섹션 배경을 `bg-slate-900` → `bg-slate-50`으로 전환.
  - '추천 액션' 카드 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - 각 섹션 내부의 텍스트, 바(bar) 색상, 링크 스타일을 밝은 테마에 맞게 전면 조정.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 주거비 계산 로직 및 렌더링 안정성 확인.

## Files Exclusion
- `src/lib/housing/**`: 계산 엔진 및 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Visual Intensity**: 에메랄드 카드의 시각적 강도가 높으므로, 사용자의 시선이 상단의 상세 지표보다 액션 카드로 너무 빨리 쏠리는지 관찰 필요.
