# Frontend Gov24 Dark Accent Cleanup (2026-03-15)

## Batch Purpose
- `/gov24` 화면의 혜택 탐색 필터 및 결과 리스트에 남아 있는 과도한 `bg-slate-900` 악센트들을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 맞춤 혜택 탐색 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트로만 사용하도록 격하시킨다.

## Status & Audit
1. **Active Trait Pills (`Gov24Client.tsx`)**:
   - 개인 특성 및 가구 특성 선택 단계에서 활성화된 필(Pill)의 배경이 `bg-slate-900`으로 되어 있어 시각적 무게감이 너무 큼.
2. **Result Card Badges (`Gov24Client.tsx`)**:
   - 검색 결과 카드의 상단 배지(예: 혜택 분류)가 `bg-slate-900`으로 되어 있어 리스트가 어둡게 보이는 인상을 줌.

## Planning & Strategy
1. **Active State Modernization**:
   - 활성화된 특성 필의 배경을 `bg-emerald-600` 테마로 변경. 이는 선택 상태를 명확히 인지하게 하면서도 1안의 밝고 경쾌한 톤과 조화를 이룸.
   - 미세한 그림자(`shadow-emerald-900/10`)를 추가하여 선택된 요소의 입체감 확보.
2. **Metadata Refinement**:
   - 결과 카드의 분류 배지를 `bg-slate-100`, `text-slate-600`, `border-slate-200` 조합으로 변경.
   - 정보의 성격이 '강조 액션'이 아닌 '분류 메타데이터'임을 시각적으로 명시하고 무게감을 덜어냄.
3. **Consistent Hierarchy**:
   - 검색 조건 요약 및 상단 상태 스트립은 이미 슬레이트 기반의 밝은 톤을 유지하고 있으므로, 필터와 결과부만 정밀 타격하여 전체적인 톤앤매너를 완성.

## Summary of Changes
- **`Gov24Client.tsx`**: 
  - 개인/가구 특성 선택 필의 활성 상태 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - 혜택 결과 카드의 분류 배지 배경을 `bg-slate-900` → `bg-slate-100`으로 전환하고 텍스트 컬러 최적화.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. Gov24 맞춤 혜택 검색 및 단계별 필터링 로직 영향 없음을 확인.

## Files Exclusion
- `src/lib/publicApis/gov24SimpleFind/**`: 공공데이터 연동 엔진 및 검색 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Selection Contrast**: 선택된 필의 색상이 에메랄드로 바뀌면서 목록 내에서 다른 요소(예: 상세 보기 버튼)와 시각적 충돌이 없는지 지속적인 모니터링 필요.
