# Frontend Feedback Dark Accent Cleanup (2026-03-16)

## Batch Purpose
- `/feedback/list` 및 `/feedback/[id]` 화면에 남아 있는 과도한 `bg-slate-900` 악센트들을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 피드백 검토 및 관리 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(필터 활성 상태, 배지 일부)로만 사용하도록 격하시킨다. 단, 코드성 미리보기 영역은 가독성을 위해 예외적으로 유지한다.

## Status & Audit
1. **Active Status Filter Pill (`FeedbackListClient.tsx`)**:
   - 상단 필터 영역의 활성화된 상태 버튼이 `bg-slate-900`으로 되어 있어 시각적 흐름을 단절함.
2. **Category Badge (`FeedbackDetailClient.tsx`)**:
   - 피드백 상세 상단의 카테고리(버그, 개선 등) 배지가 `bg-slate-900`으로 되어 있어 정보의 중요도에 비해 과도하게 강조됨.
3. **Selective Retention**:
   - **Issue Markdown Preview** 및 **Diagnostics Snapshot pre**: 코드나 JSON 데이터의 특성상 다크 배경(`bg-slate-900`)이 가독성에 유리하므로 무리하게 밝게 바꾸지 않고 유지함.

## Planning & Strategy
1. **Active State Modernization**:
   - 활성 필터 배경을 `bg-emerald-600` 테마로 변경. 이는 선택된 상태임을 명확히 하면서도 1안의 핵심 컬러를 활용하여 톤을 맞춤.
   - 미세한 그림자(`shadow-emerald-900/10`)를 추가하여 세련된 입체감 확보.
2. **Metadata Neutralization**:
   - 상세 화면의 카테고리 배지를 `bg-slate-100`, `text-slate-600`, `border-slate-200` 조합으로 변경.
   - 이미 목록 화면(모바일/데스크톱)에서 사용 중인 밝은 배지 스타일과 통일하여 일관성 확보.
3. **Code-like Surface Preservation**:
   - 개발자/운영자용 기술 데이터 영역은 다크 테마를 유지하여 일반 텍스트 영역과 시각적으로 명확히 분리.

## Summary of Changes
- **`FeedbackListClient.tsx`**: 
  - 상태 필터의 활성 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
- **`FeedbackDetailClient.tsx`**: 
  - 상단 카테고리 배지 배경을 `bg-slate-900` → `bg-slate-100`으로 전환하고 텍스트 컬러 최적화.
  - 마크다운 미리보기 및 진단 데이터 영역의 다크 배경은 의도적으로 유지.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 피드백 조회, 필터링 및 상태 관리 로직 영향 없음을 확인.

## Files Exclusion
- `src/lib/feedback/**`: 필터링 및 데이터 처리 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Visual Contrast in Filters**: 필터 버튼이 에메랄드로 바뀌면서 하단의 태그 클라우드(역시 에메랄드 사용)와 시각적 영역 구분이 충분한지 실사용 피드백 필요.
