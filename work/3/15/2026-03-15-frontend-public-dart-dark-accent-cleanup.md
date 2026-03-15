# Frontend Public DART Dark Accent Cleanup (2026-03-15)

## Batch Purpose
- `/public/dart` (기업 검색) 및 `/public/dart/company` (기업 상세) 화면에 남아 있는 과도한 `bg-slate-900` 악센트들을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 공시 정보 탐색 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(CTA 버튼 일부)로만 사용하도록 격하시킨다.

## Status & Audit
1. **Active Tab Buttons (`DartSearchClient.tsx`)**:
   - '기업 검색' 및 '공시 모니터링' 탭의 활성 상태 배경이 `bg-slate-900`으로 되어 있어 화면 상단에서 과도한 무게감을 가짐.
2. **Monitoring CTA Button (`DartCompanyPageClient.tsx`)**:
   - 기업 상세 하단의 '공시 모니터링 탭으로 이동' 버튼이 `bg-slate-900`으로 되어 있어 1안의 밝은 톤과 충돌함.

## Planning & Strategy
1. **Emerald Highlighting (Tabs)**:
   - 활성 탭 배경을 `bg-emerald-600` 테마로 변경. 이는 'Search/Invest' 관련 기능의 활성 상태를 명확히 표시하면서도 전체적인 밝은 톤과 조화를 이룸.
   - 그림자에 `shadow-emerald-900/10`을 추가하여 세련된 입체감 확보.
2. **Emerald Highlighting (CTA)**:
   - 모니터링 이동 버튼을 `bg-emerald-600` 테마로 변경. 이는 핵심 액션임을 강조하면서도 다른 에메랄드 기반 CTA들과 시각적 일관성을 가짐.
   - 호버 효과 및 섀도우를 최적화하여 현대적인 느낌 부여.
3. **Consistent Hierarchy**:
   - 비활성 상태나 보조 정보 배지 등은 이미 슬레이트 기반의 밝은 톤을 유지하고 있으므로, 주요 액션 포인트만 에메랄드로 정밀 타격하여 위계를 정립.

## Summary of Changes
- **`DartSearchClient.tsx`**: 
  - 검색/모니터링 탭의 활성 상태 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
- **`DartCompanyPageClient.tsx`**: 
  - '공시 모니터링 탭으로 이동' CTA 버튼 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환하고 섀도우 및 인터랙션 효과 강화.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. DART 검색, 기업 상세 조회 및 즐겨찾기 로직 영향 없음을 확인.

## Files Exclusion
- `src/lib/dart/**`: DART 인덱싱 및 API 연동 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Tab Distinction**: 탭 배경이 에메랄드로 바뀌면서 상단 헤더와의 색상 대비가 강해졌으므로, 텍스트 가독성 및 시각적 피로도에 대한 모니터링 필요.
