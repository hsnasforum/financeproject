# 2026-03-24 n5-settings-host-surface-entry-hierarchy-copy-helper-polish-spike

## 변경 파일
- `src/app/settings/page.tsx`
- `work/3/24/2026-03-24-n5-settings-host-surface-entry-hierarchy-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `/settings` page UI text 라운드이므로 `pnpm lint`, `pnpm build`, 지정된 `git diff --check`를 실행하고 `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/page.tsx`를 대조해 이번 라운드에서 `/settings` public route, 각 card `href`, route contract 변경이 없음을 확인했다.
- `work-log-closeout`: `/settings` host-surface spike의 실제 변경 범위, 실행한 검증, 남은 리스크를 오늘 `/work` closeout 형식으로 정리했다.

## 변경 이유
- `/settings` host surface 안에서 entry hierarchy copy/helper만 가장 작게 구현해 “설정을 끝내는 화면”이 아니라 “어디서 시작할지 고르는 host hub”라는 읽는 순서를 더 또렷하게 만들어야 했다.
- 이번 라운드는 route 변경이나 trust/data-source policy 재설계가 아니라, `PageHeader`, host helper, card description, `Setup ▶` helper tone만 정리하는 single-surface spike다.

## 핵심 변경
- `src/app/settings/page.tsx`의 `PageHeader` description을 “필요한 영역을 먼저 고르고 각 화면에서 이어서 확인하는 구조”로 바꿔 host orientation layer를 분명히 했다.
- header 아래에 짧은 host helper 1개를 추가해 이 화면이 설정을 끝내는 곳이 아니라 시작할 영역을 고르는 안내 화면이라는 점을 직접적으로 설명했다.
- 다섯 card description을 모두 “설정 영역” 기준으로 다시 써서 peer shortcut layer 톤을 맞추고, downstream trust/freshness나 recovery/backup semantics를 host surface로 끌어올리지 않도록 유지했다.
- 반복되는 `Setup ▶`는 `이 설정 열기 ▶`로만 조정해 card-level entry helper 톤을 한국어로 정리했다.
- current candidate memo와 landed 범위가 같아서 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`, `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 수정하지 않았다.

## 검증
- 실행: `pnpm lint` (`0 errors`, 기존 unrelated warning 30건)
- 실행: `pnpm build`
- 실행: `git diff --check -- src/app/settings/page.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-host-surface-entry-hierarchy-copy-helper-polish-spike.md`
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `/settings` host hub 톤은 정리됐지만 card 설명을 더 구체화하기 시작하면 `data-sources` trust owner 역할이나 `backup/recovery` 위험 semantics를 host surface로 끌어올릴 수 있다.
- 현재 모든 card가 peer shortcut 구조를 유지하므로, 다음 라운드에서 특정 card만 더 강한 CTA나 상태 신호를 주기 시작하면 이번 narrow spike 범위를 넘을 수 있다. [검증 필요]
