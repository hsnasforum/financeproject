# 2026-03-24 n5-products-catalog-compare-follow-through-post-spike-doc-sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-products-catalog-compare-follow-through-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only sync 라운드이므로 `git diff --check`만 실행하고 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`, `src/app/products/catalog/page.tsx`, 필요 시 `src/app/products/compare/page.tsx`, `src/lib/products/compareStore.ts`를 대조해 이번 라운드에서 route/href 계약이나 compare route 연결 변경이 없음을 다시 확인했다.
- `work-log-closeout`: `/products/catalog` compare follow-through spike landed 범위, unchanged boundary, 다음 smallest cut recommendation을 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- 방금 landing한 `/products/catalog` compare follow-through copy/helper polish를 backlog 문서 기준으로 정확히 동기화해야 했다.
- 이번 라운드는 코드 재수정이 아니라, catalog spike가 이미 닫혔다는 상태와 products family 안의 다음 smallest candidate만 docs-only로 맞추는 sync 작업이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `products-catalog compare follow-through post-spike sync memo`를 추가해 실제 landed 범위를 `compareNotice` 본문, compareNotice 아래 보조 helper, row-level `비교 후보 담기` helper, `대표 옵션` preview helper tone 조정으로 고정했다.
- 같은 메모에서 sticky control panel의 filter/search control 구조, compare basket/store semantics, `/products/compare` route/구현, source/freshness helper policy, row/card 순서, href destination이 바뀌지 않았음을 명시했다.
- current next question이 더 이상 “catalog compare helper를 구현할 것인가”가 아니라 “products family 안의 다음 smallest cut은 무엇인가”임을 문서에 맞췄다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 같은 상태를 짧게 sync했고, 현 시점의 next smallest candidate를 broad catalog rewrite가 아니라 `/products/compare` docs-first candidate memo audit으로만 좁혔다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-catalog-compare-follow-through-post-spike-doc-sync.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `/products/compare`는 compare basket 상태, 비우기/제거 action, empty state, desktop/mobile comparison read-through가 함께 있어, 다음 라운드도 곧바로 구현 spike로 가면 범위가 넓어질 수 있다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 현재 워크트리 기준으로 untracked 상태라, 이번 라운드는 그 파일 안의 products catalog section에 post-spike sync memo만 추가했다.
