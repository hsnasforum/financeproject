# 2026-03-14 frontend search-pill & filter-primitive extraction

## 변경 파일
- `src/components/ui/SearchPill.tsx` (신규)
- `src/components/ui/FilterField.tsx` (신규)
- `src/app/products/catalog/page.tsx`
- `src/components/BenefitsClient.tsx`
- `src/components/SubscriptionClient.tsx`
- `src/components/InvestCompaniesClient.tsx`
- `docs/frontend-design-spec.md`

## 변경 이유
- 여러 화면에서 반복되는 `rounded-full` 기반의 검색 인풋(Search Pill)과 필터 입력 필드(Filter Field) 패턴을 shared primitive로 추출하여 중복을 제거
- `GEMINI.md` 및 `docs/frontend-design-spec.md`에 명시된 UI 일관성 원칙을 시스템적으로 강제하고 향후 확산 용이성을 확보하기 위함

## 핵심 변경
- **SearchPill Primitive**: 
  - 좌측 돋보기 아이콘, 중앙 입력부, 우측 Clear(X) 버튼을 포함하는 `rounded-full` 형태의 공통 검색 컴포넌트 구현
  - `isLoading` 프롭을 통해 로딩 스피너 통합 지원
- **FilterField Primitive**:
  - 좌측 라벨, 중앙 입력부, 우측 단위(Unit) 접미사를 정돈하여 보여주는 `rounded-full` 형태의 수치 입력 필드 구현
- **화면별 적용**:
  - `Products Catalog`: 검색바를 `SearchPill`로, 기간/최소금리 필터를 `FilterField`로 교체
  - `Benefits`: 키워드 검색 입력을 `SearchPill`로 교체
  - `Subscription`: 키워드 검색 입력을 `SearchPill`로 교체
  - `Invest Companies`: 회사명 검색 입력을 `SearchPill`로 교체
- **문서화**:
  - `docs/frontend-design-spec.md`에 새로 추가된 primitive 패턴을 명문화하여 디자인 시스템 기준선 업데이트

## 검증
- 실행: `pnpm lint` (통과 - 미사용 변수 warning 제거 완료)
- 실행: `pnpm build` (Compiled successfully - 정적 페이지 생성 확인)
- 시각적 확인: 기존에 수동으로 구현했던 `Search Pill` 및 `Filter UI`와 구조적으로 동일하면서도 코드 베이스는 더 간결해짐을 확인

## 남은 리스크
- `FilterField`는 현재 텍스트/수치 입력 기반으로 설계되어 있어, `select` 박스가 포함된 필터(e.g. Subscription의 지역 선택)에는 직접 적용되지 않음. 향후 `FilterSelect` 또는 `FilterWrapper`로의 확장 검토 가능
- `FilterChips`의 경우 `BenefitsClient` 등의 특수한 "전체(All)" 토글 로직과 1:1 매칭되지 않아 이번 배치에서는 개별 화면 로직을 유지함. 추후 더 범용적인 `FilterGroup` 패턴으로 통합 고려

## 다음 라운드 우선순위
1. `Badge`, `Skeleton` 등 기초 UI Primitive의 디자인 토큰(Radius, Spacing) 전수 점검 및 일관성 보정
2. 각 화면의 `EmptyState` 아이콘 에셋 실존 여부 재확인 및 placeholder 보강
3. `FilterSelect` 등 더 다양한 필터 입력 타입을 지원하는 shared primitive 추가
