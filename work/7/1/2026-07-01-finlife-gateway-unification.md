# 2026-07-01 FINLIFE gateway 통합

## 변경 파일
- `src/app/api/finlife/availability/route.ts`
- `src/app/api/finlife/{deposit,saving,credit-loan,mortgage-loan,rent-house-loan,pension}/route.ts`
- `src/lib/finlife/productRoute.ts`
- `src/lib/finlife/productsHttp.ts`
- `src/lib/finlife/httpCache.ts`
- `src/lib/finlife/source.ts`
- `src/lib/finlife/companySource.ts`
- `src/lib/finlife/syncRunner.ts`
- `tests/finlife-http-error-debug.test.ts`
- `tests/finlife-product-route-gateway.test.ts`

## 사용 skill
- `github`: 통합 Markdown 기준 구조 Issue를 GitHub에 등록했습니다.
- `planning-gate-selector`: FINLIFE route/API 변경의 최소 검증 세트를 `lint`, `test`, `build` 중심으로 정했습니다.
- `work-log-closeout`: 이번 라운드의 변경 파일, 검증, 잔여 리스크를 `/work`에 정리했습니다.

## 변경 이유
- 통합 Markdown 1순위 Issue인 `[Critical] FINLIFE 상품 API gateway 이중화 제거`를 처리하기 위해서입니다.
- 기존에는 deposit/saving만 `getFinlifeProductsForHttp`를 사용하고 credit-loan, mortgage-loan, rent-house-loan, pension, availability는 `src/lib/finlife/source`를 직접 호출했습니다.
- 이 구조는 상품군별 cache/fallback/error/trace contract가 갈라지는 구조적 리스크가 있었습니다.

## 핵심 변경
- GitHub Issue #114~#125를 등록했고, 이번 라운드에서는 #114를 구현했습니다.
- `createFinlifeProductRoute(kind)` route factory를 추가해 FINLIFE product route 6개가 같은 trace/error/gateway 경로를 사용하게 했습니다.
- `getFinlifeProductsForHttp`와 HTTP cache key 타입을 전체 `FinlifeKind`로 확장했습니다.
- `/api/finlife/availability`도 source client 직접 호출 대신 HTTP gateway를 사용하게 바꿨습니다.
- public API로 흘러갈 수 있는 FINLIFE fixture/snapshot 안내에서 내부 script명과 `pnpm` 안내 문구를 제거했습니다.
- `tests/finlife-product-route-gateway.test.ts`를 추가하고, `credit-loan` gateway contract 회귀 테스트를 보강했습니다.

## 검증
- `corepack pnpm test tests/finlife-http-error-debug.test.ts tests/finlife-product-route-gateway.test.ts`: 처음 PowerShell UNC 경로에서 실패. 원인: Windows `cmd.exe`가 UNC cwd를 지원하지 않아 `C:\Windows`로 떨어지고 Corepack/pnpm install 단계에서 EPERM이 발생했습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm test tests/finlife-http-error-debug.test.ts tests/finlife-product-route-gateway.test.ts'`: PASS, 2 files / 4 tests.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm lint'`: PASS.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm test'`: PASS, 740 files / 2445 tests.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm build'`: 첫 실행 FAIL. 원인: `buildFinlifeHttpCacheKey` 타입이 `"deposit" | "saving"`으로 남아 `FinlifeKind` 확장을 막았습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm build'`: 타입 수정 후 PASS, static pages 251/251.
- `rg -n "/api/dev|pnpm|scripts/|live:smoke|products:sync" src/app/api/finlife src/lib/finlife tests/finlife-http-error-debug.test.ts tests/finlife-product-route-gateway.test.ts`: 최종 출력 없음.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm test tests/finlife-http-error-debug.test.ts tests/finlife-product-route-gateway.test.ts tests/finlife-fixtures.test.ts'`: PASS, 3 files / 8 tests.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm lint'`: 최종 PASS.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm build'`: 최종 PASS, static pages 251/251.
- `git diff --check -- <FINLIFE 변경 파일>`: PASS. 출력은 CRLF 변환 경고만 있었고 whitespace error는 없었습니다.

## 남은 리스크
- `FINLIFE_API_KEY`가 없는 non-snapshot kind는 기존 구형 source의 auto mock 흐름이 아니라 공통 HTTP gateway의 `CONFIG_MISSING` 계약을 따릅니다. deposit/saving gateway와 일관화한 결과이지만 운영 환경에서 replay/snapshot 범위를 넓힐지는 별도 판단이 필요합니다.
- `company` route는 상품 route가 아니어서 이번 gateway factory에는 포함하지 않았습니다. 다만 company source의 public message에서 내부 script명은 제거했습니다.
- 현재 working tree에는 이번 FINLIFE 변경 외에 이전 라운드의 대규모 미커밋 변경이 이미 존재합니다. stage/commit/push는 수행하지 않았습니다.
- 등록한 Issue #115~#125는 후속 라운드 대상으로 남아 있습니다.
