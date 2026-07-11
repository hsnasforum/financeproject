# 2026-07-11 Issue #121 상품 query controller 경계 분리

## 변경 파일

- `src/components/ProductListPage.tsx`
- `src/components/products/useProductExplorerQueryController.ts`
- `tests/product-query-controller-hook.test.ts`
- `tests/product-query-controller.test.ts`
- `tests/product-explorer-url-state.test.ts`
- `tests/e2e/products-list-query.spec.ts`
- `work/7/11/2026-07-11-issue-121-product-query-controller.md`

## 사용 skill

- `finance-skill-routing`: 상품 query 구조 변경에 필요한 저장소 skill 조합 선택
- `planning-gate-selector`: pure helper, React hook, App Router query, history E2E 영향에 맞는 검증 세트 선택
- `playwright`: 초기 deep-link, 제어 변경, URL replace와 browser history 비증가 확인
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 표준 종료 기록으로 정리
- `github:yeet`: 의도한 파일만 staging·commit·push하고 Issue 연결 PR을 게시하는 범위 확인. WSL에 `gh`가 없어 PR 생성·조회는 인증된 GitHub 앱 경로를 사용

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/121
- 범위 합의 코멘트: https://github.com/hsnasforum/financeproject/issues/121#issuecomment-4941982791
- 작업 브랜치: `codex/121-product-query-controller`
- 기준 main: `9e3e9f87541e444cc1e737022563d5226d6d87fb`
- `ProductListPage`가 `useSearchParams` 초기 parse, URL에 연결된 15개 state/setter, query serialization과 `router.replace` effect를 직접 소유했습니다.
- reducer, Context, popstate 양방향 재동기화, URL equality guard는 추가하지 않고 기존 최초 1회 초기화와 local-state source 의미를 유지했습니다.
- source status/freshness, pagination UI, shelf, route page, nonce와 JSX 구조는 이번 범위에서 제외했습니다.

## 핵심 변경

- `useProductExplorerQueryController`가 초기 URL parse와 top group, provider, page, scan, view, sort, option, filter, amount, search, favorite 15개 state/setter를 소유합니다.
- `useProductExplorerQuerySync`를 기존 page effect 위치에 호출해 provider fallback과 URL replace effect 순서를 유지합니다.
- `buildProductExplorerQueryTarget`이 기존 builder와 `FINLIFE_PAGE_SIZE`로 public query target을 만듭니다.
- sync hook은 기존 dependency 의미와 `router.replace(target, { scroll: false })`를 유지합니다.
- `ProductListPage`는 query 값과 setter만 받아 rendering·data/view model orchestration에 사용하며 813줄에서 801줄로 줄었습니다.
- React/Next hook mock 단위 테스트로 15개 초기값·setter mapping·재호출 identity와 exact replace 인자를 직접 검증했습니다.

## 검증

- 첫 focused ESLint는 controller setter가 page-local effect 밖에서 온 뒤 provider fallback effect dependency에 setter 2개가 빠졌다는 warning 1건을 탐지했습니다. dependency를 추가한 최종 focused ESLint는 PASS입니다.
- `corepack pnpm vitest run tests/product-query-controller-hook.test.ts tests/product-query-controller.test.ts tests/product-explorer-url-state.test.ts tests/product-list-view-model.test.ts tests/product-list-data-hook.test.ts`: PASS, 5 files / 12 tests
- `DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs test tests/e2e/products-list-query.spec.ts --workers=1`: PASS, 4 tests
- `corepack pnpm lint`: PASS. hook-level test 추가 후 다시 실행해 PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS. hook-level test 추가 후 다시 실행해 PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 검사와 250 static pages 생성
- `corepack pnpm browser-storage:check`: PASS, 36 files
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / 1 skipped
- `corepack pnpm planning:v2:complete`: PASS, static/security/report/guide/smoke와 fast E2E 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, fixture 8 tests와 fast E2E 8 tests 포함, sandbox `/tmp/planning-v2-compat-z6iURj`
- `corepack pnpm planning:v2:regress`: PASS, golden case 9건과 full E2E 10 tests 포함
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 독립 reviewer의 P2 hook wiring 테스트 공백을 보강했습니다. 최종 재검토 결과 actionable finding은 없었습니다.

