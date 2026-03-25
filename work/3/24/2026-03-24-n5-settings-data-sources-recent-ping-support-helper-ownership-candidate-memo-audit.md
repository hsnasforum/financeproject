# 2026-03-24 n5-settings-data-sources-recent-ping-support-helper-ownership-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-recent-ping-support-helper-ownership-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드에 맞춰 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `/settings/data-sources` 관련 route/page를 대조해 route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: `DataSourceStatusCard`, `DataSourcePingButton`, `pingState`를 함께 읽어 recent ping snapshot helper와 dev-only ping action ownership이 섞이지 않는지 다시 점검하고, ping semantics·storage ownership·event contract는 비범위로 고정했다.
- `work-log-closeout`: recent-ping ownership role map, defer 목록, 다음 narrow cut 권고를 `/work` 형식으로 남겼다.

## 변경 이유
- status-cards spike 이후에도 `최근 연결 확인 참고`가 user-facing current-state helper의 연장인지, recent ping snapshot을 보조 evidence로 읽어야 하는지 한 번 더 좁혀 둘 필요가 있었다.
- 이번 라운드는 구현이 아니라 recent ping snapshot helper와 footer ping action ownership을 docs-first로 먼저 고정해 broad ping/status rewrite로 번지지 않도록 하기 위한 candidate audit이다.

## 핵심 변경
- backlog에 recent-ping support-helper ownership memo를 추가해 `최근 연결 확인 참고`를 `현재 읽는 기준` 뒤에 읽는 support validation helper로 정리했다.
- snapshot badge, summary text, `fetchedAt`, detail chips는 canonical current-state owner가 아니라 최근 점검 근거이며, footer `DataSourcePingButton`은 명확한 dev-only action이라는 점을 문서에 고정했다.
- `createDataSourcePingSnapshot()`, local storage snapshot ownership, `DATA_SOURCE_PING_UPDATED_EVENT`, `DataSourcePingButton` action behavior는 helper wording과 분리된 contract로 남겨 두었다.
- next smallest candidate를 broad ping/status rewrite가 아니라 `/settings/data-sources` `DataSourceStatusCard` recent-ping support-helper ownership copy/helper spike로 좁혔다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-recent-ping-support-helper-ownership-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- recent ping snapshot helper는 wording으로 support evidence로 좁힐 수 있어도 실제 source-of-truth는 local storage snapshot과 `DATA_SOURCE_PING_UPDATED_EVENT`에 기대고 있어, visibility나 ownership을 건드리면 ping semantics와 storage/event contract를 다시 열게 된다. [검증 필요]
- `createDataSourcePingSnapshot()`이 만드는 summary/chip content와 `DataSourcePingButton` action behavior를 함께 다시 맞추기 시작하면 broad ping/status rewrite로 번질 수 있다. [검증 필요]
