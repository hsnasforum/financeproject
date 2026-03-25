# 2026-03-24 n5-products-public-explore-route-cluster-candidate-selection-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-products-public-explore-route-cluster-candidate-selection-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only selection audit 라운드에 맞춰 `git diff --check`만 실행하고 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 대표 route를 대조해 `/products*`, `/benefits`, `/compare`, `/gov24`, `/public/dart*`, `/tools/fx`의 current `Public Stable` inventory를 다시 확인했고 route 추가/삭제나 href 계약 변경이 없음을 확인했다.
- `work-log-closeout`: 이번 cluster selection 판단, defer 기준, 다음 cut recommendation을 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- `/recommend` cluster가 small-batch 기준으로 사실상 닫힌 현재 상태에서, 다음 stable/public cluster를 무엇으로 잡을지 docs-first로 먼저 좁혀야 했다.
- 이번 라운드는 구현이 아니라 `/products*`, `/benefits`, `/compare`, `/gov24`, `/public/dart*`, `/tools/fx` 중 copy/helper polish 관점에서 가장 작은 다음 후보를 고르는 selection audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `products/public/explore route-cluster candidate selection audit memo`를 추가해 route family를 `products host / compare`, `public benefit lookup`, `public disclosure`, `fx utility` 네 갈래로 나눴다.
- smallest viable next candidate를 broad cluster 구현이 아니라 `/products` host-surface docs-first candidate memo audit으로 고정했다.
- `/compare`는 `/products/compare` alias로 보고, `/products/catalog`·`/products/compare`는 compare/filter semantics 때문에, `/benefits`·`/gov24`·`/public/dart*`·`/tools/fx`는 freshness/source 또는 disclosure helper risk 때문에 이번 라운드에서 defer 대상으로 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 recommend 다음 stable/public cluster selection 결과와 `/products` 우선 추천을 짧게 sync했다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-public-explore-route-cluster-candidate-selection-audit.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 판단은 representative route와 helper 밀도 기준의 docs-first selection이라, `/products` 내부에서도 실제 첫 구현 전에 header/hero/category shortcut만 좁힐지 추가 memo에서 한 번 더 고정하는 편이 안전하다.
- `/tools/fx`는 단일 route라 작아 보이지만 기준 환율/기준일 helper가 산출값 기대치와 바로 연결돼 있어, source/freshness policy를 건드리지 않는 좁은 cut이 실제로 가능한지는 후속 라운드에서 다시 확인이 필요하다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 현재 워크트리 기준으로 untracked 상태라, 이번 라운드는 그 파일의 `상품 / 공공정보 / 탐색 surface` section에 selection memo만 추가했다.
