# Frontend Planning Workspace Dark Slab Cleanup (2026-03-15)

## Batch Purpose
- `PlanningWorkspaceClient.tsx` 결과/요약 영역에 남아 있는 대형 `bg-slate-900` 블록(Slab)들을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 플래닝 실행 및 결과 확인 경험의 연속성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(작은 배지, 상태 포인트, 모달 오버레이)로만 사용하도록 격하시킨다.

## Status & Audit (Pinpointed Slabs)
1. **Execution Pipeline (`run-stages-timeline`)**:
   - 플래닝 단계별 상태를 보여주는 거대한 `bg-slate-900` 블록이 워크스페이스 하단에서 과도한 시각적 무게감을 가짐.
2. **Key Findings Card**:
   - 실행 결과의 핵심 발견 사항을 요약하는 카드가 `bg-slate-900`으로 되어 있어 다른 밝은 결과 카드들과 이질감이 있음.
3. **Monte Carlo Probabilities Banner**:
   - 은퇴 자산 고갈 확률을 보여주는 한 줄 배너가 `bg-slate-900`으로 되어 있어 흐름을 끊는 인상을 줌.

## Planning & Strategy
1. **Bright Surface Transition**:
   - `bg-slate-900` 섹션 배경을 `bg-slate-50` 또는 `bg-emerald-600`으로 변경.
   - `border-slate-100`과 `shadow-sm`을 활용하여 면(Surface)의 위계를 분리.
2. **Emerald Highlighting (Consistency)**:
   - `PlanningRunsClient` 및 `PlanningReportsClient`에서 사용한 패턴을 따라, 고영향도 요약 카드(Key Findings)는 `bg-emerald-600` 테마로 전환하여 강조 효과는 유지하되 무거운 느낌은 제거.
3. **Typography Alignment**:
   - 다크 배경에서 사용하던 `text-white` 및 `text-white/x` 조합을 슬레이트 기반의 고대비 텍스트로 전환.

## Summary of Changes
- **`PlanningWorkspaceClient.tsx`**: 
  - **Slab 1 (Pipeline)**: `bg-slate-900` → `bg-slate-50`. 내부 단계 카드를 `bg-white`로 변경하고 그림자 추가.
  - **Slab 2 (Findings)**: `bg-slate-900` → `bg-emerald-600`. 에메랄드 강조 테마로 전환하여 플래닝 결과의 핵심임을 명시.
  - **Slab 3 (Monte Carlo)**: `bg-slate-900` → `bg-slate-50`. 보더와 아이콘 구분을 통해 통계 정보로서의 가독성 향상.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 워크스페이스의 복잡한 렌더링 로직에 영향이 없음을 확인.

## Files Exclusion
- `src/lib/planning/**`, `src/app/planning/_lib/**`: 타입 및 비즈니스 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Debt / Risks
- **Modal Overlays**: 현재 `bg-slate-900/45`로 유지 중이며, 이는 가이드라인상 허용 범위이나 추후 전체적인 모달 톤 조정 시 재검토 가능.
- **Visual Weight**: 어두운 면적을 줄였으나 `bg-emerald-600` 카드를 통해 시각적 위계는 유지함.
