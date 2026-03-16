# Frontend Home Empty State Dark CTA Cleanup (2026-03-16)

## Batch Purpose
- `/` (Home) 화면의 '최근 플래닝 실행' 영역이 비어 있을 때 표시되는 과도한 `bg-slate-900` CTA를 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 홈 진입 시의 첫인상을 쾌적하게 개선한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트로만 사용하도록 격하시킨다.

## Status & Audit
1. **Empty State CTA (`HomePortalClient.tsx`)**:
   - 저장된 실행 기록이 없을 때 나타나는 '첫 플래닝 시작하기' 버튼이 `bg-slate-900`으로 되어 있어 화면 하단에서 과도한 무게감을 가짐.
   - 이는 최근 모든 도메인에서 진행 중인 'Option 1' 기반의 밝은 테마 전환 흐름과 충돌함.

## Planning & Strategy
1. **Emerald Primary Action**:
   - '첫 플래닝 시작하기' 버튼을 `bg-emerald-600` 테마로 변경. 이는 서비스의 핵심 가치 제안(Planning)을 강조하면서도 1안의 시각 언어와 완벽히 조화를 이룸.
   - 그림자에 `shadow-emerald-900/20`을 추가하여 세련된 입체감과 시각적 우선순위 확보.
2. **Consistent Visual Weight**:
   - 이미 상단 Hero 영역에서 에메랄드 강조가 사용되고 있으므로, 하단 empty state에서도 동일한 강조 컬러를 사용하여 브랜드 일관성 유지.
3. **Interactivity Enhancement**:
   - 버튼에 `hover:bg-emerald-700`과 `active:scale-95`를 적용하여 현대적인 클릭 피드백 제공.

## Summary of Changes
- **`HomePortalClient.tsx`**: 
  - '첫 플래닝 시작하기' 버튼 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - 버튼의 섀도우 스타일을 밝은 배경에 최적화된 에메랄드 톤으로 수정.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 홈 화면 렌더링 및 플래닝 링크 로직 영향 없음을 확인.

## Files Exclusion
- `src/lib/planning/**`, `src/app/planning/**`: 플래닝 엔진 및 로직 보호를 위해 제외.
- `src/components/QuickViewModal.tsx`: 플래너 위저드로 이어지는 복잡한 범위 확장을 방지하기 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Visual Balance**: 홈 화면에 에메랄드색 버튼이 여러 군데 존재하게 되므로, 전체적인 시선 분산 정도에 대한 실사용 모니터링 필요.
