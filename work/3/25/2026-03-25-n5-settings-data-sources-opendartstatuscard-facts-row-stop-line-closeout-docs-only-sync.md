# 2026-03-25 n5-settings-data-sources-opendartstatuscard-facts-row-stop-line-closeout-docs-only-sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-stop-line-closeout-docs-only-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only closeout sync 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: facts trio layer의 현재 intro, freshness helper, coverage helper 조합을 종료선으로 잠그고, 없는 row-order/source-of-truth/`fetchStatus()`/status schema/build semantics 변경 계획을 만들지 않은 채 closeout state와 다음 docs-first 질문만 정리했다.
- `work-log-closeout`: 이번 docs-only closeout 라운드의 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- stop-line candidate memo audit까지는 현재 facts trio 조합이 종료선 후보라는 판단이 있었지만, 이를 backlog 문서 기준으로 실제 closeout 상태로 잠그는 sync는 아직 남아 있었다.
- 이번 라운드는 코드 재수정이나 추가 helper spike가 아니라, facts trio layer를 현재 조합에서 일단 닫는다는 상태와 다음 smallest docs-first 질문을 문서에 맞추는 closeout 작업이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 facts-row stop-line closeout memo를 추가해 `지금 읽는 기준` intro, `2. 마지막 생성 시점` helper, `3. 반영된 회사 수` helper 조합이 facts trio layer 내부에서는 현재 종료선으로 읽힌다는 상태를 고정했다.
- 같은 문서에서 `src/components/OpenDartStatusCard.tsx` 구현, row 순서, source-of-truth, show/hide 조건, formatting rule, total-market/completeness semantics, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, build/button/disclosure/route contract가 바뀌지 않았고, top summary/fallback/missing-index/dev-only disclosure와 facts trio layer 경계도 현재 상태로 잠근다고 명시했다. [검증 필요]
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 상태를 짧게 sync해 current next question이 더 이상 facts trio를 더 다듬을지 여부가 아니라, 이 카드에서 정말 남은 smallest docs-first cut이 있는지 아니면 다른 surface로 넘어갈지로 바뀌었음을 반영했다.
- next smallest candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` residual-cut triage docs-first memo 정도로만 좁혔다. facts trio layer는 reopen하지 않고, 이 카드 안에 정말 남은 docs-only 미세 조정이 있는지부터 확인한다. [검증 필요]
- `docs/current-screens.md`, `src/components/OpenDartStatusCard.tsx`, `src/app/settings/data-sources/page.tsx`는 기준 확인만 했고 수정하지 않았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-stop-line-closeout-docs-only-sync.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- facts trio 종료선 판단은 현재 markup과 copy를 바탕으로 한 docs-first 추론이며, 실제 사용자 이해도까지 검증한 것은 아니다. [검증 필요]
- 이후 라운드에서 facts trio를 다시 구현 범위로 열면, 의도와 달리 top summary, fallback, missing-index, dev-only disclosure까지 함께 재조정해야 하는 범위로 커질 수 있다. [검증 필요]
- route 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 명령으로 다시 검증한 것은 아니다. [미실행]
