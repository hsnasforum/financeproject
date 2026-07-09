# 2026-07-01 product catalog/category/samplebank 노출 정책 정리

## 대상 Issue
- GitHub Issue: #125 `[Medium] product catalog/category/samplebank 노출 정책 정리`

## 사용 skill
- `planning-gate-selector`: products route, API, UI, 문서 변경에 필요한 검증 범위 선정
- `route-ssot-check`: category compatibility route와 `docs/current-screens.md` 정책 일치 확인
- `work-log-closeout`: 변경 종료 기록 작성
- `manager` subagent: #125 범위 분해와 영향 파일/검증 후보 정리

## 수정 대상 파일
- `src/lib/products/samplebankPolicy.ts`
- `src/lib/products/catalogExplorer.ts`
- `src/app/products/catalog/page.tsx`
- `src/app/products/deposit/page.tsx`
- `src/app/products/saving/page.tsx`
- `src/app/products/page.tsx`
- `src/components/home/QuickTiles.tsx`
- `src/lib/uiText.ko.ts`
- `src/lib/dataSources/userImpact.ts`
- `src/app/api/products/unified/route.ts`
- `src/app/api/products/unified/item/route.ts`
- `docs/current-screens.md`
- `docs/README.md`
- `tests/catalog-explorer.test.ts`
- `tests/products-category-redirect.test.ts`
- `tests/products-unified-route.test.ts`
- `tests/unified-samplebank.test.ts`
- `tests/unified-item-route.test.ts`
- `tests/data-source-user-impact.test.ts`
- `tests/e2e/products-list-query.spec.ts`

## 변경 이유
- `/products/deposit`, `/products/saving`이 별도 목록 화면처럼 노출되어 `/products/catalog` 대표 탐색과 정책이 갈라질 수 있었다.
- samplebank 데이터가 운영 공개 UI/API에서 실제 상품처럼 보이면 신뢰 리스크가 있었다.
- category deep-link는 유지하되 canonical catalog URL과 같은 view model/filter 정책을 쓰게 할 필요가 있었다.

## 구현 요약
- `samplebankPolicy.ts`를 추가해 production에서는 public flag와 무관하게 samplebank 공개 접근을 차단했다.
- `/products/deposit`, `/products/saving`을 `/products/catalog?kind=deposit|saving` 호환 redirect로 바꾸고 기존 query 중 catalog가 지원하는 값을 보존했다.
- `/products/catalog`가 URL `kind`, `q`, `termMonths`, `minRate` 상태를 파싱하고 kind preset으로 shelf/filter를 구성하도록 정리했다.
- `/api/products/unified`, `/api/products/unified/item`에서 production samplebank source/id 요청을 public error로 차단했다.
- 홈/상품 진입 링크와 데이터 소스 영향 경로, `docs/current-screens.md`, `docs/README.md`, 단위/e2e 테스트를 갱신했다.

## 확인 명령과 결과
- `pnpm vitest run tests/catalog-explorer.test.ts tests/products-category-redirect.test.ts tests/products-unified-route.test.ts tests/unified-samplebank.test.ts tests/unified-item-route.test.ts tests/data-source-user-impact.test.ts`: PASS, 6 files / 24 tests
- `rg -n -e 'products/deposit' -e 'products/saving' -e 'includeSamplebank' -e 'samplebank' -e 'products/catalog' src tests docs scripts`: PASS, 남은 hit는 compatibility route, 문서, 테스트, 내부 provider/policy 참조로 확인
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- `pnpm planning:ssot:check`: PASS, `[planning:ssot:check] PASS`
- `pnpm build`: PASS
- `pnpm test`: PASS, 752 files / 2492 tests
- `PORT=3134 PLANNING_DATA_DIR=.data/planning-e2e-124-full pnpm e2e:rc`: PASS, 24 passed / 1 skipped
- `PORT=3135 PLANNING_DATA_DIR=.data/planning-e2e-124-products pnpm e2e tests/e2e/products-list-query.spec.ts --workers=1`: PASS, 1 passed
- `git diff --check`: PASS

## 실패/재시도 기록
- `unified-samplebank` 테스트 패치 1차는 기존 파일 context 불일치로 실패해 관련 테스트 파일을 개별 확인한 뒤 다시 적용했다.
- PowerShell에서 `&&`, `|`, `<`, 정규식 괄호가 먼저 해석되어 일부 조회 명령이 실패했다. WSL `bash -lc`와 `rg -e` 다중 패턴으로 바꿔 재시도했다.
- `.data/planning-e2e-124-products` 정리는 대상 경로가 생성되지 않아 no-op이었다. full e2e용 `.data/planning-e2e-124-full`은 workspace 내부 경로 확인 후 삭제했다.

## 남은 리스크와 엣지케이스
- planner legacy 링크 중 일부는 아직 `/products/deposit`, `/products/saving`을 가리키지만 compatibility redirect가 처리한다. 필요하면 별도 라운드에서 링크 원천까지 catalog preset으로 수렴시킬 수 있다.
- `src/lib/sources/includeSources.ts`와 low-level unified loader는 non-production/internal test 용도로 samplebank를 계속 지원한다. 운영 공개 UI/API 차단은 route/policy 계층에서 보장한다.
- loan/pension category page는 이번 수용 기준의 예금/적금 category 정리 범위 밖이라 기존 구조를 유지했다.
- 기존 category page query 중 `scan`, `fav`, `sort`, `view` 등 catalog가 지원하지 않는 값은 보존하지 않고, `q`, `termMonths`, `minRate`만 보존한다.

## 롤백 기준
- production에서 samplebank가 public catalog UI나 public products API 응답으로 다시 노출되면 samplebank policy와 API guard를 되돌리지 말고 우선 노출 경로를 추가 차단한다.
- `/products/catalog?kind=deposit|saving` deep-link가 깨지거나 `/products/deposit`, `/products/saving` compatibility redirect가 query를 잘못 전달하면 category redirect 변경을 되돌린다.
- unified API의 non-production samplebank 테스트 데이터 흐름이 막히면 production guard 조건만 축소 검토한다.

## 다음 라운드 우선순위
- 등록된 우선순위 12개 Issue는 #114부터 #125까지 모두 로컬 구현과 검증을 완료했다.
- 다음 단계는 전체 변경분 최종 감사, GitHub Issue별 구현 상태 정리, PR 전 검증 재실행 여부 결정이다.
