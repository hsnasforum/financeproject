# 2026-03-25 n5-settings-data-sources-opendartstatuscard-read-through-basis-facts-ownership-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-read-through-basis-facts-ownership-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: `지금 읽는 기준` 정상 facts block이 user-facing basis layer인지, fallback/missing-index/dev-only disclosure와 어떤 층위로 갈리는지만 좁히고 `fetchStatus()`/status schema/build semantics는 다시 열지 않았다.
- `work-log-closeout`: 이번 candidate memo audit의 role map, 다음 좁은 컷 권고, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- section-header helper post-spike sync 뒤 current next smallest candidate로 남은 것은 `지금 읽는 기준`의 정상 intro sentence와 fact rows가 top summary, fallback slot, missing-index helper, dev-only disclosure와 어떤 ownership으로 읽혀야 하는지였다.
- 이번 라운드는 구현 spike가 아니라, 이 facts block을 docs-first로 먼저 좁혀 broad OpenDART card rewrite나 fetch/status/disclosure contract 재설계로 번지지 않게 하기 위한 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 read-through basis facts role map을 추가해 `지금 읽는 기준`의 정상 intro sentence와 fact rows (`인덱스 준비`, `마지막 생성 기준`, `회사 수`)를 top summary 뒤의 primary read-through basis layer이자 user-facing current basis facts로 정리했다.
- 같은 메모에서 loading/error/empty는 이 basis layer를 대신하는 fallback slot, missing-index helper는 facts 뒤의 secondary helper, dev-only disclosure와 build action/result helper는 별도 operator/dev layer라고 분리했다.
- current surface 안의 smallest viable next candidate를 `/settings/data-sources` `OpenDartStatusCard` read-through basis facts ownership copy/helper spike로 좁혔다.
- `fetchStatus()` contract, status schema, `configured` boolean semantics, `userSummary()` 분기, build/button/disclosure contract, route/href contract는 비범위로 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 같은 판단을 짧게 sync해 current next `N5` cut이 narrow read-through basis facts ownership copy/helper spike라는 점만 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-read-through-basis-facts-ownership-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- read-through basis facts ownership은 current component reading을 바탕으로 한 docs-first 권고라서, 실제 구현 전에는 한 번 더 좁은 copy/helper spike로만 확인하는 편이 안전하다. [검증 필요]
- facts block을 fallback slot, missing-index helper, dev-only disclosure와 한 배치로 다시 열기 시작하면 current basis facts, failure fallback, operator disclosure contract가 함께 흔들리며 broad OpenDART card rewrite로 커질 수 있다. [검증 필요]
- route 변경이 없어서 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 자체를 재검증한 것은 아니다. [미실행]
