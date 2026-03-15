# Frontend Planning Runs Dark Block Cleanup (2026-03-15)

## Batch Purpose
- `/planning/runs` 및 `/planning/runs/[id]` surface에 남아 있는 과도한 `bg-slate-900` 블록을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 실행 기록 조회 및 비교 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(작은 배지, 모달 오버레이)로만 사용하도록 격하시킨다.

## Status & Audit
1. **Run Details Card (`PlanningRunsClient.tsx`)**:
   - 선택된 실행 기록의 상세 정보를 보여주는 카드가 큰 `bg-slate-900` 블록으로 되어 있어 시각적 무게감이 너무 큼.
2. **Comparison Link (`PlanningRunsClient.tsx`)**:
   - 상세 비교 리포트 열기 버튼이 `bg-slate-900`으로 되어 있어 페이지 하단에서 과도하게 튐.
3. **Table Row Contrast**:
   - 목록에서 선택된 행의 배경색(`bg-emerald-50/30`)이 다소 흐릿하여 밝은 베이스에서 구분이 명확하지 않음.

## Planning & Strategy
1. **Theme Transition**:
   - `bg-slate-900` 카드를 `bg-emerald-600` 테마로 변경하여 'Planning' 도메인의 핵심 색상인 에메랄드 강조는 유지하되 다크한 무거운 느낌을 제거.
   - 그림자에 `shadow-emerald-900/20` 등을 활용하여 입체감 부여.
2. **Action Optimization**:
   - 비교 리포트 링크를 `bg-emerald-600` 기반의 밝고 선명한 버튼 스타일로 변경.
   - 내부 텍스트와 보조 지표의 가독성을 위해 컬러 위계 재조정.
3. **Selection Contrast**:
   - 선택된 행의 배경을 `bg-emerald-50`으로 강화하여 시각적 피드백을 명확히 함.

## Summary of Changes
- **`PlanningRunsClient.tsx`**: 
  - 'Run Details' 카드 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - 상세 리포트 보기 버튼 및 JSON 복사 버튼 스타일을 밝은 배경에 최적화.
  - '상세 비교 리포트 열기' 버튼을 `bg-slate-900` → `bg-emerald-600`으로 변경.
  - 실행 기록 목록의 선택된 행 배경색을 `bg-emerald-50`으로 상향 조정.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 전체 프로젝트의 타입 안정성 및 빌드 정합성 확인.

## Files Exclusion
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 비즈니스 로직 및 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 디자인 가드레일 보호를 위해 제외.

## Remaining Risks
- **Action Center Markers**: Action Center의 순번 마커나 배지 스타일은 이미 이전 리포트 배치에서 정리된 톤과 맞추어져 있으나, 실제 운영 데이터 입력 시 가독성 보완이 필요한지 추가 확인 필요.
