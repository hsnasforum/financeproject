# 2026-03-16 상품 화면 노란 배너 제거

## 변경 파일
- `src/components/ProductListPage.tsx`
- `work/3/16/2026-03-16-products-remove-yellow-banners.md`

## 사용 skill
- `dart-data-source-hardening`: FINLIFE stale/fallback 사실은 유지하되 상품 화면과 설정 화면의 역할을 분리하는 기준을 잡는 데 사용.
- `planning-gate-selector`: 링크 변경과 page UI 변경에 맞는 최소 검증을 `pnpm planning:current-screens:guard`, `pnpm build`로 고르는 데 사용.
- `route-ssot-check`: `/settings/data-sources` 링크가 실제 public route와 일치하는지 점검하는 데 사용.
- `work-log-closeout`: 이번 UX 정리 배치의 변경 이유, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `/products/deposit`, `/products/saving`는 사용자 상품 탐색 화면인데, FINLIFE freshness/fallback 운영성 노란 배너가 상단에서 계속 보여 UX 노이즈가 컸습니다.
- 데이터 상태 확인의 공식 surface는 이미 `/settings/data-sources`에 있으므로, 상품 화면에서는 경고 박스 대신 중립적 안내로 역할을 넘기는 편이 맞습니다.
- 이번 라운드는 stale/fallback 계산을 바꾸지 않고, 사용자 화면에서 운영성 경고 노출만 정리하는 배치입니다.

## 핵심 변경
- `ProductListPage`에서 `DataFreshnessBanner`, compact fallback helper, `FallbackBanner` 렌더를 제거했습니다.
- 상품 화면 상단에는 작은 중립 문구와 `/settings/data-sources` 링크만 남겨, 상세 상태 확인 위치를 설정 화면으로 명확히 넘겼습니다.
- payload 실패 시 기존 `error`/`empty state` 흐름은 그대로 유지했습니다.
- FINLIFE freshness/fallback 계산 로직과 `/settings/data-sources` 화면 자체는 건드리지 않았습니다.

## 검증
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `git diff --check -- src/components/ProductListPage.tsx work/3/16/2026-03-16-products-remove-yellow-banners.md`

## 남은 리스크
- 상품 화면에서는 운영성 경고를 숨겼지만, 실제 stale/fallback 상태 자체는 여전히 존재하며 설정 화면에서만 확인됩니다.
- 설정 화면을 사용자가 직접 들어가지 않으면 source freshness 문제를 즉시 인지하지 못할 수 있습니다.
- 다른 surface가 `DataFreshnessBanner`나 `FallbackBanner`를 따로 쓰는 경우에는 이번 라운드의 역할 분리 기준이 자동으로 적용되지 않습니다.
