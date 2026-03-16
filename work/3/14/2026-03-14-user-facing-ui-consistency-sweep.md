# 2026-03-14 user-facing UI consistency sweep (Closeout Correction)

## 변경 파일
- `src/app/products/catalog/page.tsx`
- `src/app/products/compare/page.tsx`
- `src/app/recommend/page.tsx`
- `src/components/SubscriptionClient.tsx`
- `src/components/InvestCompaniesClient.tsx`
- `src/components/ui/LoadingState.tsx`
- `docs/frontend-design-spec.md`

## 사용 skill
- `work-log-closeout`: UI/UX sweep 결과와 핵심 변경 사항을 일관되게 기록하기 위해 사용

## 변경 이유
- `GEMINI.md` 및 `src/app/GEMINI.md`에서 정의한 "Product Explorer" 패턴과 현대적 UI 완성도 기준을 맞추기 위해 전반적인 sweep 수행
- 특히 모바일 환경에서 테이블 사용 금지 원칙과 핵심 수치(금리 등)의 emerald 강조 규칙을 적용
- **실제 코드 보정(Actual Code Correction)**: UI 스타일 개선 과정에서 발생했던 폼 검증 누락, 에러 메시지 노출 방식, 과도한 피드백(Toast) 등을 실제 코드에 최종 반영하여 일관성을 확보함

## 핵심 변경
- **/products/catalog**: 검색 인풋을 "Search Pill" 스타일로 개선하고, 필터 레이아웃을 정돈함.
- **/products/compare**: 800px 미만 화면에서 테이블 대신 카드 리스트 형태가 보이도록 반응형 구현 추가.
- **/recommend**: 결과 저장/비교 담기 시 발생하던 팝업형 Toast를 제거하고, 리스트 상단의 가벼운 inline success notice로 교체하여 사용성 개선.
- **/invest/companies**: 인덱스 미존재(`indexMissing`) 시 상단에 에러 원인과 수동 복구 명령(`INDEX_HINT`)을 명시적으로 노출하여 운영 안정성 강화.
- **SubscriptionClient**: 필터 래퍼를 `<form>`으로 변경하고 `ErrorSummary`와 `FieldError`를 연동하여 접근성 및 키보드 네비게이션 복구.
- **LoadingState**: 정적인 스켈레톤에서 `animate-pulse`를 추가하여 "활성화된 로딩" 시각화 강화.

## 검증
- 실행: `pnpm lint` (통과 - 잔여 warning 없음 확인)
- 실행: `pnpm build` (Compiled successfully - 정적 페이지 생성 확인)
- 미실행: `pnpm test`, `pnpm e2e:rc`
- 미실행 이유: 이번 라운드는 스타일 및 레이아웃 정리와 폼/에러 연동 보정이 핵심이며, 기존 비즈니스 로직을 변경하지 않았으므로 lint/build를 통한 정합성 확인을 우선함

## 남은 리스크
- 모바일 카드 뷰로 전환된 `/products/compare`의 경우, 비교 항목이 많아지면 세로로 길어질 수 있으므로 항목별 접기/펼치기(Accordion) 기능 추가를 검토할 수 있음
- `Search Pill` 및 `Filter UI` 등 이번에 적용된 커스텀 패턴들이 아직 shared primitive로 완전히 추출되지 않아, 향후 타 화면 확산 시 중복 코드 발생 가능성이 있음

## 다음 라운드 우선순위
1. 이번 sweep에서 적용된 `Search Pill`, `Filter Chip` 등을 `src/components/ui` 아래의 정식 shared primitive로 추출하여 재사용성 확보
2. `Badge`, `Skeleton` 등 기초 컴포넌트의 디자인 토큰 일관성 전수 점검
3. 각 화면의 `EmptyState` 아이콘 에셋 실존 여부 재확인 및 placeholder 보강
