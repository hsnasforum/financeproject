# 2026-03-24 n5-settings-data-sources-opendartstatuscard-build-notice-disabled-reason-helper-ownership-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-build-notice-disabled-reason-helper-ownership-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: `OpenDartStatusCard`의 user-facing trust helper, dev-only build action, disabled-state helper, build action result helper가 섞이지 않도록 현재 코드와 문서 경계를 다시 좁혔다.
- `work-log-closeout`: 이번 candidate memo audit의 role map, 다음 좁은 컷 권고, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- recent-ping post-spike sync 이후 다음 smallest docs-first candidate로 남은 것은 `OpenDartStatusCard`의 `autoBuildDisabledReason`, `buildNotice`, `buildError`를 어떤 helper ownership으로 읽어야 하는지 더 분명히 하는 일이었다.
- 이번 라운드는 구현 spike가 아니라, user-facing current-state helper와 dev-only build action/disclosure 사이에서 disabled-state helper와 action-result helper를 어디에 둘지 문서로 먼저 잠가 broad OpenDART card rewrite로 번지지 않도록 하기 위한 candidate audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `OpenDartStatusCard` role map을 추가해 `사용자에게 먼저 보이는 기준`과 `지금 읽는 기준`은 user-facing trust/read-through helper, 우측 관리 영역과 build/refresh action은 dev-only action boundary라고 고정했다.
- 같은 메모에서 `autoBuildDisabledReason`은 dev-only disabled-state helper, `buildNotice`/`buildError`는 current-state 결과가 아니라 build action result helper라고 정리했다.
- next smallest candidate를 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` build-notice/disabled-reason helper ownership copy/helper spike로 좁혔다.
- `status.buildEndpoint`, `canAutoBuild`, build POST success/failure 처리, `raw.message`, `status.message`, `primaryPath`, env/operator disclosure contract, status schema, route/href, stable/public IA는 비범위로 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 같은 판단을 짧게 sync해 current next `N5` cut이 narrow OpenDART helper spike라는 점만 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-build-notice-disabled-reason-helper-ownership-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `buildNotice`/`buildError`는 현재 card 하단에 렌더링되지만 실제 생성 조건은 dev-only build action에 종속돼 있어, 구현 단계에서 helper wording을 넘어서 위치나 의미를 다시 정의하면 current-state helper와 action-result helper 경계를 다시 열 수 있다. [검증 필요]
- `autoBuildDisabledReason`은 build button disabled semantics와 붙어 있으므로, button 조건이나 operator workflow를 건드리지 않고 문구만 좁게 다루는지 구현 단계에서 다시 확인해야 한다. [검증 필요]
- `status.message`, `primaryPath`, `개발용 인덱스 정보만 보기`까지 함께 다시 열면 env/operator disclosure contract 재설계로 범위가 커질 수 있다. [검증 필요]
