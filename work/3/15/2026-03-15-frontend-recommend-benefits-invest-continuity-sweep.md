# Frontend Continuity Sweep: Recommend, Benefits, Invest (2026-03-15)

## Batch Purpose
- `/recommend`, `/benefits`, `/invest/companies` 사용자 표면을 최신 디자인 언어로 정렬한다.
- 정보 위계(Input -> Summary -> Results -> Detail)를 강화하고 시각적 일관성을 확보한다.
- `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 패턴을 전면 적용한다.
- 비전문가의 빠른 판단을 돕는 작은 시각화(Score Bar, Quality Badge, Status Strip)를 보강한다.

## Status & Audit
1. **Recommend Hub (`/recommend`)**:
   - `PageHeader`는 쓰고 있으나 `main` 태그 기반. `PageShell` 통합 필요.
   - 매칭 점수와 분석 요약 영역의 시각적 완성도 보완 여지.
   - 추천 사유(Reasons)와 CTA 버튼의 위계 조정.

2. **Public Benefits (`/benefits`)**:
   - `BenefitsClient`가 `main` 태그 기반. `PageShell` 통합 필요.
   - 검색 결과 요약 바와 전국/미상 포함 토글의 디자인 정합성.
   - 혜택 카드 내 정보 가독성 및 품질 배지(Info completeness) 시각화.

3. **Invest Companies (`/invest/companies`)**:
   - `InvestCompaniesClient`가 `main` 태그 기반. `PageShell` 통합 필요.
   - 회사 목록과 상세 정보의 2컬럼 레이아웃 밸런스 조정.
   - 인덱스 미구축(Missing Index) 상태의 안내 및 액션 위계 정렬.

## Planning & Strategy
1. **Unified Page Shell**:
   - 모든 화면을 `PageShell` (Slate 50 bg) 기반으로 통일.
   - `PageHeader`의 타이틀과 설명을 표준화.

2. **Visual Enhancements**:
   - **Recommend**: 추천 아이템 카드에 '매칭 점수 바(Progress Bar)' 추가.
   - **Benefits**: 혜택 카드 상단에 '정보 충실도' 상태 스트립 적용.
   - **Invest**: 검색 결과 요약에 '인덱스 상태 스트립' 적용 (DART 검색과 동일 패턴).

3. **Standardized Radii & Buttons**:
   - 모든 입력 요소와 버튼을 `rounded-2xl` 및 `rounded-full` 표준에 맞춤.
   - 호버 상태 배경색을 `bg-slate-50`으로 정렬.

## Execution Steps
1. `src/app/recommend/page.tsx` 리팩토링 (PageShell 적용 및 결과 카드 강화).
2. `src/components/BenefitsClient.tsx` 리팩토링 (PageShell 적용 및 카드 정보 위계 정비).
3. `src/components/InvestCompaniesClient.tsx` 리팩토링 (PageShell 적용 및 2컬럼 위계 정비).
4. `docs/frontend-design-spec.md` 반영.
5. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] 세 화면이 모두 동일한 `PageShell`/`PageHeader` 기반으로 전환됨.
- [x] 추천 점수 및 혜택 정보 충실도가 시각적으로 명확히 표현됨.
- [x] 입력 폼과 결과 요약의 정보 위계가 공통 spec을 따름.
- [x] 모든 버튼과 카드가 `Emerald/Slate` 표준 디자인을 준수함.

## Summary of Changes
- **Recommend Hub (`/recommend`)**:
  - `RecommendPageInner` (in `page.tsx`): `main` + `Container`를 `PageShell`로 교체.
  - **시각화**: 추천 아이템 카드에 **Score Bar** (매칭 점수 진행 바)를 추가하여 AI 추천의 근거를 시각화함.
  - 요약 카드 디자인 개선 및 가중치 설정(Advanced) UI 정비.
- **Public Benefits (`/benefits`)**:
  - `BenefitsClient`: `main` + `Container`를 `PageShell`로 교체.
  - **시각화**: 혜택 카드 상단에 **Quality Badge** (정보 충실도: HIGH/MED/LOW)를 적용하여 데이터 신뢰도를 직관적으로 표시함.
  - 상세 모달 UI를 최신 톤앤매너로 리뉴얼하고 `applyShortcut` (신청 바로가기) 위계 강화.
- **Invest Companies (`/invest/companies`)**:
  - `InvestCompaniesClient`: `main` + `Container`를 `PageShell`로 교체.
  - 2컬럼 레이아웃의 밸런스를 조정하고, 선택된 기업의 상세 프로필을 다크 테마 카드(`bg-slate-900`)로 강조함.
  - **인덱스 상태**: DART 검색과 동일한 인덱스 미구축(Missing Index) UI 패턴을 적용하여 일관성 확보.
- **Design Spec**:
  - `docs/frontend-design-spec.md`에 `Score Bar` 및 `Quality Badge` 패턴 추가.

## Verification Results
- **pnpm build**: 성공
- **pnpm lint**: 에러 없음, 경고 27건 (클러스터 내 미사용 변수 등)
- **git diff --check**: 통과

## Data Files Exclusion
- `.data/finlife_deposit_snapshot.json`, `.data/finlife_saving_snapshot.json`: UI/UX 작업 범위 밖의 데이터 스냅샷으로 스테이징 및 커밋 대상에서 제외함.
