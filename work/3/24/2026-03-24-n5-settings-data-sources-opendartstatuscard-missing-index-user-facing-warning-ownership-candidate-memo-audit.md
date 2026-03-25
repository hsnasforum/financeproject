# 2026-03-24 n5-settings-data-sources-opendartstatuscard-missing-index-user-facing-warning-ownership-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-missing-index-user-facing-warning-ownership-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: missing-index amber warning block이 user-facing trust helper인지 dev-only disclosure인지 혼선이 없도록 ownership 경계를 docs-first로 다시 좁혔다.
- `work-log-closeout`: 이번 candidate memo audit의 role map, 다음 좁은 컷 권고, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- `OpenDartStatusCard`의 `primaryPath`/`status.message` disclosure polish가 닫힌 뒤에도, 좌측 amber warning block은 user-facing current-state warning인지 summary/read-through helper를 보조하는 secondary helper인지 더 좁힐 필요가 있었다.
- 이번 라운드는 구현 spike가 아니라, raw `status.message`를 user-facing으로 승격하지 않고도 missing-index warning ownership을 copy/helper 차원에서 다룰 수 있는지 먼저 정리하는 docs-first candidate audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 missing-index warning role map을 추가해 `사용자에게 먼저 보이는 기준`은 primary summary, `지금 읽는 기준`은 read-through basis, 좌측 amber warning block은 그 뒤에 붙는 user-facing secondary helper라고 정리했다.
- 같은 메모에서 raw `status.message`는 계속 details 내부 `개발용 운영 메모`에만 남겨야 하며, amber warning block을 operator/dev disclosure나 raw current-state warning으로 재해석하면 안 된다고 고정했다.
- current smallest viable next candidate를 `/settings/data-sources` `OpenDartStatusCard` missing-index user-facing warning ownership copy/helper spike로 좁혔다.
- `status.message` source semantics, `primaryPath` provenance, amber warning show/hide 조건, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, status schema, route/href contract는 비범위로 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 같은 판단을 짧게 sync해 current next `N5` cut이 narrow missing-index warning ownership spike라는 점만 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-missing-index-user-facing-warning-ownership-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- amber warning block은 현재 generic 사용자 안내만 노출하고 있으므로, 이를 raw `status.message`와 연결하려 들면 warning ownership 정리가 아니라 source semantics 재설계로 바로 커질 수 있다. [검증 필요]
- 좌측 warning block을 user summary나 `지금 읽는 기준` 표와 합치면 helper wording 조정이 아니라 trust/read-through 구조 재배치 문제가 된다. [검증 필요]
- details disclosure, build action/result helper, missing-index warning을 한 배치로 다시 열면 user-facing trust helper와 env/operator disclosure contract를 동시에 흔드는 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]
