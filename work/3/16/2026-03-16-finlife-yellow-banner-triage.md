# 2026-03-16 FINLIFE yellow banner triage

## 변경 파일
- `src/components/ProductListPage.tsx`
- `work/3/16/2026-03-16-finlife-yellow-banner-triage.md`

## 사용 skill
- `dart-data-source-hardening`: FINLIFE stale/fallback 상태를 실제 응답 기준으로 분리 확인하고, 사용자 문구가 실제 상태와 맞는지 점검하는 데 사용.
- `planning-gate-selector`: FINLIFE 상품 화면의 freshness/fallback UI 수정에 맞는 최소 검증을 `vitest` 관련 테스트와 `pnpm build`로 고르는 데 사용.
- `work-log-closeout`: 이번 triage/fix 배치의 원인, 실행한 확인 명령, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `/products/deposit`, `/products/saving`에서 `DataFreshnessBanner`와 `FallbackBanner`가 동시에 amber 톤으로 떠 노란 경고가 과하게 반복되고 있었습니다.
- 실제 응답을 확인해 보니 FINLIFE 예금/적금은 둘 다 stale이고, `/api/finlife/*`는 둘 다 `fallback.mode = "CACHE"`로 응답하고 있어 상태 자체는 사실이었습니다.
- 다만 현재 fallback은 `reason = http_cache_hit` 외에 `generatedAt`, `nextRetryAt` 같은 추가 정보가 비어 있어, 두 번째 amber 박스가 새 정보를 거의 주지 못하고 있었습니다.

## 핵심 변경
- `ProductListPage`에서 FINLIFE fallback meta가 `CACHE/REPLAY`이면서 `generatedAt`, `nextRetryAt`가 없고 `reason`이 비어 있거나 `http_cache_hit`일 때만 compact helper로 낮췄습니다.
- 이 경우 full `FallbackBanner` 대신 `캐시 응답 기준으로 표시 중입니다 / 실시간 재조회 대신 저장된 응답을 보여 주고 있습니다.` 안내만 노출합니다.
- stale/fallback 사실 자체는 숨기지 않았고, 상단 `DataFreshnessBanner`는 그대로 유지했습니다.
- fallback에 기준시각이나 다음 재시도처럼 유의미한 정보가 있으면 기존 `FallbackBanner`가 계속 full banner로 노출됩니다.
- `SubscriptionClient`나 FINLIFE fallback 계산 로직, source freshness 계산은 건드리지 않았습니다.

## 검증
- `node - <<'NODE' ... fetch('http://127.0.0.1:3100/api/sources/status') ... fetch('http://127.0.0.1:3100/api/finlife/deposit') ... fetch('http://127.0.0.1:3100/api/finlife/saving') ... NODE`
- `node - <<'NODE' ... require('@playwright/test').chromium ... goto('http://127.0.0.1:3100/products/deposit') ... goto('http://127.0.0.1:3100/products/saving') ... NODE`
- `pnpm exec vitest run tests/freshness-summary.test.ts tests/finlife-fallback-mode.test.ts tests/finlife-products-http-cache.test.ts`
- `pnpm build`
- `git diff --check -- src/components/ProductListPage.tsx work/3/16/2026-03-16-finlife-yellow-banner-triage.md`

## 남은 리스크
- 현재 stale 상태 자체는 여전히 실제 문제라서 상단 freshness 경고는 계속 노출됩니다.
- `http_cache_hit`이지만 snapshot 기준시각이 없는 이유는 이번 라운드에서 계산 로직까지 열지 않았으므로 그대로 남아 있습니다.
- 향후 fallback meta에 `generatedAt`이나 `nextRetryAt`가 채워지면 full `FallbackBanner`가 다시 보여서, 같은 화면에서도 배너 강도가 달라질 수 있습니다.

## 다음 우선순위
- FINLIFE cache fallback에서 `generatedAt`가 왜 비는지 `productsHttp`/cache payload 관점에서 후속 조사
- 실제 stale 상태를 줄이려면 snapshot refresh 또는 source sync 운영 경로를 별도 라운드로 다루기
