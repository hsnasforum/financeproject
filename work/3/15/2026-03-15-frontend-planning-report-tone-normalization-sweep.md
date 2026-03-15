# Frontend Planning Report Tone Normalization Sweep (2026-03-15)

## Batch Purpose
- `/planning/reports` 및 `/planning/reports/[id]` 화면을 밝은 1안 베이스로 정규화한다.
- 기존의 과도한 다크 테마 블록과 레거시 `BodyTone`/`ReportTone` 의존성을 제거한다.
- 리포트 해석 가이드와 상품 비교 영역의 시각적 위계를 최신 에메랄드/슬레이트 언어에 맞춘다.

## Status & Audit
1. **Report Dashboard (`ReportDashboard.tsx`)**:
   - 기존의 어두운 그라디언트 배경과 강조 블록들을 밝은 `Slate 50`/`White` 기반으로 변경.
   - 핵심 지표(Hero Stats) 영역의 시각적 밀도와 가독성 보완.

2. **Interpretation Guide (`InterpretationGuide.tsx`)**:
   - '결과 해석' 섹션의 다크 테마를 제거하고, `Card` 깊이와 에메랄드 포인트를 활용한 밝은 디자인으로 전환.
   - 내부 데이터 모델(GoalRow vs GoalStatusRow) 간의 타입 불일치 해결.

3. **Candidate Comparison (`CandidateComparisonSection.tsx`)**:
   - 상품 후보 비교 표의 다크 그라디언트 제거 및 필터 영역 UI 현대화.

4. **Report List & Shell (`PlanningReportsClient.tsx`, `ReportClient.tsx`)**:
   - 레거시 `BodyTone` 컴포넌트 제거 및 `PageShell` 표준 레이아웃 적용.

## Planning & Strategy
1. **Bright Base Implementation**:
   - 모든 페이지 베이스를 밝은 톤으로 유지하며, 다크 톤은 `slate-900` 등 매우 제한적인 강조 블록(예: 현재 DSR)에만 사용.
   - 체크패턴 및 격자 배경을 일체 배제하고 단색 또는 미세한 그라디언트만 허용.

2. **TypeScript Stability**:
   - UI 개편 과정에서 드러난 `GoalRow`, `EvidenceItem`, `InterpretationInput` 등의 타입 구조 차이를 어댑터 및 매핑 로직 수정을 통해 해결하여 빌드 안정성 확보.

## Summary of Changes
- **`InterpretationGuide.tsx`**: 다크 모드 블록 완전 제거 및 밝은 1안 디자인 적용.
- **`ReportDashboard.tsx`**: 메인 대시보드 블록의 색상 체계 정규화 (Slate/Emerald 중심).
- **`CandidateComparisonSection.tsx`**: 비교 도구 영역의 시각적 위계 및 필터 폼 정비.
- **`PlanningReportDetailClient.tsx`**: 개별 리포트 상세 페이지의 레이아웃 및 톤 보정.
- **`reportInterpretationAdapter.ts` & `PlanningWorkspaceClient.tsx`**: 컴포넌트 prop 변경에 따른 타입 매핑 로직 수정.
- **`interpretationVm.ts`**: 내부 데이터 구조 최적화 (summaryEvidence 타입 개선).

## Verification Results
- **pnpm build**: 성공 (Next.js 16.1.6 환경)
- **pnpm lint**: 에러 없음 (기존 경고 27건 유지)
- **TypeScript**: 모든 타입 오류 해결 확인

## Files Exclusion
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 스냅샷 및 분석 문서는 작업 범위 외로 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 디자인 가드레일 설정 파일은 별도 관리 대상으로 제외.
