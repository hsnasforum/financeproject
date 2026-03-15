# Frontend Benefits & Invest Dark Block Cleanup (2026-03-15)

## Batch Purpose
- `/benefits` 및 `/invest/companies` 화면에 남아 있는 과도한 `bg-slate-900` 블록을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일한다.
- 어두운 톤은 배경이 아닌 강조 badge, CTA, 상태 포인트 등 제한적인 요소에만 사용한다.

## Status & Audit
1. **Benefits Detail (`BenefitsClient.tsx`)**:
   - `applyHow` (신청 방법) 섹션이 큰 `bg-slate-900` 블록으로 되어 있어 시각적으로 너무 무거움.
   - 모달 오버레이 스크림(`bg-slate-900/45`)은 유지하되, 내부 콘텐츠 위계는 밝은 베이스로 조정.

2. **Invest Corporate Profile (`InvestCompaniesClient.tsx`)**:
   - 상세 프로필 상단 헤더가 `bg-slate-900`으로 되어 있어 다른 화면들과 이질감이 있음.
   - 인덱스 미생성 시 가이드 영역에 미세하게 남은 어두운 톤 정비.

## Planning & Strategy
1. **Bright Base Transition**:
   - `bg-slate-900` 배경을 `bg-white` 또는 `bg-slate-50`으로 변경하고, 테두리(`border-slate-100`)와 그림자(`shadow-sm`)로 영역을 구분.
   - 텍스트 컬러를 `text-white`에서 `text-slate-900` (제목), `text-slate-500` (본문) 등으로 전환.

2. **Refined Accents**:
   - 기존의 어두운 배경 대신 에메랄드 포인트(`text-emerald-600`, `bg-emerald-50`)를 활용하여 중요도를 표현.
   - 버튼(CTA)은 브랜드 컬러(Emerald)를 유지하여 시선 유도.

## Summary of Changes
- **`BenefitsClient.tsx`**: `applyHow` 섹션을 밝은 톤의 카드 스타일로 변경.
- **`InvestCompaniesClient.tsx`**: 기업 상세 프로필 헤더를 밝은 톤으로 전환하고 에메랄드 액센트 적용.

## Verification Results
- **pnpm build**: 성공 (Next.js 16.1.6 환경)
- **TypeScript**: 빌드 과정에서 타입 오류 없음을 확인
- **git diff --check**: 공백 및 스타일 이슈 없음 확인

## Files Exclusion
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 작업 범위 외 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호.

## Remaining Risks
- **Visual Contrast**: 어두운 블록이 사라지면서 정보 간의 구분이 약해질 수 있으므로, 여백과 border-radius를 충분히 활용하여 보완 필요.
