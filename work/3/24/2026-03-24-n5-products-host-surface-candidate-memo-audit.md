# 2026-03-24 n5-products-host-surface-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-products-host-surface-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드에 맞춰 `git diff --check`만 실행하고 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`, `src/app/products/page.tsx`, 필요 시 `src/app/products/catalog/page.tsx`를 대조해 `/products`와 downstream route의 current `Public Stable` inventory를 다시 확인했고 route/href 계약 변경이 없음을 확인했다.
- `work-log-closeout`: `/products` host surface의 role map, defer subset, 다음 cut recommendation을 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- 앞선 cluster selection에서 next smallest candidate로 정해진 `/products` host surface를 docs-first로 더 좁혀, 실제로 어디까지를 single-surface small batch로 다룰 수 있는지 먼저 고정해야 했다.
- 이번 라운드는 구현이 아니라 `/products`의 entry/helper/trust cue/CTA hierarchy와 downstream compare/freshness concern의 경계를 분리하는 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `products host-surface candidate memo`를 추가해 `/products`를 `금융탐색`의 host entry surface로 정의하고, `통합 카탈로그에서 비교 시작`을 primary entry CTA, `카테고리 바로가기`와 상품군 card를 secondary shortcut layer로 고정했다.
- compare deep-link와 source/freshness helper는 current `/products`의 first-read owner가 아니라 `/products/catalog` 등 downstream route concern이라고 명시했다.
- smallest viable next candidate를 broad family 구현이 아니라 `/products` host-surface entry hierarchy copy/helper polish spike로 좁혔다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 현재 다음 컷이 `/products` host-surface entry hierarchy copy/helper polish spike라는 연결 메모만 짧게 sync했다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-host-surface-candidate-memo-audit.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- current `/products`는 화면 자체가 얇지만 hero와 category shortcut 문구를 손볼 때 `/products/catalog` compare 흐름까지 함께 설명하려 들면 곧바로 downstream semantics를 reopen할 수 있다.
- source/freshness helper는 current host surface에 직접 노출되지 않으므로, 후속 spike에서도 이를 새로 끌어올리면 docs-first audit 범위를 넘는다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 현재 워크트리 기준으로 untracked 상태라, 이번 라운드는 그 파일의 `상품 / 공공정보 / 탐색 surface` section에 `/products` host-surface memo만 추가했다.
