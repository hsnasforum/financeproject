# 2026-03-15 frontend planning-workspace-sectional-ui-sweep

## 목적
- `PlanningWorkspaceClient.tsx`의 거대 UI를 섹션 단위로 스윕하여 product/recommend 계열과 디자인 언어 통일
- 헤더 위계 정립, 카드 밀도 최적화, 상태(Loading/Empty/Error) UX 개선
- 비즈니스 로직을 건드리지 않는 순수 UI/UX 정합성 작업

## 변경 사항

### 1. Global Header & Status 스윕
- **`PageHeader` 개선**: 프로필 선택 UI를 `Badge` 스타일의 정돈된 `select` 박스로 교체하고, 액션 버튼(실행 기록, 리포트 등)의 위계와 배치를 정립.
- **상태 안내 배너**: `feedbackToast`, `workspaceError` 등을 `rounded-2xl` 및 Emerald/Rose 톤의 일관된 배너 스타일로 교체.

### 2. QuickStart 섹션 개선
- **Card Radius 통일**: 메인 QuickStart 카드를 `rounded-[2rem]` (Base Radius)로 통일.
- **요약 블록 현대화**: `BodyInset` 기반의 요약 항목들을 `StatCard` 패턴의 명확한 지표 카드로 교체하여 월 잉여금, 비상금 버팀력 등 핵심 수치의 가독성 상향.

### 3. 프로필 폼(Profile Form) 섹션 표준화
- **섹션 헤더 도입**: "월 현금흐름", "자산", "부채 리스트", "목표" 등 모든 하위 섹션에 `SubSectionHeader`를 적용하여 시각적 위계 부여.
- **컨테이너 정돈**: `BodyInset` 중첩을 줄이고 `rounded-[2rem]`의 부드러운 배경색 컨테이너로 그룹화.
- **입력 UI 개선**: 부채 및 목표 리스트의 카드 디자인을 개선하고, 삭제 버튼 및 고급 옵션(details)의 배치를 정돈.

### 4. 실행 옵션 및 파이프라인 섹션
- **옵션 그룹화**: 실행 정책, 분석 기간 등을 `SubSectionHeader`와 함께 명확히 구분.
- **Pipeline Timeline**: 시각적으로 무거웠던 파이프라인 상태 표시를 Slate 900 배경의 현대적인 타임라인 뷰로 개선하여 단계별 성공/실패 상태를 직관적으로 인지 가능하게 함.

### 5. 결과 해석 및 탭 UI
- **Sticky ResultGuide**: 결과 요약 가이드 카드와 해석 가이드의 시각 구조 정돈.
- **탭 시스템 현대화**: 상단 버튼 방식의 탭을 `SegmentedTabs` 스타일의 슬라이딩 배경 탭 UI로 교체하여 더 세련된 경험 제공.
- **Empty State 통합**: 모든 섹션의 `BodyEmptyState`를 표준 `EmptyState` Primitive로 교체.

## 검증 결과
- **Lint**: `pnpm lint` 통과 (Unused cleanup, Parsing error 해결 및 Trailing whitespace 제거 완료)
- **Build**: `pnpm build` 통과
- **UI 정합성**: 플래닝 메인 화면이 기존 product/recommend 계열과 완전히 동일한 디자인 언어를 공유함을 확인.

## 남은 UI debt
- `PlanningWorkspaceClient.tsx` 내부의 수많은 디테일(표 내부의 촘촘한 데이터, 특정 모달 내부, JSON 편집기 상세 스타일 등)은 섹션별 2차 스윕을 통해 더 세밀하게 다듬을 수 있음.
