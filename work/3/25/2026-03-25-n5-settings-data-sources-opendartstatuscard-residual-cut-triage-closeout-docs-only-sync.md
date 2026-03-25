# 2026-03-25 n5-settings-data-sources-opendartstatuscard-residual-cut-triage-closeout-docs-only-sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-residual-cut-triage-closeout-docs-only-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only closeout sync 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: `OpenDartStatusCard`의 residual ambiguity가 실제 micro docs-first cut으로 안정적으로 분리되는지 다시 점검하고, 없는 semantics 변경 계획을 만들지 않은 채 `none for now` closeout 기준만 문서에 잠갔다.
- `work-log-closeout`: 이번 docs-only closeout 라운드의 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- residual-cut triage candidate memo까지는 `OpenDartStatusCard` 내부 ambiguity를 `none for now`로 보는 판단이 있었지만, backlog 문서 기준으로는 아직 closeout sync가 남아 있었다.
- 이번 라운드는 코드 재수정이 아니라, 이 카드 내부 next smallest cut이 현재는 없고 reopen 기준도 micro copy polish가 아닌 별도 contract/IA question이어야 한다는 상태를 docs-only로 잠그는 작업이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 residual-cut triage closeout memo를 추가해 `OpenDartStatusCard` 내부 residual ambiguity는 현재 stable한 micro docs-first cut으로 더 분리되지 않으며, card-internal smallest viable next candidate는 `none for now`라고 고정했다. [검증 필요]
- 같은 문서에서 이번 closeout으로 바뀌지 않은 경계를 명시했다. `src/components/OpenDartStatusCard.tsx` 구현, facts trio layer, top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure 구조, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, build/button/disclosure/route contract는 그대로 둔다. [검증 필요]
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 상태를 연결 메모로 sync해 residual-cut triage를 future question으로 남기지 않고, current next question을 “이 카드를 닫고 다음 stable surface로 넘어갈 것인가”로 잠갔다. [검증 필요]
- reopen이 필요하면 `OpenDartStatusCard` 내부 micro spike가 아니라 별도 contract/IA question으로 승격해 다시 열어야 한다는 기준을 두 문서에 함께 남겼다.
- `docs/current-screens.md`, `src/components/OpenDartStatusCard.tsx`, `src/app/settings/data-sources/page.tsx`는 기준 확인만 했고 수정하지 않았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-residual-cut-triage-closeout-docs-only-sync.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `none for now` closeout은 현재 markup과 backlog 문맥을 바탕으로 한 docs-first 판단이며, 실제 사용자 이해도나 운영 피드백으로 재검증한 것은 아니다. [검증 필요]
- 이후 이 카드를 다시 열어야 한다면, top summary, fallback, missing-index helper, dev-only disclosure 중 어느 한 지점만 micro copy로 조정하기보다 contract/IA 질문으로 승격해 범위를 다시 재단해야 한다. [검증 필요]
- route 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT를 명령으로 다시 검증한 것은 아니다. [미실행]
