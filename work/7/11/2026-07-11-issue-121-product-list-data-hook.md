# 2026-07-11 Issue #121 상품 목록 데이터 훅 경계 분리

## 변경 파일

- `src/components/ProductListPage.tsx`
- `src/components/products/useFinlifeProductListData.ts`
- `src/lib/products/productListDataRequest.ts`
- `tests/product-list-data-hook.test.ts`
- `tests/product-list-data-request.test.ts`
- `tests/e2e/products-list-query.spec.ts`
- `work/7/11/2026-07-11-issue-121-product-list-data-hook.md`

## 사용 skill

- `finance-skill-routing`: FINLIFE public-data UI 변경에 필요한 저장소 skill 조합 선택
- `dart-data-source-hardening`: FINLIFE 요청 실패, parse 실패, fallback payload, stale 응답 처리 점검
- `planning-gate-selector`: helper, React hook, page, E2E 영향에 맞는 검증 세트 선택
- `playwright`: specialized 상품 목록의 실제 요청 교체 경합과 전체 RC 사용자 흐름 확인
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 표준 종료 기록으로 정리
- `github:yeet`: 의도한 파일만 staging·commit·push하고 Issue 연결 PR을 게시하는 범위 확인. WSL에 `gh`가 없어 PR 생성·조회는 인증된 GitHub 앱 경로를 사용

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/121
- 범위 합의 코멘트: https://github.com/hsnasforum/financeproject/issues/121#issuecomment-4938329415
- 작업 브랜치: `codex/121-product-list-data-hook`
- 기준 main: `0e571b1c48877dc082773ee97ca197fd9c8ff7cb`
- `ProductListPage`가 FINLIFE URL 구성, `fetch`, 응답 parse, loading/error/payload 수명주기와 stale 응답 억제를 직접 소유해 page 변경 시 upstream 계약까지 함께 검토해야 했습니다.
- URL query 동기화, source status/freshness, shelf storage, pagination, view model, JSX는 유지하고 FINLIFE 상품 데이터 요청 수명주기만 좁은 경계로 분리했습니다.

## 핵심 변경

- `requestFinlifeProductListData`가 기존 URL builder, `FINLIFE_PAGE_SIZE`, `parseFinlifeApiResponse`, `cache: "no-store"` 계약을 재사용하도록 분리했습니다.
- `useFinlifeProductListData`가 `kind/topFinGrpNo/pageNo/scanMode/maxPages`를 입력받아 `loading/error/payload`와 요청별 `AbortController` 정리를 소유합니다.
- 순수 reducer로 재요청 시작, 성공, 오류 상태 전이를 고정하고 오류 시 기존 payload를 버리지 않는 기존 의미를 보존했습니다.
- 네트워크·JSON parse 실패는 기존 안전 문구를 유지하고, API error message와 snapshot fallback metadata는 그대로 전달합니다.
- specialized 상품 E2E에 권역을 빠르게 바꾼 뒤 늦은 이전 응답이 최신 결과를 덮지 못하는 경합 시나리오를 추가하고, 이전 요청의 브라우저 종료와 React frame 반영까지 기다리도록 동기화했습니다.
- `ProductListPage`의 FINLIFE request effect를 제거해 파일을 914줄에서 872줄로 줄였습니다.

## 검증

- `command -v npx`: PASS, `/usr/bin/npx`
- `corepack pnpm eslint src/components/ProductListPage.tsx src/components/products/useFinlifeProductListData.ts src/lib/products/productListDataRequest.ts tests/product-list-data-request.test.ts tests/product-list-data-hook.test.ts tests/e2e/products-list-query.spec.ts`: PASS
- `corepack pnpm vitest run tests/product-list-data-request.test.ts tests/product-list-data-hook.test.ts tests/finlife-api-schema.test.ts tests/product-explorer-url-state.test.ts tests/product-list-view-model.test.ts`: PASS, 5 files / 14 tests
- `DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs test tests/e2e/products-list-query.spec.ts --workers=1`: PASS, 3 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 검사와 250 static pages 생성
- `corepack pnpm browser-storage:check`: PASS, 36 files
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / 1 skipped
- `corepack pnpm planning:v2:complete`: PASS, static/security/report/guide/smoke와 fast E2E 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, fixture 8 tests와 fast E2E 8 tests 포함, sandbox `/tmp/planning-v2-compat-PnOLkj`
- `corepack pnpm planning:v2:regress`: PASS, golden case 9건과 full E2E 10 tests 포함
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 독립 reviewer의 최초 P1 타입 import 누락과 P2 훅 lifecycle 테스트 공백을 수정했습니다. 최종 재검토에서 발견된 경합 E2E의 브라우저 반영 전 조기 통과 가능성도 request 종료 event와 두 animation frame barrier로 보강했으며, 재검토 결과 actionable finding은 없었습니다.

