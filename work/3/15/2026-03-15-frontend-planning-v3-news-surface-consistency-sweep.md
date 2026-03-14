# Frontend Planning-v3-news-surface-consistency-sweep (2026-03-15)

## 1. 개요
`/planning/v3/news` 계열 화면들의 UI/UX 일관성을 프로젝트 표준 디자인 언어(Emerald 포인트, SegmentedTabs, ReportHeroCard 구조)에 맞춰 정리했습니다.

## 2. 작업 상세
### NewsNavigation 컴포넌트 추가
- `/planning/v3/news/_components/NewsNavigation.tsx` 추가
- `SegmentedTabs` (tone="dark")를 사용하여 오늘 브리핑, 중요 알림, 흐름 보기, 뉴스 탐색, 설정 간의 일관된 내비게이션 제공

### 화면별 Header 및 Summary 구조 통일
- **대상 화면**: `/news`, `/alerts`, `/trends`, `/explore`, `/settings`
- **ReportHeroCard 적용**:
  - `kicker`, `title`, `description` 위계 통일
  - `action` 영역에 핵심 CTA(갱신, 저장, 필터 초기화 등) 배치
  - `ReportHeroStatGrid` 및 `StatCard`를 3~4열로 배치하여 핵심 메트릭 요약 노출
- **상태 강조**:
  - `priorityMessage`나 상태 텍스트를 `emerald` 배경의 둥근 알약형(Pill) UI로 강조하여 정보 위계 확보

### 주요 수정 파일
- `src/app/planning/v3/news/_components/NewsNavigation.tsx` (신규)
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- `src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `src/app/planning/v3/news/_components/NewsTodayClient.tsx`
- `src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx`
- `src/app/planning/v3/news/_components/WeeklyPlanPanel.tsx`
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`

## 3. 검증 결과
- `pnpm eslint`: Parsing error 및 `any` 타입 에러 해결 확인 (Warning 제외 Green)
- `pnpm build`: 성공
- `git diff --check`: Trailing whitespace 제거 및 정합성 확인
- `NewsNavigation`을 통한 페이지 전환 및 헤더 일관성 확인

## 4. 남은 UI 부채
- 각 화면 내부의 상세 리스트/테이블의 밀도(Density) 조절은 이번 Sweep에서 구조적 통일에 집중하느라 최소화됨
- 모바일 뷰에서의 테이블 -> 카드 전환 규칙이 `NewsTrendsTableClient` 등에 부분적으로 남아 있을 수 있음 (데스크톱 위주 정리)
