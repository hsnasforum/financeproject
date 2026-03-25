# 2026-03-24 n5-settings-host-surface-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-host-surface-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드이므로 `git diff --check`만 실행하고 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`, `src/app/settings/page.tsx`, 필요 시 `src/app/settings/data-sources/page.tsx`를 대조해 이번 라운드에서 `/settings` host route 계약과 `Public Stable` 분류 변경이 없음을 확인했다.
- `work-log-closeout`: `/settings` host-surface role map, defer subset, 다음 cut recommendation을 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- `/settings` host surface를 settings/trust-hub cluster 안의 다음 smallest candidate로 docs-first로 더 좁혀야 했다.
- 이번 라운드는 구현이 아니라 `/settings`의 entry/helper/CTA hierarchy를 어떤 범위까지 작은 배치로 다룰 수 있는지 정리하는 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `settings host-surface candidate memo`를 추가해 `/settings`를 특정 설정을 끝내는 화면이 아니라 어디서 설정을 시작할지 고르는 host entry surface로 정의했다.
- `PageHeader`는 orientation layer, card title/description은 peer shortcut layer, 반복되는 `Setup ▶`는 card-level entry helper라는 hierarchy를 문서에 고정했다.
- current host surface에서 copy/helper만으로 좁게 다룰 수 있는 범위를 `PageHeader` description, host helper tone, card description, `Setup ▶` helper tone으로 한정했다.
- trust/data-source freshness owner 역할, recovery/backup semantics, status badge나 destructive warning을 host surface로 끌어올리는 일은 defer subset으로 남겼고, `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 짧게 sync했다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-host-surface-candidate-memo-audit.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `/settings`가 얇은 host hub라 해도 card 설명을 지나치게 구체화하면 `data-sources` trust owner 역할이나 `backup/recovery` 위험 semantics를 host surface로 끌어올릴 수 있다. [검증 필요]
- `Setup ▶`를 card별로 다른 CTA 의미로 바꾸거나 특정 card만 primary처럼 올리면 peer shortcut 구조가 흔들릴 수 있다. [검증 필요]
