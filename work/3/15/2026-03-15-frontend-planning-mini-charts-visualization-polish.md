# 2026-03-15 frontend planning-mini-charts-visualization-polish

## 목적
- `PlanningMiniCharts` 및 결과 요약(Warnings/Goals) 주변의 시각화 품질을 상향하여 비전문가 가독성 개선
- 단순 숫자 나열을 지양하고, 범위(Range) 및 진행률(Progress) 등 작은 시각화 요소 도입
- Emerald/Slate 테마를 유지하며 현대적인 데이터 밀도와 위계 정립

## 변경 사항

### 1. PlanningMiniCharts 시각화 강화
- **Range Visualization 도입**: 각 지표(순자산, 현금, 부채)가 전체 시뮬레이션 기간의 최소/최대 범위 중 어디에 위치하는지 보여주는 소형 바 시각화 추가.
- **Metric Card 현대화**: 
  - 카드 반경을 `rounded-[2.5rem]`으로, 패딩을 `p-7`로 상향하여 타 모달과 통일감을 확보.
  - 변동폭(Delta) 배지에 배경색(`bg-emerald-50` 등)을 추가하여 시각적 구분감 강화.
  - 시작/중간/말기 수치를 명확한 위계로 재배치.
- **Sparkline 최적화**: 높이(`h-16`) 및 채우기 투명도(`fillOpacity={0.08}`)를 소폭 조정하여 세련된 곡선 표현 유도.

### 2. Result Guide (Warnings/Goals) 시각화 개선
- **`ResultGuideCard`**: 10초 요약 카드의 레이아웃을 `rounded-[2.5rem]` 기반의 현대적 스타일로 재설계하고, 핵심 지표들을 별도 서브 카드로 분리.
- **목표 진행률(Progress Bar)**: `GoalsTable` 내의 진행률 수치 옆에 시각적인 프로그레스 바를 추가하여 달성도를 직관적으로 확인 가능하게 개선.
- **경고 심각도 하이라이트**: `WarningsTable` 내 심각도(Critical/Warn/Info)에 배지 스타일과 색상을 적용.
- **표(Table) 표준화**: 모든 결과 테이블의 헤더를 `text-[10px] font-black uppercase tracking-widest text-slate-400` 스타일로 통합하고, 숫자 데이터에 `tabular-nums` 및 hover 색상 강조(`group-hover:text-emerald-600` 등) 적용.

### 3. Design Spec 반영
- **`docs/frontend-design-spec.md`**: 이번 라운드에서 굳어진 `Range Visualization` 및 `Uppercase Data Table Header` 규칙을 표준 가이드라인에 추가.

## 검증 결과
- **Lint**: `pnpm lint` 통과 (기존 legacy warning 2건 제외 clean)
- **Build**: `pnpm build` 통과
- **UI/UX**: 복잡한 차트 라이브러리 추가 없이 기존 primitive만으로 데이터 집약적인 화면의 가독성을 의미 있게 상향함.

## 남은 UI debt
- Sparkline의 마우스 호버 시 툴팁 또는 특정 지점 수치 노출 기능 (현재는 정적 트렌드만 노출).
- 모바일 뷰에서의 리스트 형태 전환 (현재는 테이블 프레임으로 감싸서 가로 스크롤 대응 중).
