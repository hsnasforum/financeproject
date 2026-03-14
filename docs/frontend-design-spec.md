# Frontend Design Specification (v1.0)

## 1. Overview & Direction
- **Mission**: 현대적이고 일관된 완성도 높은 UI/UX 경험 제공
- **Core Mood**: 신뢰감(Trust), 세련됨(Modern), 가볍지만 전문적임(Light & Professional)
- **Key Principle**: 기존 레거시 디자인 보존보다 전체적인 통일성과 완성도를 최우선으로 합니다. 낡은 느낌(Old-looking)을 배제하고 모바일에서 데스크톱까지 자연스러운 반응형(Responsive) 레이아웃을 제공합니다.

## 2. Tech Stack & Styling
- **Framework**: Next.js 16 (App Router), React 19
- **Styling**: Tailwind CSS v4, Framer Motion (애니메이션 및 인터랙션)
- **Component Strategy**: `src/components/ui/` 폴더 기반의 재사용 가능한 UI Primitive 컴포넌트(e.g., Button, Card, Badge, SegmentedTabs)를 적극 활용하며, 1회성 하드코딩 스타일은 최소화합니다.

## 3. Design Tokens (기본 테마)
- **Color Palette**:
  - `Primary`: `#059669` (Emerald 600) - 최고금리, 핵심 수치, 주요 액션 강조에 통일하여 사용
  - `Background`: `#f8fafc` (Slate 50) 바탕 / `Surface`: `#ffffff` (White)
  - `Text`: `Foreground` (`#0f172a`), `Secondary` (`#475569`), `Muted` (`#94a3b8`)
- **Typography**: 시스템 폰트(geist-sans 계열) 기반으로 자신감 있고 읽기 쉬운 텍스트 구성
- **Spacing & Layout**: 답답하고 촘촘한 레이아웃을 피하고, 넉넉하고 정돈된 여백(Spacing scale) 리듬 유지
- **Radius & Shadow**:
  - 기본 Radius: `2rem`, 소형 Radius: `1rem`
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
  - **Search Pill**: `rounded-full` 배경에 검색 아이콘이 포함된 인풋을 사용하며, 우측에 Clear(X) 버튼을 포함합니다.
  - **Filter UI**: 가급적 칩(Chip) 또는 `rounded-full` 컨테이너를 사용하며, 입력 필드가 필요한 경우 좌측 라벨과 우측 단위(Months, %)를 명확히 구분하여 정돈된 형태를 유지합니다.
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
