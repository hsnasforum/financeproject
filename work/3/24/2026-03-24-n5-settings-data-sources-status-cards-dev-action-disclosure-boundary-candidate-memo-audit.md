# 2026-03-24 n5-settings-data-sources-status-cards-dev-action-disclosure-boundary-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-status-cards-dev-action-disclosure-boundary-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드에 맞춰 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `/settings/data-sources` 관련 route/page를 대조해 route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: `DataSourceStatusCard`와 `OpenDartStatusCard`에서 user-facing current-state helper, recent ping/build status, dev-only disclosure/action이 섞이지 않도록 boundary를 다시 점검하고, ping/build semantics와 status schema는 비범위로 고정했다.
- `work-log-closeout`: status-cards role map, defer 목록, 다음 narrow cut 권고를 `/work` 형식으로 남겼다.

## 변경 이유
- `DataSourceHealthTable` narrow spike까지 닫힌 뒤에도 `DataSourceStatusCard`와 `OpenDartStatusCard` 안의 user-facing helper와 dev-only disclosure/action 경계가 다음 diagnostics-adjacent smallest cut으로 남아 있었다.
- 이번 라운드는 구현이 아니라 두 카드의 current-state helper, support validation helper, dev-only disclosure, dev-only action을 docs-first로 먼저 고정해 broad card rewrite로 번지지 않도록 하기 위한 candidate audit이다.

## 핵심 변경
- backlog에 status-cards dev-action/disclosure boundary memo를 추가해 `DataSourceStatusCard`의 `사용자에게 보이는 영향`/`현재 읽는 기준`/`최근 연결 확인`/`개발용 연결 조건과 메모 보기`/ping button과 `OpenDartStatusCard`의 user summary/read-through vs dev build/disclosure 영역을 층위별로 정리했다.
- `최근 연결 확인`은 dev-only disclosure가 아니라 current-state helper를 보조하는 support validation helper라는 점과, `개발용 연결 조건과 메모 보기`, `개발용 인덱스 정보 보기`, build/refresh action은 dev boundary라는 점을 문서에 고정했다.
- next smallest candidate를 broad status-card rewrite가 아니라 `/settings/data-sources` status-cards dev-action/disclosure boundary copy/helper spike로 좁혔다.
- ping/build action behavior, local storage snapshot ownership, env key/endpoint/message disclosure contract, status schema 변경은 비범위로 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-status-cards-dev-action-disclosure-boundary-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `DataSourceStatusCard`의 `최근 연결 확인`은 local storage 기반 snapshot이라, wording을 넘어 visibility나 ownership을 바꾸면 ping snapshot semantics와 저장 contract를 다시 열 수 있다. [검증 필요]
- `OpenDartStatusCard`의 build endpoint, `canAutoBuild`, disabled reason, build notice/error는 action semantics와 operator workflow에 직접 걸려 있어, broad rewrite로 들어가면 env/operator disclosure contract까지 흔들릴 수 있다. [검증 필요]
