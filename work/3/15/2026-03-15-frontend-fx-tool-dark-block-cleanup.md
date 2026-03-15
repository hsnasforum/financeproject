# Frontend FX Tool Dark Block Cleanup (2026-03-15)

## Batch Purpose
- `/tools/fx` 화면의 환산 결과 영역에 남아 있는 과도한 `bg-slate-900` 블록을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 환율 계산 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트로만 사용하도록 격하시킨다.

## Status & Audit
1. **Total Estimate Card (`FxToolClient.tsx`)**:
   - 환산 결과 합계를 보여주는 카드가 큰 `bg-slate-900` 블록으로 되어 있어 페이지 하단에서 과도한 시각적 무게감을 가짐.
2. **Empty State Placeholder**:
   - 계산 전 상태를 보여주는 "Ready to Calculate" 문구의 대비가 낮아 가독성이 다소 떨어짐.

## Planning & Strategy
1. **Emerald Highlighting**:
   - `bg-slate-900` 합계 카드를 `bg-emerald-600` 테마로 변경. 이는 결과의 최종 합계임을 명확히 강조하면서도 1안의 밝은 톤과 조화를 이룸.
   - 그림자에 `shadow-emerald-900/20` 등을 활용하여 입체감 부여.
2. **Typographic Contrast**:
   - 다크 배경에서 사용하던 `text-slate-400` 보조 레이블을 `text-emerald-100`으로 변경하여 에메랄드 배경에서의 가독성 확보.
   - 빈 상태 문구의 컬러를 `text-slate-300`에서 `text-slate-400`으로 상향하여 명확성 개선.

## Summary of Changes
- **`FxToolClient.tsx`**: 
  - 'Total Estimate' 카드 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - 합계 카드 내부 텍스트 컬러 위계를 `text-white` 및 `text-emerald-100`으로 조정.
  - "Ready to Calculate" 문구의 대비 및 시인성 개선.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. FX 도구 렌더링 및 환율 계산 로직 영향 없음을 확인.

## Files Exclusion
- `src/app/api/**`, `src/lib/**`: API 및 비즈니스 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Result Density**: 환산 결과 항목이 많아질 경우 에메랄드 합계 카드가 시각적으로 너무 강하게 느껴지는지 실사용 피드백 필요.
