# 2026-03-24 n5-settings-data-sources-recent-ping-support-helper-ownership-post-spike-doc-sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-recent-ping-support-helper-ownership-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only sync 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: recent-ping helper wording landed 범위와 ping/storage/event ownership unchanged boundary를 분리해, freshness/ping semantics를 다시 열지 않도록 문서를 sync했다.
- `work-log-closeout`: 이번 docs-only sync 라운드의 변경 범위, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- recent-ping support-helper ownership copy/helper spike는 이미 landing했지만, backlog 문서 두 곳은 여전히 future candidate 또는 다음 구현 spike처럼 읽히는 상태였다.
- 이번 라운드는 코드 재수정이 아니라, 실제 landed 범위와 unchanged boundary를 post-spike 기준으로 닫고 current next question을 다음 smallest docs-first cut selection으로 옮기는 sync 작업이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`의 recent-ping 섹션을 candidate memo에서 post-spike sync memo로 바꾸고, 실제 landed 범위를 `최근 연결 확인 참고` 보조 문구, recent evidence layer 설명, footer helper 문구 조정으로 고정했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 상태를 짧게 sync해 recent-ping helper wording spike가 이미 닫혔음을 반영했다.
- 두 문서 모두 `DataSourcePingButton` 동작, `/api/dev/data-sources/ping` endpoint contract, local storage snapshot ownership, `DATA_SOURCE_PING_UPDATED_EVENT`, `createDataSourcePingSnapshot()` contract, snapshot schema, route/href contract가 바뀌지 않았음을 명시했다.
- current next question을 “recent-ping helper wording을 구현할 것인가”가 아니라 “status surface 안에서 그 다음 smallest docs-first cut을 무엇으로 둘 것인가”로 바꿨다.
- broad ping/status rewrite 대신 docs-first candidate memo 수준만 다음 컷으로 허용했고, 현재 좁은 후보는 `OpenDartStatusCard` build-notice/disabled-reason helper ownership memo로만 남겼다. [검증 필요]

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-recent-ping-support-helper-ownership-post-spike-doc-sync.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- next smallest candidate 이름은 current code와 residual risk를 기준으로 한 docs-first 권고라서, 실제 구현 전에는 한 번 더 좁은 candidate audit로 확인해야 한다. [검증 필요]
- recent ping snapshot은 local storage/event ownership이 그대로라 visibility나 ownership을 다시 건드리면 ping semantics와 snapshot contract를 다시 열게 된다. [검증 필요]
- `OpenDartStatusCard`의 build/refresh action, `autoBuildDisabledReason`, `buildNotice`/`buildError`는 helper wording과 action semantics가 강하게 묶여 있어, broad rewrite로 가면 env/operator disclosure contract까지 흔들 수 있다. [검증 필요]
