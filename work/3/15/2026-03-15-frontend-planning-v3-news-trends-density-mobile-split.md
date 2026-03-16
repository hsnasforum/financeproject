# Frontend Planning: News Trends Density & Mobile Split (2026-03-15)

## Batch Purpose
- `NewsTrendsTableClient`의 테이블 밀도를 조정하고, 모바일에서는 카드/리스트 row 구조로 전환한다.
- `docs/frontend-design-spec.md` 및 `src/app/GEMINI.md`의 모바일에서 테이블 금지 원칙을 준수한다.

## Status
- `NewsTrendsTableClient.tsx`는 현재 데스크톱 중심의 테이블 구조에서 모바일 반응형 카드 구조가 추가된 상태이다.
- 정보 위계가 개선되었으며, 데스크톱 테이블 밀도가 조정되었다.

## Planning & Strategy
1. **Desktop Table Density**:
   - `px-4 py-4` 및 `border-spacing-y-2`를 유지하며 테이블 뷰를 `hidden lg:block`으로 분리.
   - 외부 컨테이너 `Card`의 패딩을 `p-5 lg:p-8`로 조정하여 모바일 밀도 확보.

2. **Mobile Card/List Conversion**:
   - `lg:hidden` 블록에서 `<Card>` 기반의 리스트 Row로 전환.
   - 카드 상단: 토픽명 + 버스트 등급 배지.
   - 카드 중단: Sparkline (h-12, full width).
   - 카드 하단: 기사 수 + 출처 다양성 2열 레이아웃.

3. **Information Hierarchy**:
   - Topic -> Trend -> Signal -> Metrics 순서로 시각적 중요도 분배.
   - `errorMessage` 노출 로직 추가로 데이터 로드 실패 시 피드백 강화.

## Touched Files
- `src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx`: 메인 리팩토링 및 반응형 분리
- `docs/frontend-design-spec.md`: 모바일 트렌드 카드 패턴 reference 추가
- `work/3/15/2026-03-15-frontend-planning-v3-news-trends-density-mobile-split.md`: 작업 기록

## Verification Results
- **pnpm build**: 성공 (Compiled successfully, Type-checking passed)
- **pnpm lint**: 에러 없음, 경고 27건 (기존 `planning/v3/news` 클러스터의 미사용 변수 위주)
- **git diff --check**: 통과 (공백/포맷 이슈 없음)

## Definition of Done
- [x] 모바일(768px 미만)에서 `<table>`이 노출되지 않고 카드 리스트로 전환됨.
- [x] 데스크톱에서 테이블 데이터의 밀도가 적절히 유지됨.
- [x] Sparkline/Badge/Metric이 모든 환경에서 누락 없이 표시됨.
- [x] `docs/frontend-design-spec.md`에 이번 변경 사항(Mobile Data Display 원칙 구체화)이 반영됨.

## Summary of Changes
- `NewsTrendsTableClient.tsx`:
  - `lg:hidden` 카드 리스트 뷰와 `hidden lg:block` 테이블 뷰로 반응형 레이아웃 분리.
  - 모바일 카드는 정보 위계(Title/Signal -> Trend -> Metrics)를 강조하도록 설계.
  - 외부 컨테이너 `Card`의 여백을 `p-5 lg:p-8`로 조정하여 모바일 밀도 확보.
  - Lint 경고(unused variables) 해결 및 에러 메시지 노출 로직 추가.
- `docs/frontend-design-spec.md`:
  - `Mobile Data Display` 섹션에 Trends Card 패턴 예시 추가.
  - `Data Tables` 섹션에 데스크톱 테이블 구조 유지 명시.
