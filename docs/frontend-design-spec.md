# Frontend Design Specification (v1.0)

## 1. Overview & Direction
- **Mission**: 현대적이고 일관된 완성도 높은 UI/UX 경험 제공
- **Core Mood**: 신뢰감(Trust), 세련됨(Modern), 가볍지만 전문적임(Light & Professional)
- **Key Principle**: 기존 레거시 디자인 보존보다 전체적인 통일성과 완성도를 최우선으로 합니다. 낡은 느낌(Old-looking)을 배제하고 모바일에서 데스크톱까지 자연스러운 반응형(Responsive) 레이아웃을 제공합니다.

## 2. Tech Stack & Styling
- **Framework**: Next.js 16 (App Router), React 19
- **Styling**: Tailwind CSS v4, Framer Motion (애니메이션 및 인터랙션)
- **Core Primitives**: `src/components/ui/` 폴더 기반의 재사용 가능한 UI Primitive 컴포넌트를 적극 활용합니다.
  - **PageHeader**: 페이지 최상단 타이틀, 설명, 액션 버튼을 정돈하여 배치합니다.
  - **SubSectionHeader**: 카드 내부 또는 섹션 단위의 헤더입니다. `text-lg font-black` 타이포그래피를 사용합니다.
  - **StatCard**: 핵심 수치(Metric)와 라벨, 트렌드를 시각화하는 요약용 카드입니다.
  - **Sparkline**: 데이터의 흐름과 트렌드를 아주 간결한 선형 또는 영역형 차트로 시각화합니다.
    - **Interactions**: 마우스 호버 또는 키보드 포커스 시 해당 지점의 수치를 노출하는 툴팁과 가이드라인을 제공합니다.
    - **Formatting**: `formatValue` prop을 통해 각 도메인(KRW, %, 등)에 맞는 수치 표현을 지원합니다.
    - 가독성을 위해 은은한 영역 채우기(Area fill)와 부드러운 선 표현을 권장합니다.
  - **Range Visualization**: 수치가 특정 범위(Min/Max) 내에서 어디에 위치하는지 보여주는 소형 막대 시각화입니다.
  - **Data Tables**: 데이터 밀도가 높은 표에서는 헤더에 `text-[10px] font-black uppercase tracking-widest text-slate-400` 스타일을 적용하고, 숫자 데이터에는 `tabular-nums`를 필수 적용합니다. 데스크톱 환경에서는 정보의 가로 비교가 유리하도록 테이블 구조를 유지합니다.
  - **Mobile Data Display**: 모바일 뷰에서는 테이블 사용을 지양하고, 카드 또는 리스트 Row 구조로 전환하여 가독성을 확보합니다. 이때 데스크톱 표와 동일한 정보 위계와 색상 강조 규칙을 유지하여 일관된 제품 언어를 제공합니다.
    - *Pattern (Trends Card)*: 상단(Title + Signal Badge), 중단(Sparkline - full width), 하단(Metrics Grid) 구조를 활용하여 좁은 화면에서도 수치와 흐름을 동시에 파악할 수 있게 합니다. (`NewsTrendsTableClient.tsx` 참고)
    - *Pattern (List Card)*: 상단(Metadata/Tags), 중단(Primary Content), 하단(Secondary Metadata + CTA) 구조를 활용합니다. (`FeedbackListClient.tsx` 참고)
  - **Form & Filter Density**: 
    - 입력 요소(`input`, `select`, `textarea`)는 가급적 `h-11` 높이와 `rounded-2xl` 이상의 radius를 적용하여 현대적인 인상을 줍니다.
    - 필터 칩(Chip)이나 배지(Badge)는 `rounded-full`을 사용하여 버튼과 시각적으로 구분합니다.
    - 여백(Gap)은 `gap-6` (24px) 이상을 기본으로 하여 정보 간의 가독성을 확보합니다.
  - 기타: `Button`, `Card`, `Badge`, `SegmentedTabs` 등 표준 컴포넌트를 우선 사용합니다.

## 3. Design Tokens (기본 테마)
- **Color Palette**:
  - `Primary`: `#059669` (Emerald 600) - 최고금리, 핵심 수치, 주요 액션 강조에 통일하여 사용
  - `Background`: `#f8fafc` (Slate 50) 바탕 / `Surface`: `#ffffff` (White)
  - `Text`: `Foreground` (`#0f172a`), `Secondary` (`#475569`), `Muted` (`#94a3b8`)
