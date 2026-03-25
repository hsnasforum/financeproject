# 2026-03-25 n5-settings-data-sources-opendartstatuscard-section-header-helper-ownership-post-spike-doc-sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-section-header-helper-ownership-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only post-spike sync 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: 방금 landing한 section-header helper 한 줄과 unchanged `configured`/`userSummary()`/disclosure boundary를 분리해, 없는 semantics 변경 계획을 만들지 않고 backlog를 sync했다.
- `work-log-closeout`: 이번 docs-only sync 라운드의 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- 방금 landing한 `OpenDartStatusCard` section-header helper ownership copy/helper polish는 코드에는 반영됐지만, backlog 문서는 아직 future candidate memo처럼 읽히는 상태였다.
- 이번 라운드는 코드 재수정이 아니라 actual landed scope와 unchanged boundary를 문서 기준으로 닫고, current next question을 다음 smallest docs-first cut selection으로 옮기는 sync 작업이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 section-header helper ownership post-spike sync memo를 추가해 actual landed 범위를 `공시 데이터 연결 상태` 아래 helper 한 줄 조정으로 고정하고, 상단 user-facing summary를 먼저 읽고 dev-only 관리 구간은 아래에서만 확인한다는 reading-order bridge tone을 명시했다.
- 같은 문서에서 `configured` boolean semantics, `userSummary()` 분기, badge quick-status helper, `사용자에게 먼저 보이는 기준` helper, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract가 바뀌지 않았음을 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 상태를 짧게 sync해 이 spike가 이미 닫혔고 current next `N5` question이 next smallest docs-first cut selection으로 바뀌었음을 반영했다.
- next smallest candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` read-through basis facts ownership docs-first memo 정도로만 좁혔다. `지금 읽는 기준`의 정상 intro/facts block이 top summary, fallback slot, dev-only layers와 어떤 층위로 읽히는지부터 좁히고, `configured` semantics, `userSummary()` 분기, fetch/status/build/button/disclosure/route contract reopen은 비범위로 남겼다. [검증 필요]
- `docs/current-screens.md`, `src/components/OpenDartStatusCard.tsx`, `src/app/settings/data-sources/page.tsx`는 기준 확인만 했고 수정하지 않았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-section-header-helper-ownership-post-spike-doc-sync.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- next smallest candidate인 read-through basis facts ownership은 current component reading을 바탕으로 한 docs-first 권고라서, 실제 구현 전에는 한 번 더 좁은 candidate memo audit로 확인하는 편이 안전하다. [검증 필요]
- `지금 읽는 기준` 정상 facts block, fallback slot, missing-index helper, dev-only disclosure를 한 배치로 다시 열면 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]
- route 변경이 없어서 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 테스트로 다시 확인한 것은 아니다. [미실행]
