# 2026-07-11 Issue #121 상품 목록 view model 경계 분리

## 변경 파일

- `src/components/ProductListPage.tsx`
- `src/lib/products/productListViewModel.ts`
- `tests/product-list-view-model.test.ts`
- `tests/e2e/products-list-query.spec.ts`
- `tests/e2e/helpers/e2eTest.ts`
- `work/7/11/2026-07-11-issue-121-product-list-view-model.md`

## 사용 skill

- `finance-skill-routing`: 상품·추천 구조 변경에 필요한 저장소 skill 조합 선택
- `planning-gate-selector`: 순수 로직, page, E2E 영향에 맞는 최소·최종 검증 세트 선택
- `playwright`: specialized 상품 query 흐름과 전체 RC 사용자 흐름 확인
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 표준 종료 기록으로 정리
- `github:yeet`: 의도한 파일만 커밋·push하고 Issue 연결 PR을 게시하는 절차 적용

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/121
- 범위 합의 코멘트: https://github.com/hsnasforum/financeproject/issues/121#issuecomment-4937994668
- 작업 브랜치: `codex/121-product-list-view-model`
- 기준 main: `d90e69fdb5661998bc0bf2c8cd6ef9952b27bce3`
- `ProductListPage`가 이미 분리된 filter, list, option helper를 여러 `useMemo`에서 직접 조립해 처리 순서와 합계 계약을 페이지 수정과 함께 검토해야 했습니다.
- fetch, query, storage, freshness, pagination, JSX를 건드리지 않고 파생 데이터 파이프라인만 순수 builder로 묶어 변경 영향 범위를 줄였습니다.

## 핵심 변경

- 금융사 필터 -> 조건 필터 -> 검색·즐겨찾기 -> 정렬 -> 이유 보강 -> option flatten·group -> totals 순서를 `buildProductListViewModel`로 고정했습니다.
- `ProductListPage`의 파생 `useMemo` 묶음을 builder 호출 하나로 교체하고 파일을 939줄에서 914줄로 줄였습니다.
- product view의 provider·조건·query·favorite·sort·reason·totals, option view의 기간 정렬·group·totals, null payload를 단위 테스트 3건으로 고정했습니다.
- `/products/pension?q=감마&sort=nameAsc`의 API mock, 검색 결과, URL 유지 계약을 Playwright로 추가 확인했습니다.
- specialized 상품 E2E에서 실제 React effect가 실행되도록 공통 HMR guard의 예외 경로에 `/products`를 추가했습니다. 이 변경은 테스트 환경에만 적용됩니다.
- fetch와 `cache: "no-store"`, URL query 파싱·동기화, API 응답 변환, shelf storage, freshness, pagination, JSX는 그대로 유지했습니다.

## 검증

