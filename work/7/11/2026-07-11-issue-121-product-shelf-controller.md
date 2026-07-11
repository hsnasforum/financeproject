# 2026-07-11 Issue #121 상품 shelf controller 경계 분리

## 변경 파일

- `docs/browser-storage-inventory.json`
- `src/components/ProductListPage.tsx`
- `src/components/products/useProductShelfController.ts`
- `tests/product-shelf-controller.test.ts`
- `tests/e2e/products-list-query.spec.ts`
- `work/7/11/2026-07-11-issue-121-product-shelf-controller.md`

## 사용 skill

- `finance-skill-routing`: 상품 storage 구조 변경에 필요한 저장소 skill 조합 선택
- `planning-gate-selector`: helper, React hook, page, browser storage, E2E 영향에 맞는 검증 세트 선택
- `playwright`: 저장 shelf hydration, favorite·compare·recent 명령, console warning과 전체 RC 사용자 흐름 확인
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 표준 종료 기록으로 정리
- `github:yeet`: 의도한 파일만 staging·commit·push하고 Issue 연결 PR을 게시하는 범위 확인. WSL에 `gh`가 없어 PR 생성·조회는 인증된 GitHub 앱 경로를 사용

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/121
- 범위 합의 코멘트: https://github.com/hsnasforum/financeproject/issues/121#issuecomment-4941698198
- 작업 브랜치: `codex/121-product-shelf-controller`
- 기준 main: `4d13d526620892bd73012649deffea2ef9950b40`
- `ProductListPage`가 current/legacy localStorage snapshot, same-tab·cross-tab subscription, favorite·compare·recent 명령과 rendering을 함께 소유했습니다.
- compare count를 hydration 전에 바꾸는 inline script가 specialized 상품 E2E에서 script-tag 경고와 hydration mismatch를 발생시켰습니다.
- URL query controller, source status/freshness, pagination, route page nonce 정리는 제외하고 shelf storage 경계만 분리했습니다.

## 핵심 변경

- `useProductShelfController`가 `useSyncExternalStore` subscription, current/legacy snapshot 읽기와 shelf 명령을 소유합니다.
- current/legacy raw 값은 ad-hoc separator 대신 JSON tuple snapshot으로 만들고 `loadShelfFromSnapshot`의 기존 migration 의미를 재사용합니다.
- snapshot projection을 `useMemo`로 고정해 snapshot이 같을 때 favorite·compare `Set` identity를 유지합니다.
- inline compare-count bootstrap script를 제거하고 server empty snapshot에서 client storage snapshot으로 정상 갱신되도록 했습니다.
- `ProductListPage`는 projection과 명령만 받아 사용하며 872줄에서 813줄로 줄었습니다. 기존 optional `scriptNonce` prop은 호출부 호환을 위해 유지합니다.
- browser storage inventory의 읽기 소유 파일을 page에서 새 controller hook으로 옮겼습니다.

## 검증

- `corepack pnpm eslint src/components/ProductListPage.tsx src/components/products/useProductShelfController.ts tests/product-shelf-controller.test.ts tests/e2e/products-list-query.spec.ts`: PASS
- `corepack pnpm vitest run tests/product-shelf.test.ts tests/product-shelf-controller.test.ts tests/product-list-view-model.test.ts tests/product-explorer-url-state.test.ts`: PASS, 4 files / 12 tests
- `DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs test tests/e2e/products-list-query.spec.ts --workers=1`: PASS, 4 tests
- 첫 `corepack pnpm browser-storage:check`: FAIL, storage 읽기 소유 파일이 이동해 inventory에 새 hook이 없고 기존 page entry가 남아 있음을 탐지했습니다.
- `docs/browser-storage-inventory.json` 소유 경로와 purpose 갱신 후 `corepack pnpm browser-storage:check`: PASS, 36 files
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 검사와 250 static pages 생성
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / 1 skipped
- `corepack pnpm planning:v2:complete`: PASS, static/security/report/guide/smoke와 fast E2E 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, fixture 8 tests와 fast E2E 8 tests 포함, sandbox `/tmp/planning-v2-compat-2lS61O`
- `corepack pnpm planning:v2:regress`: PASS, golden case 9건과 full E2E 10 tests 포함
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 독립 reviewer: actionable finding 없음. current/legacy 우선순위, same-tab custom event, cross-tab storage event, snapshot별 Set identity와 URL/API/DB/cache 비영향을 확인했습니다.

