# 2026-03-25 n5-stable-public-remaining-surface-reselection-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-stable-public-remaining-surface-reselection-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only reselection audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/recommend/page.tsx`, `src/app/recommend/history/page.tsx`, `src/app/products/page.tsx`, `src/app/products/compare/page.tsx`, `src/app/settings/page.tsx`를 다시 대조해 이번 라운드에서 route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: `settings/data-sources`와 `OpenDartStatusCard` closeout 이후 남은 stable/public surface를 다시 고르면서, freshness/source/build/store policy 같은 없는 contract 변경 계획을 만들지 않고 data-source/disclosure risk를 defer 대상으로 분리했다.
- `work-log-closeout`: 이번 docs-only reselection 라운드의 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- `OpenDartStatusCard`를 `none for now`로 닫은 현재 상태에서, `N5` stable/public backlog 안에 실제로 다시 열 수 있는 다음 smallest cut이 무엇인지 재선정할 필요가 있었다.
- 이번 라운드는 새 구현 spike를 만드는 작업이 아니라, 이미 parked 또는 closeout된 cluster를 제외하고 남은 surface 중 docs-first로 안정적으로 분리 가능한 후보가 실제로 있는지 audit하는 작업이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `stable-public remaining-surface reselection audit memo`를 추가해 `/feedback` cluster는 parked 유지로 제외하고, remaining stable/public cluster map을 `planning stable`, `recommend`, `products/public/explore`, `settings/trust-hub` 네 축으로 다시 정리했다. [검증 필요]
- 같은 memo에서 `recommend` cluster는 history, host pre-result, result-header, planning-linkage strip small cut이 이미 landing해 새 UI spike보다 cluster-level closeout sync가 더 작은 남은 작업이라고 적고, current smallest viable next candidate를 `recommend route-cluster post-polish closeout memo`로 좁혔다. [검증 필요]
- `products/public/explore` cluster는 `/products` host, `/products/catalog`, `/products/compare` 좁은 cut이 이미 landing했고 남은 family가 freshness/source/disclosure helper와 더 강하게 묶여 있어 현재는 reopen 부적절하다고 정리했다. `settings/trust-hub` family도 `/settings` host와 `/settings/data-sources` 이후 남은 route가 rule/filter 또는 operator semantics에 더 가까워 safe micro cut이 뚜렷하지 않다고 남겼다. [검증 필요]
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 연결 메모로 sync해, current next `N5` cut을 broad stable/public rewrite가 아니라 `recommend route-cluster post-polish closeout memo` 같은 docs-first closeout sync로 맞췄다. [검증 필요]
- 코드, route, layout, semantics는 수정하지 않았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-stable-public-remaining-surface-reselection-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 reselection은 backlog 문서와 현재 route/page 구조를 바탕으로 한 docs-first 판단이며, 실제 사용자 이해도나 운영 피드백으로 remaining surface를 다시 검증한 것은 아니다. [검증 필요]
- `recommend route-cluster post-polish closeout memo`를 다음 cut으로 두었지만, 그 closeout에서 result card trust cue, compare/save/export semantics, planning linkage/store flow까지 함께 열기 시작하면 다시 broad cluster reopen으로 커질 수 있다. [검증 필요]
- route 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT를 명령으로 다시 검증한 것은 아니다. [미실행]
