# 2026-03-24 n5-products-catalog-compare-filter-follow-through-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-products-catalog-compare-filter-follow-through-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드이므로 `git diff --check`만 실행하고 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`, `src/app/products/catalog/page.tsx`, 필요 시 `src/app/products/compare/page.tsx`, `src/lib/products/compareStore.ts`를 대조해 이번 라운드에서 route/href 계약 변경이 없음을 확인했다.
- `work-log-closeout`: `/products/catalog` role map, defer subset, 다음 cut recommendation을 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- products family 안의 다음 smallest candidate로 좁혀진 `/products/catalog`을 docs-first로 더 잘라, filter/search control과 compare follow-through를 어떤 작은 배치로 다룰지 먼저 고정해야 했다.
- 이번 라운드는 구현이 아니라 `상품군 선택`, 검색/필터, compare notice, `비교 후보 담기`, 대표 옵션 helper, `/products/compare` follow-through가 어떤 위계로 읽혀야 하는지 정리하는 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `products-catalog compare-filter-follow-through candidate memo`를 추가해 `/products/catalog`을 compare/filter host-follow-through surface로 정의했다.
- 상단 sticky control panel은 primary control layer, `대표 옵션` helper는 preview/trust layer, row-level `비교 후보 담기`와 global compare notice는 `/products/compare`로 이어지는 secondary compare follow-through layer로 나눠 적었다.
- source/freshness helper는 current `/products/catalog`의 first-read owner가 아니고 `generatedAt`도 UI에 직접 노출되지 않는다고 명시했다.
- next smallest candidate를 broad catalog 구현이 아니라 `/products/catalog` compare follow-through copy/helper polish spike로 좁혔고, filter/search semantics, compare basket/store semantics, `/products/compare` 구현, source/freshness policy 변경은 비범위로 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-catalog-compare-filter-follow-through-candidate-memo-audit.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `/products/catalog`은 sticky control panel, result preview helper, compare follow-through가 한 화면에 겹쳐 있어, 다음 라운드에서 compare helper를 손보더라도 control copy까지 함께 열면 범위가 빠르게 넓어질 수 있다.
- response type에 `generatedAt`가 있지만 현재 UI에 노출되지 않으므로, 후속 라운드에서 freshness helper를 새로 끌어오면 이번 docs-first audit 범위를 넘는다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 현재 워크트리 기준으로 untracked 상태라, 이번 라운드는 그 파일 안의 products catalog section에 candidate memo만 추가했다.
