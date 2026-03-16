# 2026-03-16 사용자 화면 운영 배너 정리 closeout

## 변경 파일
- `src/app/recommend/page.tsx`
- `src/components/SubscriptionClient.tsx`
- `work/3/16/2026-03-16-remove-operational-banners-from-user-flows.md`

## 사용 skill
- `planning-gate-selector`: 사용자 화면의 링크/UI 변경에 맞는 최소 검증을 `pnpm planning:current-screens:guard`, `pnpm build`로 고르는 데 사용.
- `route-ssot-check`: `/settings/data-sources` 링크가 실제 public route와 `docs/current-screens.md` 기준에 맞는지 확인하는 데 사용.
- `work-log-closeout`: 이번 closeout 라운드의 변경 범위, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `recommend`와 `subscription` 화면에 남아 있던 freshness/fallback 운영성 배너는 사용자 탐색 흐름보다 운영 상태를 앞세우는 노이즈였습니다.
- `/settings/data-sources`가 공식 데이터 신뢰/연동 상태 확인 surface이므로, 사용자 화면에서는 상세 경고 대신 중립 링크만 남기는 방향으로 정리할 필요가 있었습니다.
- 이번 라운드는 새 구현이 아니라, 이미 남아 있던 dirty diff가 이 의도와 일치하는지 점검하고 허용 범위만 clean commit으로 닫는 closeout 배치입니다.

## 핵심 변경
- `src/app/recommend/page.tsx`에서 `DataFreshnessBanner`와 관련 freshness source 계산을 제거했습니다.
- `recommend` 화면 상단에는 `/settings/data-sources`로 가는 작은 중립 안내만 남겼습니다.
- `src/components/SubscriptionClient.tsx`에서 `FallbackBanner`와 fallback meta 상태 보관을 제거했습니다.
- `subscription` 화면 상단에도 `/settings/data-sources`로 가는 작은 중립 안내만 남겼습니다.
- 두 화면 모두 기존 payload 실패/empty/error state 흐름은 그대로 유지했습니다.

## 검증
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `git diff --check -- src/app/recommend/page.tsx src/components/SubscriptionClient.tsx work/3/16/2026-03-16-remove-operational-banners-from-user-flows.md`
- `git diff --cached --name-only`
- `git diff --check --cached -- src/app/recommend/page.tsx src/components/SubscriptionClient.tsx work/3/16/2026-03-16-remove-operational-banners-from-user-flows.md`

## 남은 리스크
- 실제 freshness/fallback 상태 자체는 여전히 존재하며, 이제는 `/settings/data-sources`에서만 확인할 수 있습니다.
- 사용자가 설정 화면으로 이동하지 않으면 source 상태 문제를 즉시 인지하지 못할 수 있습니다.
- 다른 사용자 화면이 `DataFreshnessBanner`나 `FallbackBanner`를 별도로 쓰고 있다면, 이번 역할 분리 기준이 자동으로 적용되지는 않습니다.
