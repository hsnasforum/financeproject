# Frontend Data Freshness Command Preview Cleanup (2026-03-16)

## Batch Purpose
- `DataFreshnessBanner.tsx`의 경고/에러 상태에서 표시되는 과도한 다크 `pre` 블록(커맨드 미리보기)을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 데이터 상태 안내 시의 시각적 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트로만 사용하도록 격하시킨다.

## Status & Audit
1. **Command Preview Block (`DataFreshnessBanner.tsx`)**:
   - 데이터 동기화가 필요할 때 권장되는 커맨드(`pnpm live:smoke` 등)를 보여주는 배경이 `bg-slate-900`으로 되어 있어, 밝은 배너 내에서 과도한 시각적 무게감을 가짐.
   - 이는 최근 모든 공공/추천 surface에서 진행 중인 'Option 1' 기반의 밝은 테마 전환 흐름과 충돌함.

## Planning & Strategy
1. **Bright Surface Transition**:
   - `pre` 블록 배경을 `bg-slate-100`으로 변경하고 `border-slate-200`을 추가하여 밝고 정돈된 코드 블록 느낌으로 전환.
   - 내부 텍스트 컬러를 `text-slate-100`에서 `text-slate-600`으로 전환하여 가독성 확보.
2. **Layout Refinement**:
   - `rounded-md`를 `rounded-xl`로 상향하고 패딩을 조절하여 다른 카드/박스 요소들과 조화를 이루도록 함.
   - `shadow-inner`를 적용하여 입력 폼이나 코드 영역 특유의 깊이감 유지.
3. **Information Hierarchy**:
   - 배너의 전체 레벨(warn/error) 색상은 유지하되, 내부 가이드 영역만 밝게 처리하여 정보 전달의 명확성 개선.

## Summary of Changes
- **`src/components/data/DataFreshnessBanner.tsx`**: 
  - 커맨드 미리보기 `pre` 블록 배경을 `bg-slate-900` → `bg-slate-100`으로 전환.
  - 테두리(`border-slate-200`) 및 현대적인 테두리 반경(`rounded-xl`) 적용.
  - 텍스트 컬러를 슬레이트 기반(`text-slate-600`)으로 재정의하고 폰트 굵기(`font-bold`) 강화.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. `/recommend` 및 상품 탐색 화면에서의 배너 렌더링 정상 확인.

## Files Exclusion
- `src/lib/sources/**`, `src/components/data/freshness.ts`: 데이터 소스 관리 및 신선도 요약 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Readability**: 다크 테마에서 밝은 테마로 바뀌면서 코드 가독성이 충분한지 추가 관찰 필요 (슬레이트 600/100 조합으로 안정적일 것으로 예상).
