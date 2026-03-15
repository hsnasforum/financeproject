# Frontend Consistency Sweep: Help, Feedback, Settings (2026-03-15)

## Batch Purpose
- `/help`, `/feedback`, `/settings` 사용자 진입 표면을 최신 디자인 언어(Emerald 600, Slate 50/900, `rounded-[2rem]`)로 정렬한다.
- `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 및 `LoadingState`, `EmptyState` 공용 패턴을 적용한다.
- 폼(Form), 필터(Filter), 목록(List), 상세(Detail)의 정보 위계를 강화하고 모바일 대응을 보완한다.

## Status & Audit
1. **Help (`/help`)**:
   - `main`과 raw 태그 기반의 구형 레이아웃.
   - `PageShell` 및 `PageHeader` 부재.
   - 섹션들이 단순 `border`와 `rounded-lg` 사용 중.

2. **Settings (`/settings`, `/settings/alerts`)**:
   - `/settings`: `PageShell`, `PageHeader`를 쓰고 있으나 `bg-surface-muted` 등 구형 컬러링 가능성.
   - `/settings/alerts`: `Container`와 raw `h1` 사용.
   - `AlertRulesClient`: 내부 섹션들이 `rounded-2xl` 및 `text-sm font-bold`로 최신 `SubSectionHeader` 패턴과 불일치.

3. **Feedback Flow (`/feedback`, `/feedback/list`, `/feedback/[id]`)**:
   - `FeedbackFormClient`: `select`, `textarea` 등 입력 요소의 `radius` 불일치.
   - `FeedbackListClient`: 테이블 헤더 스타일 및 모바일 카드 뷰 부재.
   - `FeedbackDetailClient`: 섹션 구분 및 진단 데이터 가독성 보완 필요.

## Planning & Strategy
1. **Layout & Header**:
   - 모든 화면에 `PageShell`과 `PageHeader` 적용.
   - 페이지 타이틀은 `text-3xl font-black tracking-tight` (PageHeader 기본값) 유지.

2. **Card & Section**:
   - 주요 섹션은 `Card` (`rounded-[2rem]`)로 감싼다.
   - 내부 소제목은 `SubSectionHeader` (`text-lg font-black`) 적용.

3. **Form & Filter**:
   - `select`, `input`, `textarea`는 `rounded-xl` 또는 `rounded-2xl`로 부드럽게 조정.
   - 필터 칩은 `rounded-full` (Pill Radius) 적용.

4. **Table & Mobile**:
   - `FeedbackListClient`에 모바일 카드 리스트 추가 (`lg:hidden`).
   - 테이블 헤더 스타일에 `text-[10px] font-black uppercase tracking-widest text-slate-400` 적용.
   - 수치 데이터에 `tabular-nums` 적용.

5. **States**:
   - 로딩 및 빈 상태에 `LoadingState`, `EmptyState` 적극 활용.

## Execution Steps
1. `src/app/help/page.tsx` 리팩토링.
2. `src/app/settings/alerts/page.tsx` 및 `src/components/AlertRulesClient.tsx` 리팩토링.
3. `src/components/FeedbackFormClient.tsx` 정비.
4. `src/components/FeedbackListClient.tsx` 테이블 및 모바일 대응 정비.
5. `src/components/FeedbackDetailClient.tsx` 상세 뷰 정비.
6. `src/app/settings/page.tsx` 컬러링 및 톤 보정.
7. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] `/help`, `/feedback`, `/settings` 진입 표면이 모두 `PageShell`/`PageHeader` 기반으로 통일됨.
- [x] 주요 섹션이 `rounded-[2rem]` 카드 구조로 정렬됨.
- [x] 피드백 목록에 모바일 카드 뷰가 도입됨.
- [x] 입력 요소 및 버튼의 위계가 공통 스타일 가이드를 따름.
- [x] `docs/frontend-design-spec.md`에 이번 배치에서 확정된 폼/필터 밀도 원칙이 반영됨.

## Summary of Changes
- **Layout & Entry**:
  - `/help`, `/settings/alerts` 등 구형 페이지들을 `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 조합으로 전면 리뉴얼.
  - `/settings` 메인 메뉴 카드의 호버 효과 및 위계를 강화하고 `lg:grid-cols-3`으로 밀도 조정.
- **Feedback Flow**:
  - `FeedbackListClient`: 필터 섹션 가독성 개선, 테이블 헤더/폰트 스타일 적용, 모바일 전용 카드 리스트 뷰 (`lg:hidden`) 추가. `LoadingState`, `EmptyState` 적용.
  - `FeedbackFormClient`: 입력 요소(`textarea`, `select`)의 높이와 `radius`를 정비하여 현대적인 인상 부여.
  - `FeedbackDetailClient`: 메타데이터 그리드 배치, 관리 섹션(`Card` + `SubSectionHeader`), 체크리스트 UI, 진단 데이터 코드 블록 스타일링 개선.
- **Settings & Alerts**:
  - `AlertRulesClient`: 복잡한 설정 폼들을 `Card` 단위로 논리적 분리하고 내부 위계를 `SubSectionHeader`로 통일.
- **Design Spec**:
  - `docs/frontend-design-spec.md`에 `Form & Filter Density` 원칙 및 모바일 피드백 카드 패턴 추가.

## Verification Results
- **pnpm build**: 성공
- **pnpm lint**: 에러 없음, 경고 27건 (기존 프로젝트 레벨 미사용 변수)
- **git diff --check**: 통과
