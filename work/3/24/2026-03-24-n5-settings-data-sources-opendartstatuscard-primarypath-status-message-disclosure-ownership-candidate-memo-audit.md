# 2026-03-24 n5-settings-data-sources-opendartstatuscard-primarypath-status-message-disclosure-ownership-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-primarypath-status-message-disclosure-ownership-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: `primaryPath`, `status.message`, `개발용 인덱스 정보만 보기`가 user-facing trust helper나 build action result helper와 섞이지 않도록 disclosure ownership 경계를 다시 좁혔다.
- `work-log-closeout`: 이번 candidate memo audit의 role map, 다음 좁은 컷 권고, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- build-notice/disabled-reason helper spike가 닫힌 뒤에도 `OpenDartStatusCard` 안의 `primaryPath`, `status.message`, `개발용 인덱스 정보만 보기` disclosure layer는 user-facing trust/read-through helper와 같은 카드 안에 붙어 있어 어떤 ownership으로 읽어야 하는지 더 좁힐 필요가 있었다.
- 이번 라운드는 구현 spike가 아니라, dev-only disclosure layer를 docs-first로 먼저 고정해 broad OpenDART card rewrite나 env/operator disclosure 재설계로 번지지 않도록 하기 위한 candidate audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `OpenDartStatusCard` disclosure role map을 추가해 `개발용 인덱스 정보만 보기` 전체는 build action result helper와 다른 dev-only disclosure layer, `primaryPath`는 dev-only index trace disclosure, `status.message`는 operator/dev disclosure memo라고 정리했다.
- 같은 메모에서 current smallest viable next candidate를 `/settings/data-sources` `OpenDartStatusCard` `primaryPath`/`status.message` disclosure ownership copy/helper spike로 좁혔다.
- `status.message` source semantics, `primaryPath` provenance, details open/closed interaction, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, status schema는 비범위로 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 같은 판단을 짧게 sync해 current next `N5` cut이 narrow disclosure ownership spike라는 점만 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-primarypath-status-message-disclosure-ownership-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `primaryPath`와 `status.message`는 현재 details disclosure에만 남아 있지만, source semantics나 provenance를 다시 정의하기 시작하면 copy/helper 범위를 넘어 env/operator disclosure contract로 번질 수 있다. [검증 필요]
- `개발용 인덱스 정보만 보기` disclosure layer는 build action result helper와 같은 카드 안에 있어, 구현 단계에서 둘을 같은 층위로 합치면 action-result helper와 disclosure ownership 경계가 다시 흐려질 수 있다. [검증 필요]
- `status.message`를 user-facing warning으로 다시 승격하거나 `primaryPath`를 항상 보이는 상태 정보처럼 끌어올리면 trust/read-through helper와 dev-only disclosure boundary를 동시에 흔든다. [검증 필요]
