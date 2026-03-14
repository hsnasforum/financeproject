# 2026-03-14 frontend badge-skeleton-token-consistency-audit

## 변경 파일
- `src/components/ui/Badge.tsx`
- `src/components/ui/Skeleton.tsx`
- `src/components/ui/LoadingState.tsx`
- `src/components/ui/EmptyState.tsx`
- `docs/frontend-design-spec.md`

## 변경 이유
- `Badge`, `Skeleton`, `LoadingState`, `EmptyState` 등 피드백/상태 관련 UI Primitive의 디자인 토큰(Radius, Spacing, Typography) 불일치 해결
- `GEMINI.md` 및 `docs/frontend-design-spec.md`에서 정의한 현대적이고 일관된 UI 완성도 기준을 시스템적으로 맞추기 위함

## 핵심 변경
- **Radius 토큰 통일**:
  - `Base Radius`: `rounded-[2rem]` (32px) - `LoadingState`, `EmptyState`에 적용하여 대형 카드/컨테이너 일관성 확보
  - `Small Radius`: `rounded-xl` (12px) - `Skeleton`에 적용하여 버튼 및 리스트 아이템과 조화
  - `Pill Radius`: `rounded-full` - `Badge`에 유지하여 탭/검색바와 일관성 유지
- **Typography & Tone**:
  - `Badge`: `font-black`, `uppercase`, `tracking-widest`를 적용하여 가독성과 전문적인 인상 강화
  - `LoadingState`: 제목(`font-black`)과 설명(`font-bold`)의 위계를 명확히 하고, 중앙 정렬 및 전용 스피너 애니메이션 추가
  - `EmptyState`: 제목(`font-black`)과 설명(`font-bold`)의 텍스트 톤을 `slate-900` 및 `slate-500`으로 정돈
- **문서화**:
  - `docs/frontend-design-spec.md`에 명확한 Radius 토큰(Base, Small, Pill)을 명시하여 향후 개발 기준선 확립

## 영향 받은 화면
- `/products/catalog`: 상품 카드 내의 `Badge` 및 로딩 시 `LoadingState`
- `/benefits`: 혜택 카드 내의 `Badge` 및 검색 결과 없을 때 `EmptyState`
- `/recommend`: 추천 결과 카드 내의 `Badge` 및 분석 중 `LoadingState`
- `/invest/companies`: 회사 목록 로딩 및 상세 정보 부재 시 `EmptyState`

## 검증
- 실행: `pnpm lint` (통과)
- 실행: `pnpm build` (Compiled successfully - 정적 페이지 생성 확인)
- 시각적 확인: 각 컴포넌트가 `2rem` (Base) 또는 `12px` (Small)의 공통 반지름 규칙을 따르며, 텍스트 위계가 Geist Sans 기반의 굵은 폰트 스타일로 통일됨을 확인

## 남은 UI debt
- `FilterSelect` 또는 `FilterWrapper`를 통한 다양한 필터 입력 타입의 shared primitive 추가
- 일부 레거시 화면에서 하드코딩된 `rounded-2xl` 등의 값을 신규 정의된 `Base/Small` 토큰으로 점수 교체 필요
