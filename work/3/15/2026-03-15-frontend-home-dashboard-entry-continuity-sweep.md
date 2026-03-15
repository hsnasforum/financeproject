# Frontend Continuity Sweep: Home & Dashboard (2026-03-15)

## Batch Purpose
- 홈(`/`)과 대시보드(`/dashboard`)를 하나의 통일된 제품 흐름으로 느끼도록 시각 언어를 Emerald/Slate 중심으로 정렬한다.
- 구형 Blue-heavy 톤을 제거하고, `rounded-[2rem]`, `PageShell`, `PageHeader`, `SubSectionHeader` 패턴을 전면 적용한다.
- 진입 지점의 CTA 위계와 상태 표현을 표준화하여 비전문가가 바로 이해할 수 있는 환경을 구축한다.

## Status & Audit
1. **Home Page (`/`)**:
   - `HomeHero`: `bg-[#dcecf8]`(연한 파랑) 및 `bg-[#4f8ef7]`(진한 파랑) 버튼 사용 중. Emerald/Slate 톤으로 교체 필요.
   - `QuickTiles`, `TodayQueue`, `ServiceLinks`: 각자 다른 배경색과 링크 색상 사용. 통일감 부족.
   - `HomeStatusStrip`: `bg-[#111827]`(어두운 파랑) 및 파랑 링크 사용.

2. **Dashboard (`/dashboard`)**:
   - `DashboardClient`: 이미 `PageShell`과 `ReportHeroCard`를 쓰고 있으나, 링크나 배지 색상에 legacy blue가 남아 있음.
   - 카드 내부의 리스트 항목과 폰트 위계를 더 정밀하게 다듬을 여지 있음.

3. **Shared Components**:
   - `ReportHeroCard` (in `ReportTone.tsx`): Blue gradient 베이스를 유지하되 내부 액션 버튼의 톤 보정 필요.

## Planning & Strategy
1. **Color Alignment**:
   - 모든 `#4f8ef7`, `#2383e2`, `#5b95ee` 등의 파랑 계열을 `emerald-600` 또는 `slate-900` 기반으로 교체.
   - 배경색을 `bg-[#f6f7fb]`에서 표준 `bg-slate-50`으로 정렬.

2. **Card & Radius**:
   - 모든 주요 섹션 컨테이너를 `rounded-[2rem]` 또는 `rounded-[2.5rem]`으로 정렬.
   - 그림자 효과(`shadow-sm`)를 일관되게 적용.

3. **Entry CTA Hierarchy**:
   - 주요 이동 경로는 `emerald-600` 텍스트 또는 배경으로 강조.
   - 보조 경로는 `slate-400/500` 톤 유지.

4. **Visual Aids**:
   - `HomeHero`의 슬라이드 테마(Sky/Emerald/Amber)는 유지하되 전체 배경 프레임과의 조화를 맞춤.

## Execution Steps
1. `src/components/home/HomeHero.tsx` 리팩토링 (배경 및 버튼 톤).
2. `QuickTiles`, `TodayQueue`, `HomeStatusStrip`, `ServiceLinks` 순차 정비.
3. `src/components/DashboardClient.tsx` 및 `HomePortalClient.tsx` 컬러링 보정.
4. `src/components/ui/ReportTone.tsx` 내부 클래스 톤 보정.
5. `src/app/page.tsx` 배경색 정렬.
6. `docs/frontend-design-spec.md` 반영.
7. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] 홈과 대시보드의 배경색 및 기본 폰트 색상이 일치함.
- [x] 파랑 계열 legacy 버튼/링크가 Emerald/Slate로 대체됨.
- [x] 모든 진입 카드에 `rounded-[2rem]` 이상의 radius가 적용됨.
- [x] `ReportHeroCard` 내부 액션 위계가 다른 화면과 조화를 이룸.

## Summary of Changes
- **Home Page (`/`)**:
  - `HomeHero`: 배경을 `Slate 100`으로, 메인 버튼을 `Emerald 600`으로 정렬하여 첫인상을 현대화함.
  - `QuickTiles`, `TodayQueue`, `HomeStatusStrip`, `ServiceLinks`: 모든 카드를 `rounded-[2rem]` 이상으로 정렬하고, legacy blue 링크를 `Emerald 600` 및 `Slate 900`으로 교체하여 일관된 톤앤매너 확보.
  - 배경색을 표준 `Slate 50`으로 통일.
- **Dashboard (`/dashboard`)**:
  - `DashboardClient`: 최근 실행 및 액션 카드들의 배경색과 폰트 위계를 홈 포털과 일치시킴. 파랑 링크들을 `Emerald 600`으로 교체.
- **Shared Primitives**:
  - `ReportTone.tsx`: `ReportHeroCard`의 패딩을 `p-8 lg:p-10`으로 늘려 개방감을 확보하고, Primary Action 버튼에 Emerald 톤을 적용하여 시각적 위계 강화.
- **Design Spec**:
  - `docs/frontend-design-spec.md`에 `Entry Surfaces (Home & Dashboard)` 섹션을 추가하여 Hero 및 Portal 카드 구성 원칙 명문화.

## Verification Results
- **pnpm build**: 성공
- **pnpm lint**: 에러 없음, 경고 27건 (클러스터 내 미사용 변수 등)
- **git diff --check**: 통과

## Data Files Exclusion
- `.data/finlife_deposit_snapshot.json`, `.data/finlife_saving_snapshot.json`: 위 파일들은 작업 전부터 worktree에 존재하던 데이터 변경사항으로, 이번 UI/UX 컨텐츠와 무관하므로 스테이징 및 커밋 대상에서 제외함.
