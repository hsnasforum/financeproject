# UI Reference (예시 이미지 기반) — Chip/Tab/Filter/List 패턴

이 프로젝트의 “상품 탐색 UI(/products/*)”는 아래 레이아웃/컴포넌트 패턴을 기본으로 한다.
목표: 예시 이미지처럼 **라이트그레이 배경 + 화이트 카드 + 둥근 칩/탭 + 그린 포인트**.

---

## 1) Visual Tone / Tokens
- Background: 매우 연한 회색(예: `bg-slate-50`/`bg-gray-50`)
- Surface(Card): `bg-white`
- Border: 얇고 은은한 보더(예: `border-slate-200/70`)
- Radius: 크게(예: `rounded-2xl` ~ `rounded-3xl`)
- Shadow: 아주 약하게(예: `shadow-sm`)
- Primary Accent: **그린(emerald)** (선택/강조/수치 강조)
  - 텍스트/보더 강조: `text-emerald-600`, `border-emerald-500`
  - 숫자 강조(최고 금리 등): `text-emerald-600 font-semibold`
- Text:
  - Title: `text-slate-900 font-semibold`
  - Body: `text-slate-700`
  - Muted: `text-slate-500`
- Interaction:
  - hover: `hover:bg-slate-50`
  - focus: `focus-visible:ring-2 focus-visible:ring-emerald-400`

> 주의: 외부 트래킹/외부 로고 다운로드 금지. 금융사 아이콘은 기본 `Bank`/`Building2` 같은 아이콘 또는 이니셜(원형 배지)로 표현.

---

## 2) Layout Pattern (예시 이미지 구조)
### A. 상단 “탐색 헤더 카드(Sticky 권장)”
하나의 큰 카드 안에 아래가 순서대로 들어간다:
1) **세그먼트 탭 바**: 예금/적금/파킹/CMA/저축
2) **금융사(Provider) 선택**: 아이콘+라벨, 가로 스크롤 (기존 검색 입력창 대체)
3) **금융 권역 필터**: 은행 / 저축은행 등 권역 선택 칩
4) **필터 칩 Row**: [필터링] (기간/금액/우대조건 등은 필터링 내부로 통합)
5) **적용된 필터 칩 Row**: 선택된 조건 태그(×) + 우측 리셋 아이콘

모바일:
- 위 헤더 카드는 `sticky top-0` 또는 `sticky top-[header]`로 고정되면 UX가 예시와 유사해짐.
- Provider는 무조건 가로 스크롤.

데스크톱:
- 동일 패턴을 유지하되, 필요하면 좌측 고정 필터(카드) + 우측 리스트 형태로 확장 가능.

---

## 3) Component Specs (핵심 컴포넌트)
### 3.1 Segmented Tabs (Pill)
- 바탕: 둥근 컨테이너(`rounded-full bg-slate-100 p-1`)
- 탭 버튼:
  - inactive: `text-slate-500`
  - active: `bg-white shadow-sm text-slate-900 font-semibold`
- 탭 전환은 Next Link로 페이지 이동해도 OK(`/products/deposit` ↔ `/products/saving`)

### 3.2 Search Pill
- `rounded-full` 인풋 + 오른쪽 clear(X) 버튼
- placeholder는 예시처럼 “최고 금리가 1% 넘는 …” 같은 가이드 문구 가능(하드코딩 가능)
- 입력 아래에 작은 도움말/조건 텍스트 영역을 둘 수 있음(선택)

### 3.3 Provider Carousel (가로 스크롤 칩)
- 각 Provider 칩:
  - 카드형 작은 타일: `min-w-[76px] rounded-xl border bg-white`
  - 상단 아이콘(원형) + 하단 라벨
  - 선택 시: `border-emerald-500 text-emerald-700`
- 좌/우 스크롤 버튼은 데스크톱에서만 표시해도 됨(선택)

### 3.4 Filter Chips Row
- 필터 칩 형태: `rounded-full border px-3 py-1 text-sm`
- 선택/활성 강조:
  - 예시처럼 필터 텍스트가 초록색으로 바뀌거나(활성 상태), “상품유형 1”처럼 선택 개수 표기
- 클릭 시:
  - 모바일: Sheet/Popover
  - 데스크톱: Popover/인라인 확장 영역

### 3.5 Filter Grid (3열)
- 3열 그리드 셀:
  - 셀 border로 구획, 내부에 라벨 + 우측 상단 작은 “+”
  - 선택된 경우 “체크” 또는 라벨이 초록색 + 체크 아이콘
- 하단에 주석 텍스트(`text-xs text-slate-400`) 가능(예: “*신협 상품에는 적용되지 않습니다”)

### 3.6 Applied Filter Chips + Reset
- 적용 필터는 `chip + x` 형태로 나열
- 우측에 리셋(↻) 아이콘 버튼
- 칩은 `bg-slate-700 text-white` 같은 강한 대비도 가능(예시의 진한 칩 느낌)

---

## 4) Result List Pattern
### 4.1 List Header
- 좌: 결과 개수 “191개”에서 숫자는 초록색 강조
- 우: 정렬 드롭다운(예: 최고금리순)

### 4.2 Product List Item (Row)
- 좌측: 원형 배지(아이콘/이니셜)
- 가운데:
  - 상품명(굵게)
  - 금융사명(보조)
  - 가입조건 태그(작은 회색 배지/칩)
- 우측:
  - 최고 금리: 초록색, 크게
  - 최저/기본 금리: 회색, 작게
- divider: 아주 옅은 구분선(행간 넓게)

---

## 5) Shortcut Cards (상단 카테고리 카드 — 선택)
예시 이미지의 “통장/카드/보험” 3개 카드:
- 카드 내부: 제목(굵게) + 설명(보조) + 하단 3개 아이콘 버튼(예금/적금/머니통장 등)
- 이 프로젝트에서는 홈(`/`) 또는 `/products` 상단에 배치 가능.
