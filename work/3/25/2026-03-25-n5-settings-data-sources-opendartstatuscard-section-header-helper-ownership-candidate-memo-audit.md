# 2026-03-25 n5-settings-data-sources-opendartstatuscard-section-header-helper-ownership-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-section-header-helper-ownership-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: section-header helper가 top-level orientation과 dev-only boundary 안내를 어떻게 함께 맡는지만 좁히고, `configured` semantics나 env/operator disclosure contract는 다시 열지 않았다.
- `work-log-closeout`: 이번 candidate memo audit의 role map, 다음 좁은 컷 권고, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- badge-primary-summary spike가 닫힌 뒤 현재 next smallest candidate로 남은 것은 `공시 데이터 연결 상태` 아래 helper가 card 전체의 orientation helper인지, badge-summary와 dev-only 관리 구간 사이의 reading-order bridge인지였다.
- 이번 라운드는 구현 spike가 아니라, section-header helper ownership을 docs-first로 먼저 좁혀 broad OpenDART card rewrite나 top-level IA 재설계로 번지지 않게 하기 위한 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 section-header helper role map을 추가해 이 문장이 card 전체의 top-level orientation layer이면서 상단 badge-summary와 하단 dev-only 관리 구간의 읽는 순서를 잇는 bridge helper라고 정리했다.
- 같은 메모에서 현재 한 문장이 user-facing trust orientation과 dev-only boundary 안내를 함께 맡고 있지만, 우선은 copy/helper만으로도 읽는 순서를 더 또렷하게 좁힐 수 있다고 명시했다.
- current smallest viable next candidate를 `/settings/data-sources` `OpenDartStatusCard` section-header helper ownership copy/helper spike로 좁혔다.
- card header block 구조, badge/summary 위치, `configured` boolean semantics, `userSummary()` 분기, env/operator disclosure contract, build/button/disclosure 구조, route/href contract는 비범위로 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 같은 판단을 짧게 sync해 current next `N5` cut이 narrow section-header helper ownership copy/helper spike라는 점만 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-section-header-helper-ownership-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- section-header helper ownership은 current component reading을 바탕으로 한 docs-first 권고라서, 실제 구현 전에는 한 번 더 좁은 copy/helper spike로만 확인하는 편이 안전하다. [검증 필요]
- 상단 helper를 다시 열 때 badge-summary ownership이나 dev-only management orientation을 같이 손대기 시작하면, 단순 helper wording이 아니라 card top-level information architecture 논의로 커질 수 있다. [검증 필요]
- 상단 helper, badge/summary, 하단 read-through/fallback, missing-index helper, dev-only disclosure, build result helper를 한 배치로 다시 열면 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]
