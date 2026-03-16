# Frontend Legacy Report Dark Block Cleanup (2026-03-15)

## Batch Purpose
- `/report` (Legacy Redirect) 및 `/planning/reports` (New Report) surface에 남아 있는 과도한 `bg-slate-900` 블록과 어두운 그라데이션을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 결과 읽기 경험의 완성도를 높인다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(작은 배지, 상태 포인트, 모달 오버레이)로만 사용하도록 격하시킨다.

## Status & Audit
1. **Shared Report Classes (`ReportTone.tsx`)**:
   - `reportSurface...` 계열 상수들이 `bg-slate-900/70`, `text-white` 등을 사용하고 있어 전체적인 톤을 어둡게 만듦.
2. **Main Report Cards (`ReportClient.tsx`, `PlanningReportsClient.tsx`)**:
   - "월 순소득", "현재 DSR" 등의 핵심 지표 카드가 `bg-slate-900`으로 되어 있어 시각적 무게감이 너무 큼.
3. **Planning Report Sections (`ReportRecommendationsSection.tsx`, `ReportBenefitsSection.tsx`)**:
   - 추천 상품 및 혜택 섹션이 짙은 슬레이트/에메랄드/앰버 그라데이션 배경을 사용하고 있어 1안의 밝은 톤과 충돌함.
4. **Evidence & Markers (`EvidencePanel.tsx`, `ReportAdvancedRaw.tsx`)**:
   - 근거 패널의 'dark' 톤 옵션과 'Raw Access' 배지 등이 다크 테마 기반으로 되어 있어 시각적 파편화 발생.

## Planning & Strategy
1. **Global Tone Transition (`ReportTone.tsx`)**:
   - `reportSurface` 클래스들을 `bg-white`, `bg-slate-50`, `text-slate-900` 기반으로 전면 교체하여 이를 사용하는 모든 컴포넌트가 자동으로 밝아지도록 함.
2. **Bright Accent Cards**:
   - `bg-slate-900` 카드를 `bg-emerald-600` (순소득/DSR)으로 변경하여 강조 효과는 유지하되 무거운 느낌은 제거.
   - 그림자에 `shadow-emerald-900/20` 등을 활용하여 입체감 부여.
3. **Section Neutralization**:
   - 추천/혜택 섹션의 메인 배경을 `bg-white`로, 내부 강조 박스를 `bg-slate-50/bg-emerald-50` 등으로 변경.
   - 텍스트 위계를 `font-black`, `uppercase`, `tracking-widest`와 슬레이트 컬러 조합으로 재정의.
4. **Badge & Marker Refinement**:
   - 순번 마커(1, 2, 3...)를 `bg-slate-900`에서 `bg-slate-200`으로 변경.
   - 시스템 배지(Raw Access 등)를 `bg-slate-100` 기반으로 변경.

## Summary of Changes
- **`ReportTone.tsx`**: `reportSurfaceField`, `Inset`, `Disclosure`, `Button`, `Detail`, `Popover` 등 10여 개의 공유 클래스를 밝은 톤으로 전환.
- **`ReportClient.tsx` & `PlanningReportsClient.tsx`**: 
  - 핵심 지표(소득, DSR) 카드를 에메랄드 강조 톤으로 변경.
  - 순위 및 브리핑 마커를 밝은 슬레이트 톤으로 수정.
- **`ReportRecommendationsSection.tsx` & `ReportBenefitsSection.tsx`**: 
  - 짙은 그라데이션 배경을 제거하고 화이트 카드 베이스에 에메랄드/앰버 액센트 구조로 전면 리디자인.
- **`EvidencePanel.tsx`**: `tone="dark"` 요청 시에도 밝은 배경에서 최적의 가독성을 갖도록 텍스트 및 배경 컬러 수정.
- **`ReportAdvancedRaw.tsx`**: 'Raw Access' 배지를 밝은 톤으로 수정.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 전체 프로젝트의 타입 안정성 및 빌드 정합성 확인.

## Files Exclusion
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 비즈니스 로직 및 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 디자인 가드레일 보호를 위해 제외.

## Remaining Risks
- **Shared Class Side Effects**: `ReportTone` 클래스가 v3 news 등 다른 화면에서도 광범위하게 사용되므로, 해당 화면들에서 의도치 않은 대비 저하가 있는지 모니터링 필요. (대부분 `bg-white` 카드 내부에 있으므로 안전할 것으로 판단됨)
