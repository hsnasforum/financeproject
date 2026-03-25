# 2026-03-24 n5-products-compare-post-spike-doc-sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-products-compare-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only sync 라운드이므로 `git diff --check`만 실행하고 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`, `src/app/products/compare/page.tsx`, 필요 시 `src/lib/products/compareStore.ts`를 대조해 이번 라운드에서 route/href 계약, compare basket/store semantics, desktop/mobile comparison field set 변경이 없음을 다시 확인했다.
- `work-log-closeout`: `/products/compare` first spike landed 범위, unchanged boundary, 다음 smallest cut recommendation을 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- 이미 landing한 `/products/compare` read-through-and-basket-action copy/helper polish를 backlog 문서 기준으로 정확히 동기화해야 했다.
- 이번 라운드는 코드 재수정이 아니라, compare spike가 실제로 들어간 현재 상태를 docs-only로 닫고 다음 smallest cut만 다시 좁히는 sync 작업이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `products-compare post-spike sync memo`를 추가해 실제 landed 범위를 `PageHeader` description, 상단 helper 문구, summary count label, `비교함 비우기`, `비교 후보 더 담기`, top summary helper, empty-state / insufficient-state helper, `대표 금리`, `다음 확인 포인트`, `상세에서 다시 확인`, kind label의 한국어 정리까지로 고정했다.
- 같은 메모에서 compare basket/store semantics, `새로고침`·제거·비우기 action behavior, href destination, desktop/mobile comparison field set, row/card 순서, route contract가 바뀌지 않았음을 명시했다.
- current next question이 더 이상 “products-compare basket-action helper를 구현할 것인가”가 아니라 “products family 안의 다음 smallest cut은 무엇인가”임을 문서에 맞췄다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 같은 상태를 짧게 sync했고, 현 시점의 next smallest candidate를 broad compare rewrite가 아니라 `/products/compare` desktop/mobile read-through helper docs-first memo로만 좁혔다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-compare-post-spike-doc-sync.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `/products/compare`는 summary/action row, empty/insufficient fallback, desktop table, mobile card가 함께 있어 다음 라운드를 바로 구현 spike로 열면 범위가 다시 넓어질 수 있다.
- 현 시점의 next cut은 basket/store semantics나 route contract 변경이 아니라 desktop/mobile read-through helper 경계를 docs-first로 다시 자르는 작업이어야 한다. [검증 필요]