- `corepack pnpm vitest run tests/product-list-view-model.test.ts tests/product-list-utils.test.ts tests/finlife-filters.test.ts tests/finlife-option-view.test.ts tests/product-explorer-url-state.test.ts`: PASS, 5 files / 12 tests
- `DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs test tests/e2e/products-list-query.spec.ts --workers=1`: PASS, 2 tests
- specialized E2E 작성 중 첫 실행은 catalog 전용 placeholder selector 불일치, 두 번째 실행은 기존 HMR WebSocket mock으로 payload가 적용되지 않아 실패했습니다. selector를 실제 specialized 화면에 맞추고 `/products` HMR 예외를 추가한 최종 실행은 통과했습니다.
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 799 files / 2,695 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 검사와 250 static pages 생성
- `corepack pnpm browser-storage:check`: PASS, 36 files
- 첫 `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: FAIL, 25 passed / 1 skipped / 1 failed. 변경 범위 밖의 저장 리포트 상세 이동이 60초를 초과했고 Playwright trace 파일 `ENOENT`가 함께 발생했습니다.
- `DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --grep "planning reports dashboard save handoff exposes a saved detail destination" --workers=1`: PASS, 해당 파일 10 tests. 최초 실패 케이스는 4.1초에 통과했습니다.
- 최종 `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / 1 skipped
- `corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, fixture 8 tests와 fast E2E 8 tests 포함, sandbox `/tmp/planning-v2-compat-plW5rS`
- `corepack pnpm planning:v2:regress`: PASS, golden case 9건과 full E2E 10 tests 포함
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 독립 reviewer: actionable finding 없음. 처리 순서, null payload, product·option 합계, query·storage·cache 계약이 기존 의미를 유지한다고 확인했습니다.

## 계약 영향

- public URL 추가·삭제·redirect: 없음
- specialized product query 이름·의미와 URL 동기화: 변경 없음
- `/api/finlife/*` 요청·응답 shape와 response parsing: 변경 없음
- shelf storage key, compare/favorite/recent payload shape: 변경 없음
- DB schema와 migration: 변경 없음
- Prisma query와 query semantics: 변경 없음
- cache/revalidation 및 `cache: "no-store"` 동작: 변경 없음

## 회귀 방지 범위

- provider·조건·검색·favorite 필터와 product 정렬이 기존 순서로 합성되는 계약을 고정합니다.
- product 이유 보강 이후 option row를 만들고, option 기간 정렬과 선택적 product group을 적용하는 순서를 고정합니다.
- product view와 option view가 서로 다른 visible count를 사용하면서 전체 원본 product·option count는 유지하는 계약을 고정합니다.
- null payload가 빈 filter option, 빈 row·group, 0 totals로 안전하게 변환되는 계약을 고정합니다.
- specialized 상품 URL에서 query 검색 결과와 URL 상태가 유지되는지 실제 브라우저로 확인합니다.

## 남은 리스크

- `ProductListPage`에는 fetch, query 동기화, shelf storage 구독·쓰기, freshness, pagination, JSX orchestration이 남아 있습니다. Issue #121의 controller 수용 기준을 마무리하려면 한 흐름씩 좁은 hook 또는 controller helper로 분리할 필요가 있습니다.
- specialized E2E는 pension 검색 query를 확인하며 provider·조건·favorite ID·option group·count 전환을 브라우저에서 직접 검증하지 않습니다. 순수 builder 단위 테스트는 해당 분기를 검증합니다.
- shelf 갱신 때 `Set` identity에 따른 `useMemo` 재계산과 열린 option group 유지 여부를 확인하는 React 통합 테스트는 없습니다.
- 첫 전체 RC 로그에서 로컬 DB의 `Product` 테이블 부재와 상품 비교 수 hydration 경고가 함께 관측됐지만 최종 전체 RC에서는 재현되지 않았습니다. 이번 변경은 DB 조회와 compare bootstrap을 수정하지 않았으므로 별도 재현 전에는 구조 변경 범위에 포함하지 않습니다.
- Issue #121은 fetch/query/storage controller 경계가 남아 있어 이번 PR로 닫지 않습니다.

## 롤백 기준

- 필터·정렬·group·totals 처리 순서가 기존 화면과 달라지면 builder 호출을 제거하고 이전 개별 `useMemo` 조합으로 복원합니다.
- specialized 상품 query, shelf 상태, option group 표시 회귀가 확인되면 public/storage 계약을 바꾸지 않고 이번 view model commit만 되돌립니다.
- 테스트 HMR 예외가 다른 `/products` E2E를 불안정하게 만들면 runtime 코드는 유지하고 helper 예외만 되돌립니다.

## 다음 라운드 우선순위

1. Issue #121에서 ProductListPage의 fetch lifecycle과 query/storage orchestration 중 독립 검증 가치가 가장 큰 한 경계를 다시 읽고 좁은 controller hook 또는 helper 후보를 선택합니다.
2. shelf 갱신과 option group 상태를 다루는 React 통합 테스트가 작은 범위로 가능한지 검토합니다.
3. ProductList controller 경계가 충분히 좁아진 뒤 Issue #121 수용 기준 충족 여부를 재평가합니다.
