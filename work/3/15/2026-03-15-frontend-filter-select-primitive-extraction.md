# 2026-03-15 frontend filter-select primitive extraction

## 목적
- `Select`-기반 필터 UI의 재사용 가능한 Primitive (`FilterSelect`) 및 컨테이너 (`FilterWrapper`) 정립
- 여러 화면(`Benefits`, `Subscription`, `InvestCompanies`, `Recommend`, `RecommendHub`, `RecommendPage`)에 흩어진 필터 UI의 시각 언어(Radius, Spacing, Typography) 통일
- 비즈니스 로직 및 데이터 흐름을 건드리지 않는 순수 UI/UX 개선

## 변경 사항

### 1. UI Primitive 강화 및 추가
- **`src/components/ui/FilterSelect.tsx` (신규)**:
  - `labelPosition` ("horizontal" | "vertical") 프로프 추가로 다양한 레이아웃 지원
  - `error` 프로프 통합 및 `FieldError` 내장으로 일관된 에러 피드백 (Rose 톤) 제공
  - `Omit`을 사용하여 표준 `size` 속성과의 충돌 해결
- **`src/components/ui/FilterField.tsx`**:
  - `labelPosition` ("horizontal" | "vertical") 프로프 추가
- **`src/components/ui/FilterWrapper.tsx` (신규)**:
  - 여러 필터 요소를 `gap-4` 간격으로 정렬하고 줄바꿈을 지원하는 표준 flex 컨테이너

### 2. 화면별 적용
- **`BenefitsClient.tsx`**: `FilterWrapper` 도입 및 필터 레이아웃 정돈
- **`SubscriptionClient.tsx`**: 수동으로 관리하던 에러 필드와 Select를 `FilterSelect`의 `error` 프로프로 통합, `FilterWrapper` 적용
- **`InvestCompaniesClient.tsx`**: 검색 및 정렬 필터 영역에 `FilterWrapper` 적용
- **`RecommendClient.tsx`**: 레거시(raw) `select` 및 `input`을 `FilterSelect`, `FilterField`로 교체하여 시각적 완성도 상향
- **`RecommendHubClient.tsx`**: 복잡한 수직/수평 혼합 레이아웃을 `labelPosition` 프로프를 통해 간결하게 구조화
- **`src/app/recommend/page.tsx`**: 설정 폼 내의 `select`를 `FilterSelect`로 교체하여 일관성 확보

### 3. 문서 업데이트
- **`docs/frontend-design-spec.md`**: 새로 정립된 `FilterWrapper` 및 확장된 `FilterField`, `FilterSelect` 기준 명시

## 검증 결과
- **Lint**: `pnpm lint` 통과 (Unused imports 정리 완료)
- **Build**: `pnpm build` 통과 (Type errors 및 Prop conflicts 해결 완료)
- **Whitespace**: `git diff --check` 통과 (Trailing whitespace 제거 완료)
- **UI 정합성**: 모든 대상 화면에서 `FilterWrapper`의 `gap-4` 규칙과 `FilterSelect`의 일관된 Radius/Color 언어 확인

## 남은 UI debt
- `FilterField`의 Radius 토큰을 `rounded-full` 고정에서 `size`에 따라 `Small Radius` (`rounded-xl`)를 선택할 수 있게 확장 고려 필요 (현재는 `rounded-full` 위주)
