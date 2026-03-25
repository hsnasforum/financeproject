# 2026-03-24 n5-settings-data-sources-status-cards-dev-action-disclosure-boundary-post-spike-doc-sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-status-cards-dev-action-disclosure-boundary-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only post-spike sync 라운드에 맞춰 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `/settings/data-sources` route/page를 다시 대조해 route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: status-cards landed wording이 ping/build semantics나 status schema 변경으로 과장되지 않도록 actual scope와 unchanged boundary를 분리해서 정리했다.
- `work-log-closeout`: post-spike landed scope, unchanged boundary, 다음 docs-first candidate를 `/work` closeout 형식으로 남겼다.

## 변경 이유
- 방금 landing한 `DataSourceStatusCard`·`OpenDartStatusCard` dev-action/disclosure boundary copy/helper polish를 backlog 문서 기준으로 정확히 동기화해야 했다.
- 이번 라운드는 코드 재수정이 아니라, status-cards spike가 이미 닫혔다는 상태와 다음 smallest cut recommendation만 docs-only로 정리하는 sync 작업이다.

## 핵심 변경
- backlog에 status-cards post-spike sync memo를 추가해 실제 landed 범위를 `DataSourceStatusCard` header helper, `최근 연결 확인 참고`와 보조 helper, `개발용 연결 조건과 내부 메모만 보기`, footer ping helper, `OpenDartStatusCard` header helper, `필요할 때만 여는 개발용 관리` 영역 helper, build action helper, `개발용 인덱스 정보만 보기` disclosure helper 조정으로 고정했다.
- 같은 메모에서 ping/build button 동작, endpoint, local storage snapshot ownership, env key/endpoint/message disclosure 구조, status schema, route/href contract, card 구조 재배치가 바뀌지 않았음을 명시했다.
- current next question이 더 이상 status-card wording 구현 여부가 아니라, 그 다음 diagnostics-adjacent smallest cut을 무엇으로 둘지라는 점을 반영했다.
- next smallest candidate는 broad data-sources rewrite가 아니라 `/settings/data-sources` `DataSourceStatusCard` recent-ping support-helper ownership docs-first memo로만 좁혔다. [검증 필요]

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-status-cards-dev-action-disclosure-boundary-post-spike-doc-sync.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `DataSourceStatusCard`의 recent ping snapshot은 wording으로 support helper임을 분명히 했어도 local storage 기반 ownership 자체는 그대로라, visibility나 ownership을 바꾸면 ping snapshot semantics와 저장 contract를 다시 열 수 있다. [검증 필요]
- `OpenDartStatusCard`의 build/refresh action, disabled reason, build notice/error는 helper tone만 정리된 상태라, 다음 라운드에서 broad rewrite로 가면 ping/build semantics와 env/operator disclosure contract를 다시 흔들 수 있다. [검증 필요]