## 계약 영향

- public URL 추가·삭제·redirect: 없음
- query 이름, 순서, 기본값, trim, invalid normalization, omitted-default 규칙: 변경 없음
- 최초 URL parse 이후 local state가 source가 되는 단방향 의미: 변경 없음
- URL 갱신: 기존 `router.replace(..., { scroll: false })` 유지
- browser history: 검색어 변경 뒤 history entry를 추가하지 않고 이전 `/`로 복귀하는 E2E 확인
- FINLIFE request URL·응답 shape와 `cache: "no-store"`: 변경 없음
- shelf storage key·schema·payload·event 의미: 변경 없음
- DB schema와 migration, Prisma query semantics: 변경 없음
- cache/revalidation 동작: 변경 없음

## query 실패·경계 모드

- invalid product sort: rate preference 기반 default sort 유지
- invalid option sort: `best_desc` 유지
- 과도한 maxPages: 기존 상한 80 적용
- 공백 search·amount: search 제거, amount 기본 `10000000` 유지
- product view와 default sort/filter: URL에서 기존처럼 생략
- scan all: request pageNo 1, `scan=all`, maxPages 직렬화 유지
- browser back/forward: 기존처럼 mount 초기값만 parse하며 popstate 양방향 state reset은 추가하지 않음

## 남은 리스크

- hook-level 단위 테스트는 Vitest mock으로 실제 hook 함수를 실행하지만 React DOM·Strict Mode mount harness는 아닙니다. specialized E2E가 실제 Next/React 경로를 보완합니다.
- controller가 15개 query state/setter를 반환해 표면이 넓습니다. 현재 query public contract 자체가 넓기 때문이며 reducer/Context 추가는 복잡도 대비 이득이 확인되기 전까지 보류합니다.
- browser history E2E는 search query 변경과 back 복귀를 검증하며 모든 filter setter별 history를 반복 검증하지 않습니다. exact target unit과 hook replace test가 나머지 serializer 분기를 보완합니다.
- specialized 상품 E2E에서 로컬 DB의 `Product` 테이블 부재 prefetch 오류와 test provider logo 404가 계속 기록됐지만 FINLIFE mock·query 흐름은 통과했습니다.
- ProductListPage에는 source status/freshness, pagination과 JSX orchestration이 남아 있습니다. 이번 query 경계는 Issue #121의 명시 수용 기준을 충족시키지만 issue close 전 전체 완료 근거를 다시 확인해야 합니다.
- optional `scriptNonce` prop과 네 product route의 nonce/header 조회는 별도 cleanup 후보입니다.

## 롤백 기준

- query 이름·기본값·정규화·생략 규칙 또는 replace history가 달라지면 controller 연결을 제거하고 기존 page-local state/effect를 복원합니다.
- 최초 deep-link state, search/filter 결과, page·scan·option control이 기존 URL과 달라지면 이번 query controller commit만 되돌립니다.
- hook mock test가 실제 React 동작과 충돌하는 사례가 확인되면 runtime 코드를 바로 넓히지 않고 test harness를 재설계합니다.

## 다음 라운드 우선순위

1. PR 병합 후 Recommend와 Product의 fetch/query/storage controller 및 pure view model 완료 근거를 Issue #121 수용 기준별로 재확인하고 close 여부를 결정합니다.
2. Issue #121이 충족되면 source status/freshness 또는 pagination은 새 follow-up이 실제 변경 영향 축소에 도움이 되는 경우에만 별도 Issue로 분리합니다.
3. 사용하지 않는 `scriptNonce` prop과 product route nonce/header 조회를 작은 cleanup 후보로 검토합니다.
