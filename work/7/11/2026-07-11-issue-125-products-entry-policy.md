# 2026-07-11 Issue #125 상품 탐색 진입 정책 정리

## 변경 파일

- `src/app/products/page.tsx`
- `tests/products-home-entry-policy.test.tsx`
- `docs/current-screens.md`
- `docs/README.md`
- `work/7/11/2026-07-11-issue-125-products-entry-policy.md`

## 사용 skill

- `finance-skill-routing`: products/route 변경에 필요한 저장소 skill 조합 선택
- `planning-gate-selector`: UI, App Router, route SSOT 영향에 맞는 검증 세트 선택
- `route-ssot-check`: `/products`와 하위 링크의 실제 경로 및 public 노출 계약 확인
- `playwright`: 제품 진입 화면의 실제 브라우저 동작과 viewport 검증 기준 적용
- `browser:control-in-app-browser`: 데스크톱·모바일 렌더링, overflow, 콘솔 오류 확인
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 표준 종료 기록으로 정리
- `github:yeet`: 의도한 파일만 커밋·push하고 Issue 연결 PR을 게시하는 절차 적용

## 변경 이유

- 연결 Issue: https://github.com/hsnasforum/financeproject/issues/125
- 기존 `/products`는 통합 catalog와 예금·적금 preset, 연금·대출 별도 화면을 같은 카드 계층으로 노출해 어떤 경로가 대표 비교 화면인지 구분하기 어려웠습니다.
- top-level navigation은 `/products`를 금융탐색 진입점으로 사용하지만 문서 일부는 `/products/catalog`만 메인 경로로 표현해 게이트웨이와 비교 화면의 역할이 모호했습니다.

## 핵심 변경

- `/products/catalog`를 primary CTA로 유지하고 예금·적금 preset을 두 번째 계층, 연금·대출 별도 화면을 세 번째 계층으로 구분했습니다.
- `/products`는 금융탐색의 상위 public 게이트웨이, `/products/catalog`는 예금·적금 대표 비교 화면이라는 문서 계약을 일치시켰습니다.
- CTA의 중첩 `<a><button>` 구조를 단일 링크로 바꿔 키보드 포커스와 HTML 상호작용 의미를 바로잡았습니다.
- 회귀 테스트가 진입 계층 순서, catalog/preset/specialized 링크, public navigation registry, production `samplebank` 비노출을 고정합니다.
- public URL 추가·삭제·redirect, API/응답 shape, DB schema/Prisma query, cache/revalidation 동작은 변경하지 않았습니다.

## 검증

- `corepack pnpm vitest run tests/products-home-entry-policy.test.tsx tests/catalog-explorer.test.ts tests/products-category-redirect.test.ts tests/unified-samplebank.test.ts`: PASS, 4 files / 10 tests
- `corepack pnpm eslint src/app/products/page.tsx tests/products-home-entry-policy.test.tsx`: PASS
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 796 files / 2,682 tests
- `corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, fixture 8 tests와 fast E2E 8 tests 포함, sandbox `/tmp/planning-v2-compat-K2KrOk`
- `corepack pnpm planning:v2:regress`: PASS, golden case 9건과 full E2E 10 tests 포함
- `corepack pnpm planning:ssot:check`: PASS, 5 files / 9 tests
- `corepack pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages 생성
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 실제 브라우저: 1280x720과 390x844에서 primary/preset/specialized 순서, 모바일 줄바꿈, 가로 overflow 없음, 콘솔 error/warning 없음 확인
- 독립 reviewer: 문서 진입 계약과 카피 결합 테스트 finding을 반영했으며, CTA 중첩 상호작용도 추가 해소했습니다.

## 남은 리스크

- `e2e:rc` 기본 목록에는 products 전용 시나리오가 없어 이번 화면을 직접 다루는 Playwright spec은 실행하지 않았습니다. 정적 계약 테스트와 실제 데스크톱·모바일 브라우저 점검으로 현재 변경을 확인했습니다.
- 홈의 문맥형 바로가기는 `/products/catalog` 또는 preset으로 직접 이동합니다. top-level navigation의 canonical entry는 `/products`로 테스트하지만 모든 문맥형 링크를 게이트웨이로 강제하지는 않습니다.
- 상품 catalog 데이터 모델, FINLIFE pipeline, 추천 계산, 별도 연금·대출 화면의 내부 구조는 이번 Issue 범위에서 변경하지 않았습니다.
- 다음 구조 개선 후보는 populated DB 근거가 필요한 Issue #206과 큰 페이지 분리가 남은 Issue #121이며, schema/query/cache 합의 없이 확대하지 않습니다.

## 다음 라운드 우선순위

1. PR CI가 코드 실행 전 account billing/spending limit으로 차단되는지 확인하고 로컬 gate 근거를 PR에 남깁니다.
2. Issue #206은 populated DB read-only baseline을 확보한 뒤 FINLIFE active ownership과 query/cache 영향 범위를 다시 판단합니다.
3. Issue #121은 현재 main의 추천 페이지를 다시 읽고 독립 테스트가 가능한 최소 경계부터 분리합니다.
