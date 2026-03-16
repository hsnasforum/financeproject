# 2026-03-16 공식 사용자 화면 영문 라벨·내부 값 노출 정리

## 변경 파일
- `src/app/page.tsx`
- `src/app/recommend/page.tsx`
- `src/components/HomePortalClient.tsx`
- `src/components/home/HomeHero.tsx`
- `src/components/home/HomeStatusStrip.tsx`
- `src/components/home/ServiceLinks.tsx`
- `src/components/AlertRulesClient.tsx`
- `src/components/PlanningReportDetailClient.tsx`
- `src/app/planning/reports/_components/CandidateComparisonSection.tsx`
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `src/app/planning/reports/_components/ReportBenefitsSection.tsx`
- `src/app/planning/reports/_components/ReportRecommendationsSection.tsx`
- `src/components/BenefitsClient.tsx`
- `src/components/InvestCompaniesClient.tsx`

## 사용 skill
- `planning-gate-selector`: 공식 사용자 화면 텍스트 변경이라 `git diff --check`와 `pnpm build`를 최소 검증으로 선택하는 데 사용.
- `work-log-closeout`: 오늘 라운드의 변경 파일, 실제 실행 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 웹에서 직접 보이는 설명, 배지, CTA, 메타 라벨에 영문이 섞여 있어 비전문가 기준 가독성이 떨어졌습니다.
- `balanced`, `fetchedAt`, `Source`처럼 구현 맥락이 느껴지는 값이 사용자 화면에 그대로 보이는 구간이 있어 한국어 라벨로 정리할 필요가 있었습니다.
- 내부 로직이나 API 계약은 유지한 채, 공식 사용자 화면에서 바로 보이는 텍스트만 우선 한글화하는 것이 가장 작은 안전한 수정이었습니다.

## 핵심 변경
- 홈(`HomeHero`, `HomePortalClient`, `HomeStatusStrip`, `ServiceLinks`, `/`)의 영문 배지와 섹션 라벨을 `준비`, `리포트`, `혜택`, `전체 화면 바로가기`, `연결 준비 상태` 등 한국어 중심으로 정리했습니다.
- 홈 최근 실행 카드에서 `balanced` 같은 정책 ID가 그대로 보이던 부분을 `균형형`, `안정형`, `성장형` 라벨로 바꿨습니다.
- 추천 화면과 알림 규칙 화면에서 `Score Breakdown`, `Min Score`, `Max Items`, `Include Categories`, `Exclude Flags` 같은 설정 라벨을 `점수 세부 분석`, `최소 점수`, `최대 항목 수`, `포함 카테고리`, `제외 플래그`로 정리했습니다.
- 플래닝 리포트(`PlanningReportDetailClient`, `ReportDashboard`, `ReportBenefitsSection`, `ReportRecommendationsSection`, `CandidateComparisonSection`)의 `Loading Report`, `Benefit Match`, `Product Match`, `Calculation Formula`, `fetchedAt` 같은 라벨을 한글 설명형 표현으로 교체했습니다.
- 혜택 화면(`BenefitsClient`)의 `Apply Link`, `Detail View`, `How to Apply`, `Source`, `Close`, `ON/OFF`를 `신청 링크`, `상세 보기`, `신청 방법`, `출처`, `닫기`, `켜짐/꺼짐`으로 바꿨습니다.
- 기업 탐색 화면(`InvestCompaniesClient`)의 `Index Generated`, `PAGE 1`, `Corporate Profile`, `Source`, `Refreshed`를 각각 `인덱스 생성일`, `1페이지`, `기업 기본 정보`, `출처`, `갱신일`로 바꾸고 source 값도 사용자용 라벨로 매핑했습니다.
- 리포트 대시보드의 적용 오버라이드 섹션에서 raw `override.key`를 그대로 노출하지 않고 `조정 항목` + 이유 중심 문구로 바꿔 내부 구현 키 노출을 줄였습니다.

## 검증
- `git diff --check -- src/app/page.tsx src/components/HomePortalClient.tsx src/components/home/HomeHero.tsx src/components/home/HomeStatusStrip.tsx src/components/home/ServiceLinks.tsx src/components/PlanningReportDetailClient.tsx src/app/planning/reports/_components/CandidateComparisonSection.tsx src/app/planning/reports/_components/ReportDashboard.tsx src/app/planning/reports/_components/ReportBenefitsSection.tsx src/app/planning/reports/_components/ReportRecommendationsSection.tsx src/components/BenefitsClient.tsx src/components/InvestCompaniesClient.tsx`
- `pnpm build`
- 미실행 검증
  - `pnpm lint`
  - `pnpm test`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 공식 public route에서 바로 보이는 주요 영문/내부 값 노출을 우선 정리한 것이고, 모든 사용자 화면의 영문 문구를 100% 전수 치환한 것은 아닙니다.
- `PlanningWorkspaceClient.tsx` 같은 다른 dirty 파일과 이번 라운드 변경이 같은 브랜치에 공존하므로, 커밋 전에 staging 범위를 한 번 더 좁혀 확인하는 편이 안전합니다.