## 계약 영향

- public URL 추가·삭제·redirect와 query 이름·의미: 변경 없음
- `/api/finlife/*` 요청·응답 shape와 `cache: "no-store"`: 변경 없음
- `products_shelf_v1`, `products_compare_ids_v1` key: 변경 없음
- shelf schema와 favorite/recent/compare payload shape: 변경 없음
- current shelf 우선, legacy compare fallback, recent 최대 30, compare 최대 4 의미: 변경 없음
- same-tab `products:shelf-updated`와 cross-tab `storage` event 구독: 유지
- DB schema와 migration, Prisma query semantics: 변경 없음
- cache/revalidation 동작: 변경 없음
- runtime inline compare bootstrap script: 제거. 저장 count는 React hydration 후 storage snapshot 갱신으로 표시

## storage 실패 모드

- localStorage 읽기 예외: empty snapshot으로 안전하게 표시
- controller snapshot JSON 손상: empty projection으로 처리
- current storage가 없고 legacy compare만 존재: 기존 legacy basket fallback 유지
- current storage가 존재: 기존 `loadShelfFromSnapshot` 의미대로 current shelf를 우선
- favorite·compare·recent same-tab 변경: custom event로 즉시 projection 갱신
- 다른 탭의 storage 변경: browser `storage` event로 projection 갱신

## 남은 리스크

- cross-tab 갱신은 event wiring을 정적으로 검토했지만 두 page context를 사용하는 E2E는 없습니다.
- Strict Mode의 subscribe cleanup과 snapshot별 Set 참조 안정성을 직접 구동하는 React hook harness는 없습니다. pure projection과 실제 hydration·same-tab command E2E가 현재 회귀 근거입니다.
- specialized 상품 E2E에서 로컬 DB의 `Product` 테이블 부재로 `/api/products/unified` prefetch 오류가 계속 기록됐지만 대상 FINLIFE mock과 shelf 흐름은 통과했습니다.
- stale-response test fixture의 provider logo `0010002.svg`는 로컬에서 404가 기록됐습니다. 테스트 결과와 shelf 동작에는 영향이 없으며 실제 provider asset 계약 변경은 이번 범위가 아닙니다.
- `scriptNonce` optional prop과 네 product route의 nonce/header 조회는 호환을 위해 남아 있습니다. inline script가 더 이상 없으므로 별도 작은 cleanup 후보입니다.
- Issue #121에는 URL query 동기화, source status/freshness, pagination, JSX orchestration이 남아 있습니다.

## 롤백 기준

- current/legacy storage 우선순위, storage key, payload shape, compare limit 또는 favorite·compare·recent 명령 의미가 달라지면 controller hook 연결을 제거하고 page-local subscription으로 복원합니다.
- hydration 후 저장 compare count가 표시되지 않거나 same-tab 명령이 즉시 반영되지 않으면 이번 shelf controller commit만 되돌립니다.
- inline script 제거 후 실제 사용자 경로에서 반복적인 count 표시 회귀가 확인되면 script를 복원하지 않고 SSR-safe 초기화 대안을 별도 검토합니다.

## 다음 라운드 우선순위

1. ProductListPage의 URL query 동기화를 전체 상태 훅으로 크게 옮기지 않고 좁은 controller 경계로 분리할 수 있는지 재검토합니다.
2. 사용하지 않는 `scriptNonce` prop과 네 product route의 nonce/header 조회를 별도 cleanup으로 제거할지 확인합니다.
3. source status/freshness 또는 pagination 중 독립 검증 가치가 큰 한 경계를 선택한 뒤 Issue #121 close 조건을 다시 평가합니다.
