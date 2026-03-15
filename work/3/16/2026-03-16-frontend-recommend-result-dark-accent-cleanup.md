# Frontend Recommend Result Dark Accent Cleanup (2026-03-16)

## Batch Purpose
- `/recommend` 결과 카드에 남아 있는 과도한 `bg-slate-900` 악센트(순위 배지)를 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 추천 상품 목록의 가독성과 시각적 조화를 높인다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트로만 사용하도록 격하시킨다.

## Status & Audit
1. **Rank Badge in Result Card (`recommend/page.tsx`)**:
   - 추천 상품 카드 상단의 순위 배지가 `bg-slate-900`으로 되어 있어 개별 카드에서 시각적 무게감이 너무 큼.
   - 모든 순위가 동일한 다크 톤을 사용하여 1위(최적 추천)에 대한 차별화된 강조가 부족함.

## Planning & Strategy
1. **Active/Top Highlighting**:
   - 1위(Top 1) 배지를 `bg-emerald-500` 테마로 변경하여 최적의 추천 상품임을 명확히 인지시키고 프로젝트의 핵심 컬러와 통일.
   - 미세한 그림자(`shadow-emerald-900/10`)를 추가하여 시각적 깊이 부여.
2. **Metadata Neutralization**:
   - 2위 이하의 배지들을 `bg-slate-100`, `text-slate-600`, `border-slate-200` 조합으로 변경.
   - 순위 정보는 유지하되 시각적 무게감을 대폭 낮추어 전체 리스트가 밝고 경쾌하게 보이도록 함.
3. **Typography Alignment**:
   - `cn` 유틸리티를 사용하여 순위에 따른 조건부 스타일링을 깔끔하게 적용.

## Summary of Changes
- **`src/app/recommend/page.tsx`**: 
  - 추천 결과 카드의 순위 배지 배경을 `bg-slate-900` → 조건부 브라이트 테마로 전환.
  - 1위는 에메랄드 강조, 2위 이하는 밝은 슬레이트 메타데이터 스타일 적용.
  - 스타일링을 위한 `cn` 유틸리티 import 추가.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 추천 계산, 결과 렌더링 및 상세 분석 드로어 로직 영향 없음을 확인.

## Files Exclusion
- `src/lib/recommend/**`, `src/lib/products/**`: 추천 엔진 및 계산 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Rank Identification**: 2위 이하의 배지가 많이 밝아졌으므로, 사용자가 순번 정보를 여전히 직관적으로 인지하는지 실사용 데이터 기반 관찰 필요.
