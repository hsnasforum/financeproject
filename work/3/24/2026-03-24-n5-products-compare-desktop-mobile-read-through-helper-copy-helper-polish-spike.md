# 2026-03-24 n5-products-compare-desktop-mobile-read-through-helper-copy-helper-polish-spike

## 변경 파일
- `src/app/products/compare/page.tsx`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-products-compare-desktop-mobile-read-through-helper-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `/products/compare` page UI text 라운드이므로 `pnpm lint`, `pnpm build`, 지정된 `git diff --check`를 실행하고 `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/products/compare/page.tsx`를 대조해 이번 라운드에서 `/products/compare` public route, `/products/catalog/[id]` deep-link, route contract 변경이 없음을 확인했다.
- `work-log-closeout`: desktop/mobile read-through helper spike의 landed 범위, 실행한 검증, 남은 리스크를 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- `/products/compare` 안에서 desktop/mobile read-through helper copy만 가장 작게 구현해 shared label/helper hierarchy를 더 또렷하게 만들어야 했다.
- 이번 라운드는 basket/store semantics나 comparison field set 재설계가 아니라, desktop table과 mobile card가 같은 read-through 순서를 공유한다는 점을 문구로만 정리하는 single-surface spike다.

## 핵심 변경
- `src/app/products/compare/page.tsx`에 shared read-through helper 한 줄을 추가해 desktop table과 mobile card 모두에서 “대표 금리 → 가입 기간 → 예금자 보호 → 다음 확인 포인트 메모 → 상세 확인” 순서가 먼저 읽히게 했다.
- desktop table의 첫 column helper tone을 `비교 항목`에서 `같이 읽는 기준`으로 조정해 read-through 목적을 더 직접적으로 드러냈다.
- desktop/mobile 공통 summary label을 `다음 확인 포인트 메모`로 맞추고, detail CTA를 `상세에서 조건 다시 확인`으로 맞춰 secondary helper와 detail validation CTA 층위를 더 분명하게 만들었다.
- basket action row, empty-state destination, `/products/catalog` deep-link contract, comparison field set, remove button 동작, basket/store semantics는 그대로 유지됐다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`와 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 이 spike가 이미 landing했다는 post-spike sync memo만 최소 범위로 추가했다.

## 검증
- 실행: `pnpm lint` (`0 errors`, 기존 unrelated warning 30건)
- 실행: `pnpm build`
- 실행: `git diff --check -- src/app/products/compare/page.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-compare-desktop-mobile-read-through-helper-copy-helper-polish-spike.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- desktop table과 mobile card의 read-through helper tone은 맞췄지만, field set 자체와 표현 밀도는 그대로라 다음 라운드에서 schema나 layout까지 함께 열면 narrow copy spike 범위를 넘을 수 있다.
- `대표 금리` 계산 기준, `가입 기간` 대표 옵션 선택 규칙, `예금자 보호` 판정 source는 이번 라운드의 copy/helper 범위가 아니라 semantics 문제로 남아 있다. [검증 필요]
