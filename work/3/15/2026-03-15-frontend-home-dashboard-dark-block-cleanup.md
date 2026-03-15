# Frontend Home & Dashboard Dark Block Cleanup (2026-03-15)

## Batch Purpose
- `/` (Home) 및 `/dashboard` 화면에 남아 있는 과도한 `bg-slate-900` 블록을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일한다.
- 어두운 톤은 배경이 아닌 강조 badge, CTA, 상태 포인트 등 제한적인 요소에만 사용하거나 버튼 수준으로 격하시킨다.

## Status & Audit
1. **Home Status Strip (`HomeStatusStrip.tsx`)**:
   - 데이터 소스 연결 상태 등을 보여주는 섹션이 큰 `bg-slate-900` 블록으로 되어 있어 무거운 인상을 줌.
2. **Today's Queue (`TodayQueue.tsx`)**:
   - 오늘의 할 일/뉴스 등을 요약하는 섹션이 `bg-slate-900` 블록으로 되어 있어 1안의 밝은 톤과 충돌함.
3. **Home Hero & Portal (`HomeHero.tsx`, `HomePortalClient.tsx`)**:
   - 메인 CTA 버튼이 `bg-slate-900`이나, 이는 버튼 수준의 강조이므로 유지 가능성 검토 필요. 다만 섹션 전체가 어두운 경우는 배제됨.

## Planning & Strategy
1. **Bright Base Transition**:
   - `bg-slate-900` 섹션 배경을 `bg-white` 또는 `bg-slate-50`으로 변경.
   - 테두리(`border-slate-100`)와 그림자(`shadow-sm`)로 영역 구분.
   - 텍스트 컬러를 `text-white`에서 `text-slate-900`으로 전환.
2. **Visual Hierarchy with Accents**:
   - 어두운 배경 대신 에메랄드 포인트(`text-emerald-600`, `bg-emerald-50`)를 활용하여 시각적 위계 확보.
   - 아이콘 및 배지 컬러 최적화.

## Summary of Changes
- **`ReportTone.tsx`**: `ReportHeroCard`와 `ReportHeroStatCard`를 전역적으로 밝은 톤(Bright Option 1)으로 전환. 어두운 그라디언트를 제거하고 `bg-white`, `text-slate-900`, `border-slate-100`을 적용.
- **`HomePortalClient.tsx` & `DashboardClient.tsx`**: `ReportHeroCard` 내부의 중첩된 링크와 텍스트 컬러를 밝은 배경에 맞게 조정. 다크 테마용 반투명 배경(`bg-white/10` 등)을 슬레이트/에메랄드 계열로 교체.
- **`HomeStatusStrip.tsx`**: 하단의 큰 `bg-slate-900` 섹션을 밝은 카드 스타일로 변경하고, 버튼을 에메랄드 톤으로 통일.
- **`TodayQueue.tsx`**: `actionSummary` 영역의 다크 블록을 밝은 베이스로 전환하고 에메랄드 액센트와 그림자로 시각적 위계 재구성.
- **`HomeHero.tsx`**: 히어로 섹션 배경을 `bg-slate-50/50`으로 개선하고, 세컨더리 버튼에서 `bg-slate-900`을 제거하여 밝은 톤으로 통일.

## Verification Results
- **pnpm build**: 성공 (Next.js 16.1.6 환경)
- **TypeScript**: 빌드 시 타입 오류 없음을 확인
- **git diff --check**: 스타일 및 공백 이슈 없음 확인

## Files Exclusion
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 작업 범위 외 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호.

## Remaining Risks
- **Visual Weight**: 어두운 면적을 줄이면서 정보의 중요도가 낮아 보이지 않도록 타이포그래피와 여백을 정밀하게 조정해야 함.
