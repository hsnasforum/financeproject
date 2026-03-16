# 2026-03-15 frontend planning-report-read-surface-consistency-sweep

## 목적
- `dashboard`, `planning`, `reports`, `recommend history`, `legacy report` 등 public read surface의 UI 언어를 product/recommend 계열과 통일
- 페이지 헤더, 요약 블록, 카드 밀도, 공통 상태(Loading/Empty/Error) UX 개선
- 비즈니스 로직을 유지하면서 시각적 위계와 가독성 상향

## 변경 사항

### 1. 신규 Primitive 도입 및 확장
- **`src/components/ui/SubSectionHeader.tsx` (신규)**:
  - 카드 내부 또는 섹션 단위의 헤더를 위한 Primitive. `text-lg font-black` 및 `tight` 자간 적용.
- **`docs/frontend-design-spec.md`**:
  - `Core Primitives` 섹션을 추가하여 `PageHeader`, `SubSectionHeader`, `StatCard` 표준 명시.

### 2. 화면별 적용 및 개선
- **`DashboardClient.tsx`**:
  - 모든 섹션 헤더를 `SubSectionHeader`로 교체.
  - 카드 반지름을 `Base Radius`(`rounded-[2rem]`)로, 내부 아이템을 `rounded-2xl`로 통일.
  - 비어 있는 상태(Empty State)의 시각적 피드백 상향.
- **`RecommendHistoryClient.tsx`**:
  - `BodyTone` 기반 admin UI를 `PageHeader` 및 `SectionHeader` 스타일로 전면 재구성.
  - 다크 모드 톤(Slate 900)의 'Selected Run' 카드 도입으로 시각적 위계 강조.
  - 표(Table) 디자인을 현대적인 Geist Sans 룩앤필로 정돈.
- **`PlanningRunsClient.tsx`**:
  - `PageHeader` 및 `SubSectionHeader` 적용.
  - 목록 표와 상세 사이드바의 Radius 및 Spacing 리듬 정돈.
  - 삭제/복구 모달(Dialog)을 `rounded-[2.5rem]`의 현대적인 스타일로 개선.
- **`PlanningReportsDashboardClient.tsx`**:
  - 요약 블록을 `StatCard` 패턴으로 교체하여 정보 전달력 강화.
  - 권고 액션(Top Actions) 및 경고(Warnings) 섹션의 시각적 완성도 상향.

### 3. 코드 정리
- **Lint**: 사용하지 않는 변수, 함수 및 `BodyTone` 관련 레거시 import 제거.

## 검증 결과
- **Lint**: `pnpm lint` 통과 (Unused cleanup 완료)
- **Build**: `pnpm build` 통과
- **UI 정합성**: 모든 대상 화면에서 `rounded-[2rem]`의 부드러운 외곽선과 `font-black` 기반의 명확한 헤더 위계 확인.

## 남은 UI debt
- **`PlanningWorkspaceClient.tsx`**: 4,500줄 이상의 거대 컴포넌트로, 내부의 수많은 `BodyTone` 컴포넌트들을 이번 라운드에서 모두 교체하기에는 리스크가 큼. 추후 섹션 단위로 점진적 리팩터링 권장.
