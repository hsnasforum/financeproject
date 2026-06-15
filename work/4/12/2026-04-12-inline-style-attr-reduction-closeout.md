# 2026-04-12 inline style attr reduction

## 변경 파일
- `src/components/ui/CspSafeProgressBar.tsx`
- `src/components/ui/ProviderLogo.tsx`
- `src/components/Sparkline.tsx`
- `src/app/globals.css`
- `src/components/home/HomeHero.tsx`
- `src/components/home/TodayQueue.tsx`
- `src/components/planning/ResultGuideSections.tsx`
- `src/components/PlanningRunsClient.tsx`
- `src/components/SnapshotDeltaCards.tsx`
- `src/components/DebugUnifiedClient.tsx`
- `src/components/HousingAffordClient.tsx`
- `src/app/recommend/page.tsx`
- `src/app/planning/_components/PlanningMiniCharts.tsx`

## 사용 skill
- `work-log-closeout`: 이번 보안 후속 라운드의 변경 파일, 실제 검증, 잔여 리스크를 `/work` 형식으로 정리

## 변경 이유
- 직전 style CSP tightening 이후 app runtime source에 `style={{ ... }}` 사용처가 여러 곳 남아 있었습니다.
- production `style-src-attr 'unsafe-inline'` 의존도를 줄이기 위해, 동작 변화가 없는 progress/gradient/logo/sparkline 표면부터 소스 기준 inline style attribute를 줄였습니다.

## 핵심 변경
- `CspSafeProgressBar`를 추가하고 추천/플래닝/디버그/주거비 화면의 진행률 막대를 SVG 기반으로 치환했습니다.
- `HomeHero`, `TodayQueue`의 hero gradient background를 `globals.css`의 `.bg-hero-gradient-surface` 클래스로 이동했습니다.
- `PlanningMiniCharts`의 range 표시를 SVG로 바꿔 width/left/background inline style을 제거했습니다.
- `ProviderLogo`는 현재 저장소에서 실제로 쓰는 크기 값(20/40/48/56)을 클래스 매핑으로 정리해 size inline style을 제거했습니다.
- `Sparkline`은 placeholder, container, tooltip을 SVG 기반으로 다시 그려 source 기준 inline style을 제거했습니다.
- 현재 `src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx`만 source 기준 남은 inline style surface입니다.

## 검증
- `rg -n "style=\\{\\{|style:\\s*\\{\\s*\\{" src/app src/components --glob '!**/*.test.*'`
  - 최종 결과: `CoreMetricEvidenceDock.tsx` 1곳만 남음
- `pnpm exec eslint --no-warn-ignored src/components/Sparkline.tsx src/components/ui/CspSafeProgressBar.tsx src/components/ui/ProviderLogo.tsx src/components/home/HomeHero.tsx src/components/home/TodayQueue.tsx src/components/planning/ResultGuideSections.tsx src/components/PlanningRunsClient.tsx src/components/SnapshotDeltaCards.tsx src/components/DebugUnifiedClient.tsx src/components/HousingAffordClient.tsx src/app/recommend/page.tsx src/app/planning/_components/PlanningMiniCharts.tsx`
  - PASS
- `git diff --check -- src/components/Sparkline.tsx src/components/ui/CspSafeProgressBar.tsx src/components/ui/ProviderLogo.tsx src/app/globals.css src/components/home/HomeHero.tsx src/components/home/TodayQueue.tsx src/components/planning/ResultGuideSections.tsx src/components/PlanningRunsClient.tsx src/components/SnapshotDeltaCards.tsx src/components/DebugUnifiedClient.tsx src/components/HousingAffordClient.tsx src/app/recommend/page.tsx src/app/planning/_components/PlanningMiniCharts.tsx`
  - PASS
- `pnpm sec:check`
  - PASS
- `pnpm build`
  - PASS

## 남은 리스크
- `CoreMetricEvidenceDock`는 portal 패널의 동적 `left/top/width` 계산을 inline style로 넘기고 있어, 다음 라운드에서 overlay 구조 자체를 바꾸거나 위치 전략을 다시 잡아야 합니다.
- 이번 라운드는 source 기준 inline style attribute 축소가 목적이었고, runtime animation library가 주입하는 style까지 제거하는 작업은 포함하지 않았습니다.
- `style-src-attr 'unsafe-inline'` 제거 판단은 `CoreMetricEvidenceDock`와 runtime style 생성 지점까지 포함한 별도 검토 뒤에 해야 합니다.
