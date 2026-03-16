# Frontend Planning Sparkline Tooltip Cleanup (2026-03-16)

## Batch Purpose
- `/planning` 결과 차트 등에 사용되는 `Sparkline` 컴포넌트의 툴팁(Tooltip)에 남아 있는 과도한 `bg-slate-900` 악센트를 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 데이터 호버(Hover) 시의 시각적 연속성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트로만 사용하도록 격하시킨다.

## Status & Audit
1. **Tooltip Bubble (`Sparkline.tsx`)**:
   - 차트 위를 마우스로 가리킬 때 나타나는 데이터 툴팁 배경이 `bg-slate-900`으로 되어 있어, 밝은 차트 배경 위에서 과도한 시각적 대비를 가짐.
   - 이는 최근 모든 도메인에서 진행 중인 'Option 1' 기반의 밝은 테마 전환 흐름과 충돌함.

## Planning & Strategy
1. **Bright Surface Transition**:
   - 툴팁 버블 배경을 `bg-white`로 변경하고 `border-slate-200`을 추가하여 밝고 정돈된 카드 느낌으로 전환.
   - 툴팁 하단의 화살표(Arrow) 또한 이중 보더(Double-border) 트릭을 사용하여 화이트 배경 및 슬레이트 보더와 시각적으로 어우러지도록 수정.
2. **Shadow & Elevation**:
   - `shadow-xl`을 유지 또는 강화하여 밝은 배경 위에서도 툴팁이 데이터 포인트보다 위에 떠 있는 입체감을 확실히 함.
3. **Typography Refinement**:
   - `text-white` 조합을 슬레이트 기반 고대비 텍스트(`text-slate-900`, `text-slate-700`, `text-slate-400`)로 전환하여 가독성 확보.

## Summary of Changes
- **`src/components/Sparkline.tsx`**: 
  - 툴팁 버블 배경을 `bg-slate-900` → `bg-white`로 전환.
  - 툴팁 보더(`border-slate-200`) 및 현대적인 테두리 반경(`rounded-lg`) 적용.
  - 텍스트 컬러 위계를 `text-slate-900`(값) 및 `text-slate-400`(레이블) 조합으로 재정의.
  - 툴팁 화살표를 화이트 테마에 맞게 시각적으로 보정.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 플래닝 워크스페이스 내 차트 렌더링 및 호버 인터랙션 영향 없음을 확인.

## Files Exclusion
- `src/app/planning/_components/PlanningMiniCharts.tsx`, `src/components/PlanningWorkspaceClient.tsx`: 차트 데이터 공급 및 렌더링 구조 확인을 위해 읽기 전용으로만 참조하고 수정에서 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Hover Focus**: 툴팁이 밝아짐에 따라 짙은 색상의 라인 차트와 겹칠 때의 시인성이 충분한지 실사용 데이터(특히 노란색 amber 차트 등) 기반의 추가 관찰 필요.
