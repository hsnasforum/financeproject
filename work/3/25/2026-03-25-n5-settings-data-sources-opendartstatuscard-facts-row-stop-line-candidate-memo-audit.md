# 2026-03-25 n5-settings-data-sources-opendartstatuscard-facts-row-stop-line-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-stop-line-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: facts trio layer의 현재 intro, freshness helper, coverage helper 조합이 사실상 stop line 후보인지 점검하고, 없는 row-order/source-of-truth/`fetchStatus()`/status schema/build semantics 변경 계획을 만들지 않은 채 docs-only 종료선 후보만 정리했다.
- `work-log-closeout`: 이번 docs-only audit 라운드의 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- helper-saturation candidate memo까지는 현재 facts trio 조합이 충분한 meaning closure를 주는 편이라는 판단이 있었지만, 이를 실제로 facts trio layer의 stop line 후보로 둘 수 있는지는 아직 분리해 적지 못했다.
- 이번 라운드는 UI 구현이나 추가 helper spike가 아니라, 현재 조합을 facts trio layer의 종료선으로 문서상 확정할 수 있는지 docs-first로 좁히는 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 facts-row stop-line candidate memo를 추가해 현재 intro + freshness helper + coverage helper 조합이 facts trio layer 내부에서는 사실상 stop line 후보로 볼 수 있다고 정리했다. [검증 필요]
- 같은 문서에서 남아 있는 애매함은 helper 부족보다 row 순서, source-of-truth, show/hide, formatting, total-market/completeness semantics, `fetchStatus()`/status schema 계약 같은 다른 층위 문제에 더 가깝고, 여기서 helper를 더 늘리면 top summary/fallback/missing-index/dev-only disclosure 경계를 다시 흔드는 IA reopen으로 커질 수 있다고 명시했다. [검증 필요]
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 짧게 sync해 current next `N5` cut이 broad rewrite나 새 helper spike가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row stop-line closeout docs-only sync라는 점을 남겼다.
- row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, total-market/completeness semantics 추가, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위로 명시했다. [검증 필요]
- `src/components/OpenDartStatusCard.tsx`, `docs/current-screens.md`, `src/app/settings/data-sources/page.tsx`는 기준 확인만 했고 수정하지 않았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-stop-line-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- stop line 판단은 현재 markup과 copy를 바탕으로 한 docs-first 추론이며, 실제 사용자 이해도까지 검증한 것은 아니다. [검증 필요]
- 이후 라운드에서 facts trio helper를 다시 구현으로 열면, 의도와 달리 top summary, fallback, missing-index, dev-only disclosure까지 함께 재조정해야 하는 범위로 커질 수 있다. [검증 필요]
- route 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 명령으로 다시 검증한 것은 아니다. [미실행]
