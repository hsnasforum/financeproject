# 2026-03-24 n5-settings-data-sources-opendartstatuscard-build-notice-disabled-reason-helper-ownership-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-build-notice-disabled-reason-helper-ownership-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: component copy/helper spike에 맞춰 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`를 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `/settings/data-sources` page를 다시 대조해 route/href contract 변경이 없는 좁은 component wording spike임을 확인했다.
- `dart-data-source-hardening`: `OpenDartStatusCard`의 user-facing trust helper와 dev-only build action result/disabled-state helper가 섞이지 않도록 wording만 좁게 조정했다.
- `work-log-closeout`: 실제 변경 범위, 실행 검증, 남은 리스크를 이번 spike closeout 형식으로 정리했다.

## 변경 이유
- candidate memo audit에서 `autoBuildDisabledReason`은 dev-only disabled-state helper, `buildNotice`/`buildError`는 build action result helper로 읽히게 만들어야 한다고 좁혔지만, 현재 컴포넌트에서는 그 구분이 문구로 충분히 드러나지 않았다.
- 이번 라운드는 build endpoint나 button semantics를 다시 설계하는 작업이 아니라, `OpenDartStatusCard` 한 surface 안에서 user-facing current-state helper와 dev-only action helper의 읽는 순서를 더 또렷하게 만드는 single-surface copy/helper spike다.

## 핵심 변경
- 개발용 관리 introduction을 조정해 비활성 이유와 실행 결과가 사용자용 현재 상태가 아니라 개발용 점검 안내라는 점을 명시했다.
- build/refresh button 위 helper를 보강해 비활성 안내와 실행 결과를 점검 액션에 딸린 보조 메모로 읽게 만들었다.
- `autoBuildDisabledReason` 문구를 개발용 버튼 기준의 비활성 이유로만 읽히게 좁혔다.
- card 하단 `buildNotice`/`buildError` 영역에 `개발용 인덱스 점검 결과` label과 짧은 helper를 추가해, 현재 상태가 아니라 방금 실행한 점검 결과임을 더 분명히 했다.
- build endpoint, button semantics, `canAutoBuild`/disabled 조건, `primaryPath`/`message` disclosure 구조, status schema, route/href는 바꾸지 않았다.
- current candidate memo와 landed 범위가 같아서 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`, `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 결과: 에러 없이 통과. 현재 브랜치 전반에 이미 있던 `@typescript-eslint/no-unused-vars` 경고 30건은 그대로 남았다.
- 실행: `pnpm build`
- 결과: 성공.
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-build-notice-disabled-reason-helper-ownership-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `buildNotice`/`buildError`는 wording으로 action result helper임을 더 분명히 했어도 card 하단에 남아 있으므로, 이후 라운드에서 위치나 의미를 다시 정의하면 current-state helper와 action-result helper 경계를 다시 열 수 있다. [검증 필요]
- `autoBuildDisabledReason`은 여전히 build button disabled semantics와 직접 묶여 있어, 다음 라운드에서 button 조건이나 operator workflow를 건드리면 helper wording만의 문제로 남지 않는다. [검증 필요]
- `primaryPath`, `status.message`, `개발용 인덱스 정보만 보기`까지 함께 열기 시작하면 env/operator disclosure contract 재설계로 범위가 커질 수 있다. [검증 필요]