- **Typography**: 시스템 폰트(geist-sans 계열) 기반으로 자신감 있고 읽기 쉬운 텍스트 구성
- **Spacing & Layout**: 답답하고 촘촘한 레이아웃을 피하고, 넉넉하고 정돈된 여백(Spacing scale) 리듬 유지
- **Radius & Shadow**:
  - **Base Radius**: `rounded-[2rem]` (32px) - 대형 카드, 모달, 컨테이너용
  - **Small Radius**: `rounded-xl` (12px) - 버튼(대), 스켈레톤, 리스트 아이템용
  - **Pill Radius**: `rounded-full` - 배지, 탭, 검색바, 소형 버튼용
  - 표면감과 그림자는 절제되고 일관된 규칙(기본 `--card-shadow`, 호버 시 `--card-shadow-hover`) 적용

## 4. Key UI Patterns (핵심 화면 패턴)
- **상품 탐색 UI 계층 (Reference Pattern)**:
  해당 프로젝트의 상품 탐색은 아래의 위계와 흐름을 최우선으로 따릅니다.
  1. **Segmented Tabs** (대분류)
  2. **Provider 칩** (제공자 필터)
  3. **Filter 칩/그리드** (세부 조건 필터)
  4. **리스트 / Row 아이템** (결과 노출)
- **Mobile Environment**:
  - 모바일 뷰에서 **테이블(Table) 형태 사용을 엄격히 금지**합니다.
  - 데이터는 반드시 **카드(Card) 또는 리스트 Row** 형태로 변환하여 가독성을 높여야 합니다. (e.g., `/products/compare`의 모바일 카드 뷰)
- **Search & Filter Patterns**:
  - **SearchPill**: `rounded-full` 배경에 검색 아이콘이 포함된 인풋을 사용하며, 우측에 Clear(X) 버튼을 포함합니다. `src/components/ui/SearchPill.tsx`를 공통으로 사용합니다.
  - **FilterField**: `rounded-full` 컨테이너 내부에 라벨(Label), 입력 필드(Input), 단위(Unit)를 정돈하여 배치합니다. 수평 및 수직(Vertical) 배치를 모두 지원합니다.
  - **FilterSelect**: `rounded-full` 또는 `rounded-2xl` 컨테이너 내부에 라벨과 Select 요소를 배치합니다. 수평/수직 배치 및 에러 상태 표현을 지원합니다.
  - **FilterWrapper**: 여러 필터 요소를 일관된 간격(`gap-4`)으로 정렬하는 표준 컨테이너입니다.
  - **FilterChips**: 가급적 칩(Chip) 형태의 `rounded-full` 컨테이너를 사용하여 선택된 상태를 명확히 표시합니다. `src/components/ui/FilterChips.tsx`를 활용합니다.
- **Calculators & Visualizations**:
  - **Ratio Progress Bar**: 수치의 임계값(Threshold)에 따라 색상(Emerald/Amber/Rose)을 가변적으로 적용하여 위험도를 직관적으로 표현합니다.
  - **Stacked Bar**: 전체(Total) 대비 각 항목의 점유율을 한 줄의 막대에 겹쳐서 표시하며, 하단에 범례(Legend)를 함께 제공하여 비전문가의 이해를 돕습니다. (`HousingAffordClient.tsx` 참고)
- **공통 상태 분리**:
  - `Loading`: 레이아웃이 크게 흔들리지 않도록 스켈레톤 또는 자리표시자 형태로 먼저 보여줍니다.
  - `Empty`: 비어 있는 이유를 짧게 설명하고, 기본 CTA 1개를 반드시 둡니다.
  - `Empty` 기본 CTA는 현재 화면의 핵심 흐름을 가장 직접 이어 주는 액션을 우선합니다. 우선순위는 `필터 초기화` -> `첫 작업 시작` -> `이전 단계로 이동`입니다.
  - `Error`: 안전한 안내 문구와 함께 `다시 시도` 액션을 기본으로 두고, 가능하면 사용자가 입력한 조건이나 문맥을 유지합니다.
  - `Disabled`: 숨김과 비활성을 구분하고, 왜 지금 실행할 수 없는지 이유를 가까운 위치에 함께 보여줍니다.

## 5. QA & Definition of Done (완료 기준)
- 특정 섹션이나 페이지만 부분적으로 모던해 보이고 주변은 낡아 보이는 '패치워크' 상태가 아니어야 합니다.
- 페이지별로 각기 다른 간격(Spacing), 둥글기(Radius), 그림자(Shadow), 버튼 철학이 혼용되지 않고 전체 프로덕트가 하나의 디자인 언어로 통일되어야 합니다.
- 새로운 UI 추가 시 연관된 공통 컴포넌트부터 정비하여 프로젝트 전반의 완성도를 끌어올립니다.
- 화면별 QA 완료 기준에는 `Loading` / `Empty` / `Error` / `Disabled` 상태가 서로 섞이지 않고 분리되어 있는지 확인하는 항목이 포함되어야 합니다.