## 계약 영향

- public URL 추가·삭제·redirect: 없음
- specialized product query 이름·의미와 URL 동기화: 변경 없음
- `/api/finlife/*` 요청 URL·응답 shape와 response parsing: 변경 없음
- FINLIFE request cache policy: 기존 `cache: "no-store"` 유지
- source status/freshness와 snapshot fallback metadata 표시: 변경 없음
- shelf storage key와 compare/favorite/recent payload shape: 변경 없음
- DB schema와 migration: 변경 없음
- Prisma query와 query semantics: 변경 없음
- cache/revalidation 동작: 변경 없음

## 공공데이터 실패 모드

- upstream request 실패와 JSON parse 실패: 기존 사용자 문구 `데이터를 불러오지 못해요. 잠시 후 다시 시도해주세요.` 유지
- API가 구조화된 error message를 반환: 기존 parse 결과의 message 유지
- snapshot fallback 또는 부분 metadata 반환: payload를 변형하지 않고 source/freshness 표시 경로에 전달
- 요청 입력 변경 또는 unmount: 이전 요청 signal을 abort하고 늦은 결과의 상태 반영을 억제
- env 이름, endpoint, freshness 계산식, operator 설정: 변경 없음

## 남은 리스크

- 별도 React DOM hook-rendering 라이브러리는 저장소에 없습니다. reducer 단위 테스트와 브라우저 request 종료·React frame barrier를 둔 실제 페이지 경합 E2E로 상태·cleanup 계약을 검증했지만 Strict Mode 자체를 독립 hook harness에서 직접 구동하지는 않았습니다.
- `ProductListPage`에는 URL query 동기화, source status/freshness, shelf storage 구독·쓰기, pagination, JSX orchestration이 남아 있습니다. Issue #121은 이 controller 경계를 한 흐름씩 더 좁힌 뒤 수용 기준을 재평가해야 합니다.
- specialized E2E 실행 중 로컬 DB의 `Product` 테이블 부재로 `/api/products/unified` prefetch 오류가 기록됐지만 대상 FINLIFE mock 흐름은 통과했습니다. 이번 변경은 DB 조회를 수정하지 않습니다.
- specialized E2E에서 기존 compare count bootstrap의 script tag/hydration warning이 재현됐습니다. 이번 변경은 해당 bootstrap과 storage 초기화를 수정하지 않습니다.

## 롤백 기준

- specialized 상품 요청 URL, API error message, snapshot fallback metadata 또는 `cache: "no-store"` 동작이 달라지면 훅 호출을 제거하고 기존 page-local effect로 복원합니다.
- 권역·페이지·scan 입력 변경 뒤 이전 응답이 최신 결과를 덮거나 loading/error/payload 상태가 기존 화면과 달라지면 이번 data hook commit만 되돌립니다.
- 새 경합 E2E가 실제 요청 순서를 검증하지 못하거나 반복 실행에서 불안정하면 runtime 경계는 별도 검토하고 테스트만 재설계합니다.

## 다음 라운드 우선순위

1. Issue #121의 URL query 동기화 또는 shelf storage orchestration 중 독립 검증 가치가 큰 한 경계를 선택합니다.
2. compare count bootstrap의 script tag/hydration warning을 별도 Issue 또는 기존 follow-up에 연결할 근거를 재확인합니다.
3. ProductList controller 경계가 충분히 좁아진 뒤 Issue #121 수용 기준 충족과 close 여부를 재평가합니다.
