# 2026-06-28 P1-06 depositProtection 계약 종료 기록

## 범위
- 기준 SHA: `5b6564d9`
- 대상: `/api/products/unified`의 `depositProtection=any|prefer|require` 계약을 no-op이 아닌 실제 결과 정책으로 구현했습니다.
- 문서 기준 재검증: 통합 Markdown의 P1-06 코드 근거는 현재 HEAD에서도 성립했습니다. `applyDepositProtectionOnViews()`는 mode를 버리고 있었고, `integrateCanonicalWithMatches()`는 mode를 `any`로 고정하고 있었습니다.
- 실제 topology/env 확인: 현재 프로세스 env에는 관련 키가 없고, repo env 파일 기준 실제 로컬 값은 `.env.local`의 `DATABASE_URL`, `FINLIFE_*` 계열만 확인했습니다. 값은 출력하지 않았습니다.
- 실제 데이터 inventory: `.env.local`을 로드한 로컬 DB 기준 `Product(deposit)=38`, `Product(saving)=59`, `ExternalProduct(datago_kdb deposit)=68`, `ExternalProduct(datago_kdb saving)=0`, `ExternalProductMatch=25`, `ExternalSourceSnapshot(datago_kdb)=1`입니다.

## 사용 skill
- `planning-gate-selector`: product API route, source policy helper, 문서 변경에 맞춰 targeted test, lint, typecheck, build 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 수정 전 실패 증거, 수정 후 검증, 운영 inventory와 남은 리스크를 `/work` 종료 기록으로 정리했습니다.

## 변경 파일
- `src/lib/sources/unifiedEnrichPolicy.ts`: `any/prefer/require` 정책을 순수 함수로 구현하고 integrated helper에 `depositProtectionMode` 전달을 추가했습니다.
- `src/lib/sources/unified.ts`: finlife unknown, datago/KDB matched 신호를 명시하고 merged/integrated/single-source 경로에 정책을 적용했습니다.
- `src/app/api/products/unified/route.ts`: 응답 coverage에 `depositProtection.matched/unknown` 카운트를 추가했습니다.
- `tests/unified-enrich.test.ts`: prefer 정렬, require 필터, integrated mode 전달 회귀 테스트를 추가했습니다.
- `tests/products-unified-route.test.ts`: route가 mode를 service에 전달하고 coverage를 반환하는 계약을 고정했습니다.
- `docs/unified-catalog-contract.md`, `docs/unified-catalog-roadmap.md`: 요청 파라미터, signal, coverage, mode 정책을 현재 동작에 맞게 갱신했습니다.

## 변경 이유
- API는 `any|prefer|require`를 유효한 값으로 받았지만 실제 helper는 mode를 무시해 사용자가 `require`를 필터로 이해해도 전체 결과를 받을 수 있었습니다.
- integrated helper는 호출자의 mode가 아니라 `any`를 고정해 single/integrated enrichment 경로의 계약이 갈라졌습니다.
- 예금자보호 신호가 없는 항목의 처리 기준과 coverage가 없어 결과 축소 이유를 확인하기 어려웠습니다.

## 핵심 변경
- `any`: 기존 결과 집합과 순서를 유지합니다.
- `prefer`: `signals.depositProtection === "matched"` 항목을 안정적으로 앞에 배치하고 나머지 상대 순서를 유지합니다.
- `require`: `matched` 항목만 반환하고 `unknown` 또는 신호 없는 항목은 제외합니다.
- KDB 매칭 또는 datago_kdb 원천 항목은 `matched`, finlife 단독/확인 근거 없음은 `unknown`으로 명시합니다.
- 응답 coverage에 depositProtection matched/unknown 카운트를 추가해 mode 적용 후 결과 상태를 확인할 수 있게 했습니다.

## 검증
- 수정 전 실패 증거:
  - `corepack pnpm test tests/unified-enrich.test.ts tests/products-unified-route.test.ts tests/unified-mode-validation.test.ts` FAIL: 3 files 중 `tests/unified-enrich.test.ts` 4 tests 실패. prefer가 정렬되지 않고, require가 unknown을 남기며, integrated helper가 mode와 depositProtection signal을 전달하지 않았습니다.
- 수정 후 targeted:
  - `corepack pnpm test tests/unified-enrich.test.ts tests/products-unified-route.test.ts tests/unified-mode-validation.test.ts` PASS: 3 files, 13 tests.
  - `corepack pnpm test tests/unified-enrich.test.ts tests/products-unified-route.test.ts tests/unified-mode-validation.test.ts tests/unified-contract.test.ts tests/unified-dedup-stability.test.ts tests/unified-item-route.test.ts` PASS: 6 files, 18 tests.
  - `corepack pnpm test tests/recommend-api.test.ts tests/kdb-recommend-parse.test.ts tests/deposit-integrated-query.test.ts tests/recommend-result-history.test.ts` PASS: 4 files, 21 tests.
- 정적/빌드:
  - `corepack pnpm typecheck` PASS.
  - `corepack pnpm lint` PASS.
  - `corepack pnpm build` PASS. Next.js 16.2.6 기준 251 static pages 생성.
  - `git diff --check` PASS.
- inventory/topology:
  - env key 조회는 값 없이 키만 확인했습니다.
  - DB count inventory는 `.env.local` 로드 후 Prisma로 실행했습니다.
  - 처음 두 카운트 조회는 인용/기본 DB 문제로 실패해 증거에서 제외했고, 최종 `.env.local` 로드 조회만 inventory 증거로 사용했습니다.

## migration / rollback / 호환성
- migration 대상 파일이나 legacy 데이터 이동은 없습니다.
- API는 `depositProtection=prefer|require`를 계속 허용하지만, 이제 `prefer`는 정렬을 바꾸고 `require`는 결과 집합을 줄입니다. 기존 no-op 기대 소비자에게는 동작 변화가 있습니다.
- 응답에 `coverage.depositProtection`이 추가됐고 기존 필드는 제거하지 않았습니다.
- rollback 기준은 문서와 같습니다. 신호 품질이 수용 기준을 충족하지 못하면 no-op으로 되돌리지 말고 `prefer|require`를 400으로 막는 축소안을 선택해야 합니다.

## 남은 리스크
- `require` 결과는 KDB/datago 매칭 품질에 강하게 의존합니다. 현재 로컬 DB 기준 deposit 외부 항목 68건, match 25건이므로 일부 finlife 단독 상품은 `unknown`으로 제외될 수 있습니다.
- cursor가 있는 single-source 경로에서 `require`는 현재 페이지 항목 기준으로 필터링됩니다. 전역 filtered cursor 재작성은 이번 P1-06 범위 밖입니다.
- `saving`에는 datago_kdb 신호가 0건이라 depositProtection 모드는 실질적으로 deposit 결과에만 의미가 있습니다.
- 다음 문서 순서는 P1-07 외부 API 성공 계약 provenance입니다.
