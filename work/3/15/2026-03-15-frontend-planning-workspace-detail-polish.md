# 2026-03-15 frontend planning-workspace-detail-polish

## 목적
- `PlanningWorkspaceClient.tsx` 내부의 촘촘한 데이터 표면(Table), 모달(Dialog), JSON 편집기 주변 스타일을 다듬어 전체 디자인 언어와 정합
- 시각적 위계 상향 및 가독성 개선 (Emerald/Slate 테마 강화)
- 비즈니스 로직 유지 및 UI/UX 디테일 완성도 제고

## 변경 사항

### 1. 공통 Primitive 보정
- **`src/components/ui/BodyTone.tsx`**:
  - `BodyDialogSurface`의 반지름을 `rounded-[2.5rem]`으로, 패딩을 `p-8`로 상향하여 타 모달과 통일.
  - `BodyTableFrame`의 반지름을 `rounded-2xl`로 상향하고 배경색을 `bg-white`로 고정하여 가독성 확보.

### 2. Planning Workspace 디테일 개선
- **표(Table) 스타일 표준화**:
  - `scenarios`, `monteCarlo`, `actions`, `debt` 등 모든 결과 탭 내의 표 헤더 스타일(`text-[10px] font-black uppercase tracking-widest text-slate-400`) 및 배경색(`bg-slate-50`) 통일.
  - 모든 행(row)에 `hover:bg-slate-50/50` 효과 및 숫자 데이터에 `tabular-nums` 적용.
- **모달(Dialog) 정합**:
  - `feedbackModalOpen`을 `SubSectionHeader` 기반으로 개선하고 입력 필드(분류, 제목, 내용) 배치를 2열 그리드 및 넉넉한 간격으로 정돈.
  - `profileDeleteDialog`의 버튼 위계와 텍스트 레이아웃을 표준 패턴에 맞춰 보정.
- **JSON 편집기 및 인사이트 영역**:
  - `details` 내부에 `SubSectionHeader`를 사용하여 "가정 Override JSON"과 "리파이낸스 제안 JSON" 영역을 명확히 구분.
  - `textarea` 디자인(반지름, 테두리, 폰트)을 타 입력 요소와 일관되게 조정.
- **상태 안내 및 콜아웃**:
  - 탭 내부의 `BodyInset` 기반 '해석' 텍스트를 `bg-emerald-50` 콜아웃 스타일로 교체하여 정보 전달력 강화.
  - 요약 지표들을 그리드 형태의 소형 카드로 정돈.

## 검증 결과
- **Lint**: `pnpm lint` 실행 시 warning 3건 중 본 batch 관련 1건(`bodyDialogActionsClassName` unused) 정리 완료. (잔여 2건은 타 legacy 파일 영역)
- **Build**: `pnpm build` 통과
- **UI 정합성**: 플래닝 메인 화면 내부의 가장 밀도 높은 표면들이 타 public 화면과 동일한 Emerald/Slate 룩앤필로 정렬됨을 확인.
- **Diff Check**: `git diff --check` 통과

## 남은 UI debt
- `PlanningMiniCharts` 등 차트 내부의 미세한 색상 및 폰트 값은 차트 라이브러리 커스텀 영역이므로 추후 별도 스윕 고려.
