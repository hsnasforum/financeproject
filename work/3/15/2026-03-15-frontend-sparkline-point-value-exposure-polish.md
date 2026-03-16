# 2026-03-15 frontend sparkline-point-value-exposure-polish

## 목적
- `Sparkline` 컴포넌트에 마우스 호버 및 키보드 포커스 시 특정 지점의 수치를 노출하는 상호작용 추가
- 비전문가가 트렌드뿐만 아니라 상세 시점의 수치를 직관적으로 파악할 수 있도록 개선
- 별도의 무거운 차트 라이브러리 없이 가벼운 SVG 상호작용 레이어 구현

## 변경 사항

### 1. Sparkline 공통 컴포넌트 개선
- **상호작용 레이어**: `onMouseMove` 및 `onFocus`를 통해 가장 가까운 데이터 포인트를 계산하고 강조(Vertical line + Circle dot).
- **툴팁 시스템**: `framer-motion`을 사용하여 지점 수치를 보여주는 가벼운 툴팁 오버레이 추가.
- **포맷팅 지원**: `formatValue` prop을 추가하여 소비처에서 도메인에 맞는 수치 포맷팅(KRW, % 등)을 정의할 수 있도록 개선.
- **접근성**: `tabIndex={0}` 및 `aria-label`을 통해 키보드 접근성 및 스크린 리더 지원 최소 수준 확보.

### 2. 소비처 반영
- **`PlanningMiniCharts`**: 통화(KRW) 포맷팅을 적용하여 시뮬레이션 결과 트렌드 지점의 상세 금액 노출.
- **`PlannerWizard`**: 트렌드 분석 영역에서 월 저축액, 부채 상환율 등의 지점 수치 노출(금액 및 % 포맷팅 적용).

### 3. Design Spec 업데이트
- **`docs/frontend-design-spec.md`**: `Sparkline`의 상호작용 원칙 및 `formatValue` 활용 가이드를 명시.

## 제외 사항
- **모바일 리스트 전환**: 이번 라운드에서는 상호작용 축에 집중하기 위해 제외하였으며, 추후 반응형 최적화 단계에서 별도 처리 예정.

## 검증 결과
- **Lint**: `pnpm lint` 통과.
- **Build**: `pnpm build` 통과.
- **UI/UX**: 기존 정적 차트보다 정보 전달력이 상향되었으며, Emerald/Slate 디자인 언어와 정합함을 확인.

## 남은 UI debt
- Sparkline 데이터 포인트가 매우 많을 때의 툴팁 겹침 방지 최적화.
- 다크 모드 대응 (현재는 Slate-900 툴팁 고정).
