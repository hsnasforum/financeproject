# 2026-03-24 n5-products-host-surface-entry-hierarchy-copy-helper-polish-spike

## 변경 파일
- `src/app/products/page.tsx`
- `work/3/24/2026-03-24-n5-products-host-surface-entry-hierarchy-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `/products` page의 user-visible copy/helper 변경이므로 `pnpm lint`, `pnpm build`, `git diff --check`를 실행하고 `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/products/page.tsx`를 대조해 이번 라운드에서 `href`, route contract, public inventory 변경이 없음을 확인했다.
- `work-log-closeout`: 이번 single-surface spike의 실제 변경 파일, 실행한 검증, 남은 리스크를 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- `/products` host surface 안에서 primary entry CTA와 secondary shortcut layer가 같은 층위로 읽히지 않도록 copy/helper만 가장 작게 정리해야 했다.
- 이번 라운드는 `/products/catalog`·`/products/compare`의 compare/filter semantics나 source/freshness policy를 다시 여는 작업이 아니라, host entry hierarchy를 더 쉽게 읽히게 만드는 single-surface spike다.

## 핵심 변경
- `PageHeader` description을 `/products`가 결론 화면이 아니라 비교 시작점을 고르는 입구라는 톤으로 더 분명하게 바꿨다.
- hero 상단 helper와 본문 문구를 다듬고, primary CTA 아래에 “처음 시작할 때는 여기서 가장 넓게 비교 기준을 잡는다”는 보조 문구를 추가해 `통합 카탈로그에서 비교 시작`을 primary entry로 고정했다.
- `카테고리 바로가기` description은 “이미 상품군이 정해졌을 때 쓰는 좁은 시작점”으로 정리했다.
- 상품군 card description과 footer label은 category shortcut tone으로 조정해, primary CTA와 달리 `이 상품군 보기` 성격의 secondary entry로 읽히게 맞췄다.
- `href`, card 순서, compare deep-link semantics, source/freshness helper, downstream page는 바꾸지 않았고 current memo 범위와 맞아 backlog 문서 sync는 생략했다.

## 검증
- 실행: `pnpm lint`
  - 통과. 기존 저장소 warning 30건만 있었고 error는 없었다.
- 실행: `pnpm build`
  - 통과.
- 실행: `git diff --check -- src/app/products/page.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-host-surface-entry-hierarchy-copy-helper-polish-spike.md`
  - 통과.
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `/products` 안의 통합 탐색 card는 여전히 `/products/catalog`로 연결되므로, 후속 라운드에서 이 card와 hero primary CTA의 관계를 더 바꾸려 들면 host-only 범위를 넘어갈 수 있다.
- category card 문구를 더 구체화하려고 downstream compare/filter 흐름이나 기준 시점 helper를 여기로 끌어오면 이번 narrow spike 경계를 넘는다.
