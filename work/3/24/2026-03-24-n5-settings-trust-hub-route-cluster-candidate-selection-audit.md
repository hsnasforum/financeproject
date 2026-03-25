# 2026-03-24 n5-settings-trust-hub-route-cluster-candidate-selection-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-trust-hub-route-cluster-candidate-selection-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate selection audit 라운드이므로 `git diff --check`만 실행하고 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/**/page.tsx`, 필요 시 관련 client component를 대조해 이번 라운드에서 route/href 계약이나 `Public Stable` 분류 변경이 없음을 확인했다.
- `work-log-closeout`: settings/trust-hub cluster map, defer subset, 다음 cut recommendation을 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- products family가 사실상 닫힌 현재 상태에서, 다음 stable/public cluster로 settings/trust-hub surface 안의 어떤 route 묶음이 가장 작은 후보인지 docs-first로 먼저 골라야 했다.
- 이번 라운드는 구현이 아니라 `/settings`, `/settings/alerts`, `/settings/backup`, `/settings/data-sources`, `/settings/maintenance`, `/settings/recovery` 중 무엇을 다음 배치로 자를지 정리하는 candidate selection audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `settings/trust-hub route-cluster candidate selection audit memo`를 추가해 cluster를 `/settings` host entry, `/settings/data-sources` trust/freshness owner, `/settings/alerts` rule/preset config, `/settings/backup`·`/settings/recovery`·`/settings/maintenance` operator-maintenance surface로 나눠 정리했다.
- current smallest viable next candidate를 `/settings` host surface로 고정했다. 현재 페이지가 얇은 header + card hub라서 entry/helper hierarchy를 좁게 다뤄도 trust/data-source policy나 recovery/backup semantics를 다시 열 가능성이 가장 낮다고 판단했다.
- `/settings/data-sources`는 health/freshness/trust helper owner, `/settings/backup`·`/settings/recovery`·`/settings/maintenance`는 destructive/export semantics 및 dev unlock flow, `/settings/alerts`는 preset/rule/filter/regex semantics 때문에 defer subset으로 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 짧게 sync했고, current next `N5` cut을 broad settings family 구현이 아니라 `/settings` host-surface docs-first candidate memo audit으로만 좁혔다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-trust-hub-route-cluster-candidate-selection-audit.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `/settings/alerts`는 host surface보다 얇아 보일 수 있지만 실제로는 preset/rule/filter/regex semantics와 sample alerts read-through가 함께 있어, 바로 작은 copy/helper spike로 가면 범위가 넓어질 수 있다.
- `/settings/data-sources`, `/settings/backup`, `/settings/recovery`, `/settings/maintenance`는 raw 운영 정보와 side effect가 강해 trust/data-source policy나 recovery/backup semantics를 건드리지 않고는 충분히 좁히기 어렵다. [검증 필요]
