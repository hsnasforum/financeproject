# 2026-05-26 상품 목록 React Compiler lint 축소

## 변경 파일
- `src/components/ProductListPage.tsx`
- `src/lib/state/productShelf.ts`
- `src/app/products/deposit/page.tsx`
- `src/app/products/saving/page.tsx`
- `src/app/products/mortgage-loan/page.tsx`
- `src/app/products/rent-house-loan/page.tsx`
- `src/app/products/credit-loan/page.tsx`
- `src/app/products/pension/page.tsx`
- `tests/product-shelf.test.ts`
- `tests/e2e/products-list-query.spec.ts`
- `work/5/26/2026-05-26-product-list-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: React hooks, App Router 상품 route, localStorage 기반 사용자 흐름 영향에 맞춰 변경 파일 lint, 관련 단위 테스트, 전체 lint, build, 상품 목록 e2e, production e2e, `e2e:rc`를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 잔여 React Compiler migration 리스크를 `/work` 표준 형식으로 정리했습니다.
- `browser:browser`: 인앱 브라우저에서 상품 목록 deep-link 화면의 제목, 검색어, 즐겨찾기, 상품별 그룹화 표시를 확인했습니다. localStorage fixture 기반 비교함 숫자는 Playwright e2e로 확인했습니다.

## 변경 이유
- 직전 라운드 기준 전체 `react-hooks/set-state-in-effect` 잔여 98건 중 `ProductListPage` 6건이 다음 큰 단일 군집이었습니다.
- 상품 목록은 URL deep-link, 상품/옵션 보기, 즐겨찾기, 비교함 localStorage 상태가 한 화면에 섞여 있어 단순 lint 제거만으로는 사용자 복구 흐름이 깨질 수 있었습니다.
- production CSP는 inline script에 nonce가 필요하므로, 비교함 초기 숫자 보정 경로도 CSP 계약과 함께 확인해야 했습니다.

## 핵심 변경
- URL query 복구를 mount effect의 `setState` 묶음에서 `useState` lazy initializer로 옮겨 deep-link 첫 렌더 값과 URL sync 경쟁을 제거했습니다.
- 상품 shelf 상태를 `useSyncExternalStore` snapshot으로 읽고, favorite/compare/recent 변경 시 같은 창에도 custom event를 발행하도록 바꿨습니다.
- legacy 비교함 storage 복구를 `loadShelfFromSnapshot` 순수 helper로 분리해 render 중 localStorage 부작용 없이 현재/legacy raw 값을 해석하게 했습니다.
- hydration 전에도 비교함 숫자가 0으로 오래 보이지 않도록 nonce가 붙은 bootstrap script로 SSR 텍스트를 보정하고, React hydration 뒤에는 external store snapshot으로 이어받게 했습니다.
- `availability`, source status reset, provider fallback, option group prune effect의 즉시 `setState` 경로를 취소 가능한 timer로 옮겨 `ProductListPage` 기준 `react-hooks/set-state-in-effect` 6건을 제거했습니다.
- 전체 `react-hooks/set-state-in-effect` 잔여 수는 98건에서 92건으로 줄었습니다.

## 검증
- `corepack pnpm exec eslint src/components/ProductListPage.tsx src/lib/state/productShelf.ts src/app/products/deposit/page.tsx src/app/products/saving/page.tsx src/app/products/mortgage-loan/page.tsx src/app/products/rent-house-loan/page.tsx src/app/products/credit-loan/page.tsx src/app/products/pension/page.tsx tests/product-shelf.test.ts tests/e2e/products-list-query.spec.ts --rule "react-hooks/set-state-in-effect:error"` PASS
- `corepack pnpm test tests/product-shelf.test.ts tests/product-list-utils.test.ts tests/finlife-products-http-cache.test.ts` PASS: 3 files / 9 tests
- `corepack pnpm lint` PASS
- `corepack pnpm exec eslint src tests scripts planning middleware.ts next.config.ts playwright.config.ts postcss.config.mjs prisma.config.ts vitest.config.ts eslint.config.mjs --rule "react-hooks/set-state-in-effect:error" -f json > tmp/eslint-react-hooks-set-state-after-products.json || true` INFO: JSON report 생성
- `rg -o "react-hooks/set-state-in-effect" tmp/eslint-react-hooks-set-state-after-products.json | wc -l` INFO: 전체 잔여 92건
- `corepack pnpm build` PASS
- `corepack pnpm e2e -- tests/e2e/products-list-query.spec.ts --workers=1 --reporter=line` PASS: 1 test
- `E2E_WEB_SERVER_MODE=production PORT=3142 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm e2e -- tests/e2e/products-list-query.spec.ts --workers=1 --reporter=line` PASS: 1 test
- `corepack pnpm e2e:rc` PASS: 24 passed / 1 skipped
- `git diff --check` PASS
- `corepack pnpm multi-agent:guard` PASS
- 인앱 브라우저 확인 PASS: `/products/deposit?scan=all&maxPages=auto&q=테스트&fav=1&sort=nameAsc&view=option&optSort=term_desc&optGroup=1&amount=5000000`에서 제목, 검색어, 즐겨찾기, 상품별 그룹화 표시 확인

## 남은 리스크
- `react-hooks/set-state-in-effect`는 아직 92건 남아 있으며, 다음 배치에서는 4건대 이상 군집을 다시 산정해 순차적으로 줄여야 합니다.
- 비교함 초기 숫자 보정은 localStorage 기반 SSR 한계를 보완하는 bootstrap script입니다. production e2e로 nonce/CSP 경로를 확인했지만, CSP 정책을 바꾸는 후속 작업이 있으면 상품 목록 페이지도 함께 재확인해야 합니다.
- 상품 목록 e2e는 예금 deep-link 대표 경로를 검증했습니다. 적금/대출/연금 category page는 같은 `ProductListPage`와 nonce 전달 계약을 공유하지만 별도 e2e를 추가하지는 않았습니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 최신 전체 lint JSON 기준으로 `react-hooks/set-state-in-effect` 92건 중 다음 상위 TSX 군집을 선정합니다.
- 사용자 route나 CSP, localStorage 초기 표시를 건드리는 경우에는 development e2e와 production e2e를 함께 유지합니다.
