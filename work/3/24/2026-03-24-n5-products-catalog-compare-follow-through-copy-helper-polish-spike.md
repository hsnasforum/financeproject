# 2026-03-24 n5-products-catalog-compare-follow-through-copy-helper-polish-spike

## 변경 파일
- `src/app/products/catalog/page.tsx`
- `work/3/24/2026-03-24-n5-products-catalog-compare-follow-through-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `/products/catalog` page의 user-visible copy/helper 변경이므로 `pnpm lint`, `pnpm build`, `git diff --check`를 실행하고 `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`, `src/app/products/catalog/page.tsx`, 필요 시 `src/app/products/compare/page.tsx`, `src/lib/products/compareStore.ts`를 대조해 이번 라운드에서 `href`, route contract, compare route 연결이 바뀌지 않았음을 확인했다.
- `work-log-closeout`: 이번 single-surface spike의 실제 변경 파일, 실행한 검증, 남은 리스크를 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- `/products/catalog` 안에서 control layer를 건드리지 않고 compare follow-through layer만 더 또렷하게 읽히게 만드는 최소 수정이 필요했다.
- 이번 라운드는 filter/search semantics나 compare basket/store policy를 다시 여는 작업이 아니라, `compareNotice`, row-level `비교 후보 담기`, `대표 옵션` helper 톤만 다듬는 single-surface spike다.

## 핵심 변경
- `compareNotice` 본문을 “비교함에 담았다”에서 끝내지 않고, 나란히 다시 보는 일은 `/products/compare`에서 이어진다는 follow-through 톤으로 보강했다.
- `compareNotice` 아래에 “지금은 후보를 담아 두는 단계”라는 보조 helper를 추가해 compare basket이 secondary follow-through layer임을 더 분명히 했다.
- `대표 옵션` helper는 “현재 목록을 빠르게 훑는 미리보기”라는 preview/trust 톤으로 다시 썼다.
- row-level action 아래에는 `비교 후보 담기`가 지금 결론을 정하는 버튼이 아니라 비교 화면에서 다시 볼 후보를 모아 두는 단계라는 짧은 helper를 추가했다.
- `href`, filter/search control 구조, compare basket 저장 정책, `/products/compare` 구현, freshness helper, row/card 순서는 바꾸지 않았고 current memo 범위와 맞아 backlog 문서 sync는 생략했다.

## 검증
- 실행: `pnpm lint`
  - 통과. 기존 저장소 warning 30건만 있었고 error는 없었다.
- 실행: `pnpm build`
  - 통과.
- 실행: `git diff --check -- src/app/products/catalog/page.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-products-catalog-compare-follow-through-copy-helper-polish-spike.md`
  - 통과.
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `/products/catalog`은 compare follow-through helper와 filter/search control이 한 화면에 함께 있어, 후속 라운드에서 control copy까지 같이 손대면 이번 narrow spike 범위를 넘어갈 수 있다.
- compare helper 문구를 더 강하게 바꾸려다 `/products/compare` flow나 compare basket 정책까지 다시 설명하기 시작하면 semantics reopen으로 번질 수 있다.
