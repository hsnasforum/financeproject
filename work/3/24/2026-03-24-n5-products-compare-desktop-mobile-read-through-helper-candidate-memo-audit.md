# 2026-03-24 n5-products-compare-desktop-mobile-read-through-helper-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-products-compare-desktop-mobile-read-through-helper-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드이므로 `git diff --check`만 실행하고 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/products/compare/page.tsx`를 대조해 이번 라운드에서 route/href 계약, public route 분류, detail CTA destination 변경이 없음을 확인했다.
- `work-log-closeout`: `/products/compare` desktop/mobile read-through role map, defer subset, 다음 cut recommendation을 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- `/products/compare`에서 basket-action 다음으로 남은 가장 작은 후속 축인 desktop/mobile read-through helper 경계를 docs-first로 더 좁혀야 했다.
- 이번 라운드는 구현이 아니라 desktop table과 mobile card의 read-through label, helper, detail CTA hierarchy를 어떤 범위까지 작은 배치로 다룰지 정리하는 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `products-compare desktop-mobile read-through helper candidate memo`를 추가해 desktop table과 mobile card를 같은 compare basket read-through surface로 묶어 적었다.
- `대표 금리`·`가입 기간`·`예금자 보호`는 factual scan layer, `다음 확인 포인트`는 secondary read-through helper, `상세에서 다시 확인`은 detail validation CTA라는 hierarchy를 문서에 고정했다.
- read-through helper와 basket action/helper는 현재 위치상 분리돼 있으므로, 다음 smallest cut은 action row 재수정이 아니라 desktop/mobile 내부 label/helper hierarchy 정리라고 명시했다.
- comparison field set 재구성, basket/store semantics 변경, detail destination 변경, summary/action row 재수정은 비범위로 남겼고, `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 짧게 sync했다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-compare-desktop-mobile-read-through-helper-candidate-memo-audit.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- desktop table과 mobile card는 같은 read-through 목적을 공유하지만 표현 밀도와 label 반복이 달라, 다음 라운드에서 한 번에 둘 다 크게 손보면 narrow helper polish 범위를 넘을 수 있다.
- `대표 금리` 계산 기준, `가입 기간` 대표 옵션 선택 규칙, `예금자 보호` source 판정은 copy/helper가 아니라 semantics 문제라 이번 docs-first memo만으로는 열지 않는다. [검증 필요]
