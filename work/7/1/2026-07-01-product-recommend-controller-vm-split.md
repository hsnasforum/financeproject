# 2026-07-01 Product/Recommend controller view model split

## 변경 파일
- `src/components/ProductListPage.tsx`
- `src/app/products/catalog/page.tsx`
- `src/app/recommend/page.tsx`
- `src/lib/products/productExplorerUrlState.ts`
- `src/lib/products/catalogExplorer.ts`
- `src/lib/recommend/recommendStorageAdapter.ts`
- `tests/product-explorer-url-state.test.ts`
- `tests/catalog-explorer.test.ts`
- `tests/recommend-storage-adapter.test.ts`

## 사용 skill
- `planning-gate-selector`: 제품/추천 page, client UI, pure helper 변경에 필요한 검증 범위를 고르는 데 사용했습니다.
- `playwright`: `e2e:rc` 브라우저 회귀 검증 전 prerequisite 확인과 실행 범위 판단에 사용했습니다.
- `work-log-closeout`: 변경 후 `/work` 종료 기록 형식을 맞추는 데 사용했습니다.

## 변경 이유
- `ProductListPage`와 `RecommendPageInner`가 URL 파싱, API request 구성, response/storage 파싱, 렌더링을 한 컴포넌트 안에서 함께 처리해 회귀 테스트 단위가 DOM에 묶였습니다.
- `products/catalog`의 `samplebank` source가 production UI에서 기본 노출될 수 있어 mock/fallback 데이터가 실제 데이터처럼 보일 리스크가 있었습니다.

## 핵심 변경
- `productExplorerUrlState`로 상품 탐색 URL state 파싱, FINLIFE request param 구성, URL sync param 구성을 분리했습니다.
- `catalogExplorer`로 통합 상품 catalog query key/request/response-to-view-model 변환과 rate formatting을 분리했습니다.
- `isCatalogSamplebankVisible`을 추가해 production에서는 `NEXT_PUBLIC_PRODUCTS_SAMPLEBANK_VISIBLE` 플래그가 켜진 경우에만 samplebank 선택 UI와 request source가 열리게 했습니다.
- `recommendStorageAdapter`로 추천 결과 localStorage/sessionStorage key, autorun signature, request body 구성, stored result build/parse를 분리했습니다.
- Product/Recommend pure helper 테스트를 추가해 DOM 없이 URL, catalog response, 추천 storage contract를 검증했습니다.

## 검증
- `pnpm vitest run tests/product-explorer-url-state.test.ts tests/catalog-explorer.test.ts tests/recommend-storage-adapter.test.ts tests/product-list-utils.test.ts tests/compare-store.test.ts tests/recommend-unified-adapter.test.ts tests/recommend-score.test.ts`: PASS, 7 files / 22 tests
- `rg -n -e ProductListPage -e RecommendPageInner -e includeSamplebank -e RESULT_STORAGE_KEY -e recommend_autorun_sig -e productShelf src tests`: PASS. `includeSamplebank`는 `samplebankVisible` guard 뒤에 남고, 추천 storage key와 autorun signature는 `recommendStorageAdapter` 상수로 이동했습니다.
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `pnpm test`: PASS, 749 files / 2478 tests
- `PORT=3132 PLANNING_DATA_DIR=.data/planning-e2e-121-full ... pnpm e2e:rc`: PASS, 24 passed / 1 skipped. 기존 누적 e2e 데이터와 분리한 clean data root에서 실행했습니다.
- `pnpm build`: PASS
- `git diff --check`: PASS
- `.data/planning-e2e-121-full`은 작업공간 내부 경로 확인 후 제거했고, 제거 후 `ls -ld .data/planning-e2e-121-full` 결과가 비어 있음을 확인했습니다.
- 재시도: PowerShell에서 `wsl ... -- ls -ld .data/planning-e2e-121-full 2>/dev/null || true`를 직접 실행한 확인 명령은 `||`를 PowerShell이 먼저 해석해 실패했습니다. 같은 의도를 `bash -lc`로 감싸 재실행해 제거 상태를 확인했습니다.

## 남은 리스크
- `ProductListPage`는 렌더링과 product shelf localStorage 연결을 계속 담당합니다. 이번 라운드는 URL/request helper 분리에 초점을 둔 최소 변경이며, shelf controller 분리는 별도 범위입니다.
- `RecommendPageInner`는 submit orchestration과 결과 렌더링을 아직 같은 client tree에서 연결합니다. request/storage contract는 분리했지만, form controller와 results panel 분리는 다음 라운드에서 더 작게 이어갈 수 있습니다.
- 기본 `.data/planning-e2e`에는 이전 라운드에서 확인한 누적 데이터 timeout 리스크가 남아 있어, full e2e는 이번처럼 isolated data root 사용이 안정적입니다.
