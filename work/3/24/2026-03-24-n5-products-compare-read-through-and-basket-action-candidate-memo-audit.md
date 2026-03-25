# 2026-03-24 n5-products-compare-read-through-and-basket-action-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-products-compare-read-through-and-basket-action-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드이므로 `git diff --check`만 실행하고 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`, `src/app/products/compare/page.tsx`, `src/lib/products/compareStore.ts`를 대조해 이번 라운드에서 route/href 계약 변경이 없음을 확인했다.
- `work-log-closeout`: `/products/compare` role map, defer subset, 다음 cut recommendation을 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- products family 안의 다음 smallest candidate로 좁혀진 `/products/compare`를 docs-first로 더 잘라, read-through layer와 basket action helper layer를 어떤 작은 배치로 다룰지 먼저 고정해야 했다.
- 이번 라운드는 구현이 아니라 상단 summary, basket action row, empty state/fallback, desktop/mobile comparison read-through가 어떤 위계로 읽혀야 하는지 정리하는 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `products-compare read-through-and-basket-action candidate memo`를 추가해 `/products/compare`를 compare basket read-through surface로 정의했다.
- desktop/mobile comparison view는 primary read-through layer, 상단 summary counts는 context summary, `새로고침`·`비교함 비우기`·`비교 후보 더 담기`는 basket action/helper layer, empty state와 “최소 2개” 카드는 basket action fallback으로 나눠 적었다.
- copy/helper만으로 가장 좁게 다룰 수 있는 다음 후보를 broad compare rewrite가 아니라 `/products/compare` basket-action hierarchy copy/helper polish spike로 고정했다.
- compare basket/store semantics, desktop/mobile comparison field set 재구성, empty-state destination 변경, route contract 변경은 비범위로 남겼고, `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 짧게 sync했다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-compare-read-through-and-basket-action-candidate-memo-audit.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `/products/compare`는 summary counts, basket action row, empty state, desktop/mobile comparison read-through가 함께 있어, 다음 라운드에서 read-through copy까지 같이 열면 범위가 빠르게 넓어질 수 있다.
- summary counts의 계산 기준과 basket action semantics는 현재 상태/store contract에 묶여 있으므로, helper wording을 넘어서 집계 규칙이나 action behavior를 건드리면 이번 docs-first audit 범위를 넘는다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 현재 워크트리 기준으로 untracked 상태라, 이번 라운드는 그 파일 안의 products compare section에 candidate memo만 추가했다.
