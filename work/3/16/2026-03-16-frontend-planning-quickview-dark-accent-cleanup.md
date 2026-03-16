# Frontend Planning QuickView Dark Accent Cleanup (2026-03-16)

## Batch Purpose
- `/planning` flow에서 사용되는 `QuickViewModal`에 남아 있는 과도한 `bg-slate-900` 악센트들을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 모달 내 정보 확인 및 액션 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(모달 스크림 overlay 등)로만 사용하도록 격하시킨다.

## Status & Audit
1. **Active Tab Buttons in Products View (`QuickViewModal.tsx`)**:
   - 예금/적금 탭 전환 시 활성화된 버튼이 `bg-slate-900`으로 되어 있어 모달 상단에서 시각적 무게감이 너무 큼.
2. **Open in New Tab CTA (`QuickViewModal.tsx`)**:
   - 모달 하단의 '전체 페이지 새 탭으로 열기' 버튼이 `bg-slate-900`으로 되어 있어 1안의 밝은 톤과 충돌함.
3. **Modal Structure**:
   - 모달의 테두리 반경(`rounded-xl`) 및 패딩(`p-5`)이 최근 리뉴얼된 다른 UI 요소들에 비해 다소 고전적인 느낌을 줌.

## Planning & Strategy
1. **Emerald Primary Action**:
   - '새 탭으로 열기' CTA 및 탭의 활성 상태를 `bg-emerald-600` 테마로 변경. 이는 'Option 1'의 핵심 시각 언어를 따르며 주요 액션임을 명확히 강조함.
   - 그림자에 `shadow-emerald-900/20` (또는 10)을 추가하여 세련된 입체감 확보.
2. **Modern Layout Refinement**:
   - 모달의 테두리 반경을 `rounded-[2.5rem]`으로 대폭 상향하고 패딩을 `p-8`로 늘려 더 여유롭고 현대적인 인상을 줌.
   - 닫기 버튼을 `rounded-2xl` 및 `bg-white` 기반의 밝은 스타일로 변경.
3. **Scrim Retention**:
   - 배경 오버레이의 다크 스크림(`bg-slate-900/45`)은 모달 집중도를 위해 가이드라인상 허용 범위 내에서 유지.

## Summary of Changes
- **`src/components/QuickViewModal.tsx`**: 
  - 제품 탭(예금/적금)의 활성 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - '전체 페이지 새 탭으로 열기' 버튼 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - 모달 컨테이너의 레이아웃 스타일(radius, padding, shadow)을 'Option 1' 감각에 맞춰 현대화.
  - 스타일링을 위한 `cn` 유틸리티 import 추가.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 플래닝 위저드 내 퀵뷰 모달 렌더링 및 링크 로직 영향 없음을 확인.

## Files Exclusion
- `src/components/PlannerWizard.tsx`, `src/app/planning/page.tsx`: 플래닝 흐름 로직 보호를 위해 읽기 전용으로 확인만 하고 수정에서 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Visual Contrast**: 탭 버튼과 하단 CTA가 모두 에메랄드색을 사용하므로, 모달 내에서 시각적 위계가 적절히 분산되는지 실사용 모니터링 필요.
