# 2026-03-14 user-facing UI consistency sweep

## 변경 파일
- `src/app/products/catalog/page.tsx`
- `src/app/products/compare/page.tsx`
- `src/app/recommend/page.tsx`
- `src/components/ui/LoadingState.tsx`
- `docs/frontend-design-spec.md`

## 사용 skill
- `work-log-closeout`: UI/UX sweep 결과와 핵심 변경 사항을 일관되게 기록하기 위해 사용

## 변경 이유
- `GEMINI.md` 및 `src/app/GEMINI.md`에서 정의한 "Product Explorer" 패턴과 현대적 UI 완성도 기준을 맞추기 위해 전반적인 sweep 수행
- 특히 모바일 환경에서 테이블 사용 금지 원칙과 핵심 수치(금리 등)의 emerald 강조 규칙을 적용

## 핵심 변경
- **/products/catalog**: 검색 인풋을 "Search Pill" 스타일로 개선하고, 기간/금리 필터의 UI 레이아웃을 정돈함. 결과 개수 표시에 emerald 포인트를 적용
- **/products/compare**: "모바일 테이블 금지" 원칙에 따라, 800px 미만 화면에서는 테이블 대신 카드 리스트 형태의 비교 뷰가 보이도록 반응형 구현 추가
- **/recommend**: 추천 폼의 입력 필드와 요약 카드를 `Card` 프리미티브와 `emerald` 컬러를 활용해 현대적으로 재구성. 결과 리스트의 정보 위계 정돈
- **LoadingState**: 정적인 카드 형태에서 `animate-pulse`를 추가하여 "활성화된 로딩" 상태임을 시각적으로 전달하도록 개선
- **docs/frontend-design-spec.md**: 이번 sweep에서 확정된 `Search Pill`, `Filter UI`, `모바일 카드 뷰` 규칙을 명문화함

## 검증
- 실행: `pnpm lint` (경고 1건 - InvestCompaniesClient의 미사용 타입 제외하고 통과)
- 실행: `pnpm build` (Compiled successfully, 254 static pages generated)
- 미실행: `pnpm test`, `pnpm e2e:rc`
- 미실행 이유: 이번 라운드는 로직 변경 없는 UI/UX 스타일 및 레이아웃 정리 작업이므로, 기능 단위의 unit/e2e 테스트보다 lint/build를 통한 정적 정합성 확인을 우선함

## 남은 리스크
- `/invest/companies` 화면은 우선순위와 시간 관계상 이번 sweep에서 제외됨. 다음 라운드에서 최소 수정을 통한 정리가 필요함
- 모바일 카드 뷰로 전환된 `/products/compare`의 경우, 항목이 많아지면 세로로 길어질 수 있으므로 항목별 접기/펼치기 기능 추가를 검토할 수 있음

## 다음 라운드 우선순위
1. `/invest/companies` 화면 UI/UX 정돈 (최소 수정)
2. shared primitive 중 `Badge`, `Skeleton` 등의 일관성 추가 점검
3. 각 화면의 `EmptyState` 아이콘 에셋(png) 실존 여부 재확인 및 placeholder 처리 보강
