# 2026-03-25 n5-settings-data-sources-opendartstatuscard-residual-cut-triage-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-residual-cut-triage-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: facts trio closeout 이후 `OpenDartStatusCard` 내부에 남은 질문이 실제 micro docs-first cut인지, 아니면 contract/IA reopen으로 커지는지 triage했고, 없는 semantics 변경 계획을 만들지 않은 채 `none for now` 판단만 남겼다.
- `work-log-closeout`: 이번 docs-only triage 라운드의 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- stop-line closeout 이후 backlog 문서는 current next question을 “이 카드에 정말 residual cut이 남아 있는가”로 옮겨 둔 상태였고, 이를 별도 candidate memo로 정리할 필요가 있었다.
- 이번 라운드는 구현 spike가 아니라, `OpenDartStatusCard` 내부에 아직 남은 smallest docs-first cut이 실제로 더 있는지, 아니면 카드 자체를 현재 상태에서 닫고 다른 surface로 넘어가는 편이 맞는지 docs-first로 triage하는 작업이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 residual-cut triage candidate memo를 추가해, facts trio를 reopen하지 않는다는 전제에서는 card 내부의 residual ambiguity가 stable한 micro docs-first cut으로 잘 분리되지 않는다고 정리했다. [검증 필요]
- 같은 문서에서 남은 질문은 top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure/build helper와의 경계나 underlying read contract 의미에 더 가깝고, `configured` semantics, `userSummary()` 분기, `fetchStatus()` contract, status schema, build/button/disclosure/route contract를 건드리지 않으려면 `none for now`가 더 안전하다고 명시했다. [검증 필요]
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 짧게 sync해 current next question이 더 이상 이 카드 안에서 새 spike를 찾는 것이 아니라, 카드를 현재 상태에서 닫고 다른 surface로 넘어갈지 여부라는 점을 남겼다.
- smallest viable next candidate는 broad rewrite도, 새로운 card-internal spike도 아니라 `none for now`로 두었고, reopen이 필요하면 micro polish가 아니라 별도 contract/IA 질문으로 승격해 다시 열어야 한다고 적었다.
- `src/components/OpenDartStatusCard.tsx`, `docs/current-screens.md`, `src/app/settings/data-sources/page.tsx`는 기준 확인만 했고 수정하지 않았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-residual-cut-triage-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `none for now` 판단은 현재 markup과 copy를 바탕으로 한 docs-first 추론이며, 실제 사용자 이해도까지 검증한 것은 아니다. [검증 필요]
- 이후 라운드에서 이 카드를 다시 구현 범위로 열면, top summary, fallback, missing-index, dev-only disclosure와 underlying read contract를 함께 재조정해야 하는 범위로 커질 수 있다. [검증 필요]
- route 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 명령으로 다시 검증한 것은 아니다. [미실행]
