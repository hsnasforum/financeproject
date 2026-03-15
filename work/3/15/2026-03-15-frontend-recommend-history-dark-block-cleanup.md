# Frontend Recommend History Dark Block Cleanup (2026-03-15)

## Batch Purpose
- `/recommend/history` 화면에 남아 있는 과도한 `bg-slate-900` 블록을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 추천 히스토리 조회 및 비교 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(배지, CTA 일부)로만 사용하도록 격하시킨다.

## Status & Audit
1. **Selected Run Details Card (`RecommendHistoryClient.tsx`)**:
   - 선택된 실행의 상세 정보를 요약하는 카드가 큰 `bg-slate-900` 블록으로 되어 있어 시각적 무게감이 너무 큼.
2. **Comparison Controls**:
   - 카드 내부의 비교 담기 드롭다운과 버튼이 다크 배경에 맞춰져 있어 밝은 테마로의 전환이 필요함.

## Planning & Strategy
1. **Emerald Transition**:
   - `bg-slate-900` 상세 카드를 `bg-emerald-600` 테마로 변경. 이는 'Recommendation' 결과의 핵심 지표임을 나타내며, 다른 플래닝 화면들의 요약 카드 스타일과 일관성을 가짐.
   - 그림자에 `shadow-emerald-900/20` 등을 활용하여 세련된 입체감 부여.
2. **Internal Element Refinement**:
   - 카드 내부의 '비교 담기' 설정을 `bg-white/10`과 투명한 선택창 조합으로 변경하여 현대적인 느낌을 줌.
   - 메인 CTA 버튼을 `bg-white`로 반전시켜 에메랄드 배경 위에서 가장 높은 명시성을 확보함.

## Summary of Changes
- **`RecommendHistoryClient.tsx`**: 
  - 'Selected Run' 카드 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - 내부 텍스트 컬러 위계를 `text-white` 및 `text-emerald-100` 조합으로 재정의.
  - '상위 N개 비교함 담기' 버튼 및 설정 영역을 밝은 에메랄드 테마에 최적화된 화이트 반전 스타일로 수정.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 추천 히스토리 렌더링 및 타입 시스템 안정성 확인.

## Files Exclusion
- `src/lib/recommend/**`, `src/lib/products/**`: 저장소 및 비즈니스 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Visual Priority**: 에메랄드 카드의 시각적 강도가 높으므로, 왼쪽의 실행 목록보다 과하게 시선을 끄는지 실사용 데이터 기반 모니터링 필요.
