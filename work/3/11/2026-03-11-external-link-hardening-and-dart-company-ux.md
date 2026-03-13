# 2026-03-11 External link hardening and DART company UX

## 수정 대상 파일
- `src/components/DartCompanyPageClient.tsx`
- `src/components/SubscriptionClient.tsx`
- `src/components/RulesOpsClient.tsx`
- `src/components/AutoMergeClient.tsx`
- `src/components/PlanningRunsClient.tsx`
- `src/components/PlanningReportsPrototypeClient.tsx`
- `src/components/ReportClient.tsx`
- `src/components/OpsPlanningFeedbackClient.tsx`
- `src/app/planning/reports/_components/ReportBenefitsSection.tsx`
- `src/app/planning/v3/news/_components/NewsTodayClient.tsx`
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`

## 변경 이유
- `target="_blank"` 링크 중 `noopener`가 빠진 지점이 남아 있었습니다.
- DART 회사 상세 화면은 `corpCode` 누락이나 fetch 실패 시 기술적인 에러 문구만 보여 UX가 거칠었고, 홈페이지 값도 안전한 외부 링크로 연결되지 않았습니다.

## 이번 변경
1. 새 탭으로 여는 링크 중 `rel="noreferrer"`만 있던 지점은 `rel="noopener noreferrer"`로 보강했습니다.
2. DART 회사 상세 화면은 `corpCode` 누락/조회 실패 시 더 쉬운 안내 문구와 `EmptyState`를 보여주도록 바꿨습니다.
3. DART 회사 상세의 홈페이지 필드는 `http/https`만 허용하는 안전한 링크로 렌더하고, 그 외 값은 텍스트로만 남기도록 처리했습니다.

## 재현 / 검증
- `pnpm exec eslint src/components/DartCompanyPageClient.tsx src/components/SubscriptionClient.tsx src/components/RulesOpsClient.tsx src/components/AutoMergeClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/components/OpsPlanningFeedbackClient.tsx src/components/PlanningReportsPrototypeClient.tsx src/components/ReportClient.tsx src/components/PlanningRunsClient.tsx src/app/planning/reports/_components/ReportBenefitsSection.tsx`
- `pnpm e2e:pw tests/e2e/dart-flow.spec.ts --workers=1`

## 남은 리스크와 엣지케이스
- 이번 라운드는 스캔된 `target="_blank"` 누락 보강에 집중했고, 외부 링크를 여는 모든 화면을 설계 기준까지 통일한 것은 아닙니다.
- DART 회사 상세의 홈페이지 링크는 `http/https`만 허용합니다. 스킴이 없는 값은 `https://`를 붙여 시도하고, 여전히 URL이 아니면 텍스트만 보여줍니다.
- dev runtime noise(`/planning/reports 500`, `Fast Refresh had to perform a full reload` 등)는 별도 축으로 남아 있습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
