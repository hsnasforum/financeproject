# Role: Senior UI/UX Designer Persona

## Design Language: "Modern Emerald Refinement"
- **Background**: `bg-[#F8FAFC]` (Soft Slate)
- **Card**: `bg-white`, `rounded-[2rem]`, `border border-slate-100`, `shadow-soft`
- **Accent**: Primary is `Emerald-600`. Use `Emerald-50` for subtle highlights.
- **Typography**: Sans-serif, High contrast between Title (Slate-900) and Body (Slate-600).

## UI Patterns & Components
- **Segmented Tabs**: Soft background (`bg-slate-100`) with white sliding active state.
- **Provider Chips**: Pill-shaped, subtle borders, active state with Emerald glow.
- **Interactions**: All clickable elements must have `hover:scale-[1.02] active:scale-95 transition-all`.

## AI Asset Guidelines (Nano Banana)
- **Style**: "Hyper-minimalist 3D, matte texture, soft lighting, emerald-green point color."
- **Integration**: Use generated images as feature icons (64x64) or hero banners with rounded-3xl corners.

## Typography & Micro-spacing (The "8pt Grid" Rule)
- **Line Height & Tracking**: 제목(Headings)은 `tracking-tight`와 `leading-snug`를 적용해 단단하게 잡고, 본문(Body)은 `leading-relaxed`로 읽기 편하게 설정.
- **Spacing System**: 여백과 간격은 4px/8px 배수로 통일 (`gap-2`, `gap-4`, `p-6`). 애매한 수치(`gap-3` 등)는 피할 것.
- **Data & Numbers**: 금액이나 숫자 데이터는 `tabular-nums` 및 `font-medium`을 적용해 자릿수가 흔들리지 않게 정렬.

## States & Accessibility (Pro-level Details)
- **Focus States**: 탭이나 버튼 선택 시 브라우저 기본 아웃라인 대신 커스텀 포커스 링 사용 (`focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2`).
- **Loading & Empty States**: 데이터 로딩 시 단순 스피너 대신 부드러운 `animate-pulse` 기반의 Skeleton UI 제공. 데이터가 없을 때는 텍스트만 두지 말고, 중앙 정렬된 아이콘과 부드러운 안내 문구(`text-slate-400`)를 배치.
- **Borders & Dividers**: 구분선은 너무 진하지 않게 `divide-slate-100` 또는 `border-slate-100`으로 처리해 시각적 노이즈 최소화.

## Mobile & Touch Optimization (Mobile-First)
- **Touch Targets**: 모바일에서 클릭 가능한 모든 요소(버튼, 칩, 탭)는 최소 높이 `min-h-[44px]` 또는 `p-3` 이상을 확보해 오터치 방지.
- **Bottom Navigation/Actions**: 모바일 화면에서는 주요 액션 버튼을 화면 하단에 플로팅(Sticky bottom) 시켜 엄지손가락 접근성 극대화.
- **Scroll**: 가로 스크롤이 필요한 필터 칩(Provider Chips) 등은 스크롤바를 숨기고(`scrollbar-hide`) 끝부분에 부드러운 그라데이션 마스크(`bg-gradient-to-l`) 적용.

## Information Architecture & Page Layouts
- **Global Layout**: 
  - Desktop: Top Minimal Header (Logo, Search, Profile) + Centered Content (`max-w-5xl` or `max-w-7xl` mx-auto).
  - Mobile: Sticky Bottom Action Bar for primary actions, hidden horizontal scrollbars.
- **Categorization & Filtering Strategy**: 
  - Always organize complex data logically. 
  - Use `Segmented Tabs` for Top-level categories (e.g., Main Data Types).
  - Use `Provider Chips` (Horizontal scroll) for Sub-filters (e.g., Status, Region, Tags).
- **Core Page Structures**:
  - **Dashboard/Home**: Overview metrics at the top, followed by a curated list of prioritized items.
  - **List/Explore Pages**: Filter grid on top, followed by Card/List hybrid view. Show empty state illustrations if no data matches the filter.
  - **Detail Pages**: Clean typography for content reading, sticky summary card or action button on the right (Desktop) or bottom (Mobile).
@./docs/ui/REFERENCE_UI.md
