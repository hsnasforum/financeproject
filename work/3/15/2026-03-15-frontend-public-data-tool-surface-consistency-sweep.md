# Frontend Consistency Sweep: Public Data Tools (2026-03-15)

## Batch Purpose
- `/gov24`, `/public/dart`, `/tools/fx` 사용자 표면을 최신 디자인 언어(Emerald 600, Slate 50/900, `rounded-[2rem]`)로 정렬한다.
- `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 공용 패턴을 적용하여 전체 제품과의 정합성을 높인다.
- 검색, 필터, 결과 리스트의 밀도와 상태 UX(Loading/Empty/Error)를 개선한다.

## Status & Audit
1. **Gov24 (`/gov24`)**:
   - `SectionHeader` 및 `BodyInset` 등 구형 패턴 사용 중.
   - 다단계 폼의 입력 요소와 버튼 스타일이 최근 피드백/설정 화면과 불일치.
   - 검색 결과 리스트의 카드 톤과 여백 보완 필요.

2. **DART Search (`/public/dart`)**:
   - `PageShell`, `PageHeader`는 적용되어 있으나, 검색 바와 결과 항목의 radius 및 폰트 위계 조정 여지 있음.
   - 사이드바(즐겨찾기/최근기록)의 카드 둥글기와 헤더 스타일 통일 필요.

3. **DART Company (`/public/dart/company`)**:
   - `SectionHeader` 사용 중. `PageHeader`로 교체 필요.
   - 기업 상세 정보(`dl`)와 즐겨찾기 리스트의 시각적 밀도 조정 필요.

4. **FX Tool (`/tools/fx`)**:
   - 매우 단순한 폼과 리스트 구조.
   - `PageHeader`, `Card`, `SubSectionHeader`를 적용하여 도구다운 완성도 부여.

## Planning & Strategy
1. **Layout & Header**:
   - 모든 진입점에 `PageShell` (Slate 50 bg) 및 `PageHeader` (3xl font-black) 적용.
   - 브레드크럼이나 "뒤로가기" 링크가 필요한 곳에 일관된 스타일 적용.

2. **Form & Filter**:
   - `input`, `select` 높이를 `h-11`로 맞추고 `rounded-2xl` 적용.
   - 다단계 폼(Gov24)의 진행 표시(Step)를 더 세련되게 표현.

3. **Results & Visualization**:
   - 결과 리스트는 `Card` 기반 또는 구분선이 명확한 리스트 스타일 사용.
   - FX 합계 등 수치 강조 구간에 Emerald 600 톤 적용.
   - 아주 작은 요약 시각화(FX 비중 등)를 검토하되 복잡한 차트는 배제.

4. **States**:
   - `LoadingState`, `EmptyState`를 사용하여 인터랙션 흐름 보장.

## Execution Steps
1. `src/app/gov24/page.tsx` 및 `src/components/Gov24Client.tsx` 리팩토링.
2. `src/components/Gov24ServiceDetailModal.tsx` 모달 UI 정비.
3. `src/app/public/dart/page.tsx` 및 `src/components/DartSearchClient.tsx` 정비.
4. `src/app/public/dart/company/page.tsx` 및 `src/components/DartCompanyPageClient.tsx` 정비.
5. `src/app/tools/fx/page.tsx` 및 `src/components/FxToolClient.tsx` 정비.
6. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] `/gov24`, `/public/dart`, `/tools/fx` 화면이 모두 `PageShell`/`PageHeader` 기반으로 전환됨.
- [x] 입력 요소와 버튼의 radius/height가 공통 spec(`rounded-2xl`, `h-11`)을 따름.
- [x] 검색 결과와 상세 정보의 시각적 위계가 명확해짐.
- [x] 모바일 뷰에서 테이블 대신 카드/리스트 구조가 유지됨.
- [x] `docs/frontend-design-spec.md`에 공공 데이터 도구 패턴 관련 특이사항 반영.

## Summary of Changes
- **Gov24 (`/gov24`)**:
  - `Gov24Client`: 다단계 폼을 `Card`와 `SubSectionHeader` 기반으로 개편. 진행 단계(Step) 표시 및 버튼/입력 스타일을 최신 spec으로 통합. 검색 결과 리스트의 카드 디자인 및 정보 밀도 최적화.
  - `Gov24ServiceDetailModal`: 모달 UI를 `rounded-[2.5rem]` 및 Emerald 톤으로 리뉴얼. 상세 탭(지원대상, 신청방법 등)의 가독성을 위해 리스트 위계 및 원문 보기(`details`) 패턴 적용.
- **DART Search (`/public/dart`)**:
  - `DartSearchClient`: 탭 전환 버튼, 검색 바, 최근 검색어 칩 디자인 통일. 검색 결과 항목의 호버 효과 및 즐겨찾기 토글 위계 강화. 사이드바(즐겨찾기/최근기록)를 `SubSectionHeader`가 포함된 카드 구조로 정렬.
  - `/public/dart/page.tsx`: Suspense fallback 디자인을 `PageShell` 기반으로 개선.
- **DART Company (`/public/dart/company`)**:
  - `DartCompanyPageClient`: `SectionHeader`를 `PageHeader`로 교체. 기업 기본 정보를 `dl` 그리드와 `SubSectionHeader` 기반의 정갈한 레이아웃으로 개편.
- **FX Tool (`/tools/fx`)**:
  - `FxToolClient`: 단순 폼 구조에서 `PageHeader`, `Card` 그리드 구조로 전환. 환산 설정과 결과를 분리하고, 최종 합계(Total Estimate)를 다크 테마 배너로 시각적 강조.
- **Design Spec**:
  - `docs/frontend-design-spec.md`에 `Form & Filter Density` 원칙 추가 및 리스트 카드 패턴 확장.

## Verification Results
- **pnpm build**: 성공
- **pnpm lint**: 에러 없음, 경고 27건 (기존 프로젝트 레벨 미사용 변수)
- **git diff --check**: 통과
