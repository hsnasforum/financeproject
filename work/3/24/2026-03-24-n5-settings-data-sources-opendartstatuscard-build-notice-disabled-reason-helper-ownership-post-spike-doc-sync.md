# 2026-03-24 n5-settings-data-sources-opendartstatuscard-build-notice-disabled-reason-helper-ownership-post-spike-doc-sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-build-notice-disabled-reason-helper-ownership-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only post-spike sync 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: actual landed helper wording과 build/button/disclosure contract unchanged boundary를 분리해, OpenDART semantics를 과장하지 않도록 문서를 sync했다.
- `work-log-closeout`: 이번 docs-only sync 라운드의 변경 범위, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- 방금 landing한 `OpenDartStatusCard` build-notice/disabled-reason helper ownership copy/helper polish는 코드에는 반영됐지만, backlog 문서는 아직 candidate memo처럼 읽히는 상태였다.
- 이번 라운드는 코드 재수정이 아니라, actual landed scope와 unchanged boundary를 문서 기준으로 닫고 current next question을 다음 smallest docs-first cut selection으로 옮기는 sync 작업이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`의 `OpenDartStatusCard` 섹션을 candidate memo에서 post-spike sync memo로 바꾸고, actual landed scope를 dev-only 관리 영역 introduction/helper, build/refresh action 위 helper, `autoBuildDisabledReason` helper tone, 하단 `buildNotice`/`buildError` 영역 label/helper 조정으로 고정했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 상태를 짧게 sync해 이 spike가 이미 닫혔음을 반영했다.
- 두 문서 모두 build endpoint, button semantics, `canAutoBuild`/disabled 조건, `primaryPath`/`status.message` disclosure 구조, status schema, route/href contract, card 구조 재배치가 바뀌지 않았음을 명시했다.
- current next question을 “OpenDART helper wording을 구현할 것인가”가 아니라 “그 다음 smallest docs-first cut을 무엇으로 둘 것인가”로 바꿨다.
- broad OpenDART/data-sources rewrite 대신 docs-first candidate memo 수준만 다음 컷으로 허용했고, 현재 좁은 후보는 `OpenDartStatusCard` `primaryPath`/`status.message` disclosure ownership memo로만 남겼다. [검증 필요]

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-build-notice-disabled-reason-helper-ownership-post-spike-doc-sync.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- next smallest candidate 이름은 current code와 work note의 residual risk를 기준으로 한 docs-first 권고라서, 실제 구현 전에는 한 번 더 좁은 candidate audit로 확인해야 한다. [검증 필요]
- `buildNotice`/`buildError`는 wording으로 action-result helper임을 더 분명히 했어도 card 하단에 남아 있으므로, 위치나 의미를 다시 정의하면 current-state helper와 action-result helper 경계를 다시 열 수 있다. [검증 필요]
- `autoBuildDisabledReason`은 build button disabled semantics와 직접 묶여 있어, 다음 라운드에서 button 조건이나 operator workflow를 건드리면 helper wording만의 문제로 남지 않는다. [검증 필요]
- `primaryPath`, `status.message`, `개발용 인덱스 정보만 보기`를 함께 열면 env/operator disclosure contract 재설계로 범위가 커질 수 있다. [검증 필요]
