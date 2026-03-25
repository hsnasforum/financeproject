# 2026-03-24 n5-settings-data-sources-opendartstatuscard-primarypath-status-message-disclosure-ownership-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-primarypath-status-message-disclosure-ownership-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: helper wording만 바꾼 single-surface spike에 맞춰 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행하는 최소 검증 세트를 유지했다.
- `route-ssot-check`: `docs/current-screens.md`와 `/settings/data-sources` page를 다시 대조해 route/href contract 변경이 없는 component wording spike임을 확인했다.
- `dart-data-source-hardening`: `primaryPath`, `status.message`, details disclosure layer를 user-facing trust helper나 build result helper와 섞지 않도록 copy/helper만 좁게 조정했다.
- `work-log-closeout`: 실제 변경 범위, 실행 검증, 남은 리스크를 이번 spike closeout 형식으로 정리했다.

## 변경 이유
- candidate memo audit에서 `primaryPath`는 dev-only index trace disclosure, `status.message`는 operator/dev disclosure memo, `개발용 인덱스 정보만 보기` 전체는 build result helper와 다른 disclosure layer로 읽혀야 한다고 좁혔다.
- 이번 라운드는 build endpoint나 button semantics를 다시 설계하는 작업이 아니라, `OpenDartStatusCard` 한 surface 안에서 disclosure layer를 user-facing current-state helper와 하단 build result helper에서 더 또렷하게 분리하는 single-surface copy/helper spike다.

## 핵심 변경
- `개발용 인덱스 정보만 보기` summary 아래 helper를 조정해 이 구간이 사용자에게 먼저 보이는 기준도 카드 하단 점검 결과도 아닌 dev-only 인덱스 추적 메모라는 점을 명시했다.
- `인덱스 파일 경로` 주변 helper를 추가해 `primaryPath`를 사용자용 현재 상태가 아니라 개발 환경에서 읽은 인덱스 파일 trace로만 읽히게 만들었다.
- `status.message` box label을 `개발용 운영 메모`로 바꾸고 짧은 helper를 추가해, raw message를 user-facing warning이나 build action result가 아니라 운영 기준 disclosure memo로 읽게 만들었다.
- build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, `status.message` source semantics, `primaryPath` provenance, details open/closed interaction, status schema, route/href는 바꾸지 않았다.
- current candidate memo와 landed 범위가 같아서 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`, `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 결과: 에러 없이 통과. 현재 브랜치 전반에 이미 있던 `@typescript-eslint/no-unused-vars` 경고 30건은 그대로 남았다.
- 실행: `pnpm build`
- 결과: 성공.
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-primarypath-status-message-disclosure-ownership-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `status.message`의 실제 source semantics와 `primaryPath`의 provenance는 이번 spike에서도 정의를 바꾸지 않았으므로, 이후 라운드에서 wording을 넘는 disclosure policy 논의로 다시 커질 수 있다. [검증 필요]
- details disclosure는 helper wording만 조정했고 open/closed interaction과 위치는 그대로라, 다음 라운드에서 노출 방식 자체를 다시 열면 build result helper와의 경계를 다시 검토해야 한다. [검증 필요]
- 하단 `buildNotice`/`buildError`와 details disclosure를 함께 다시 만지기 시작하면 action-result helper와 operator disclosure layer를 동시에 흔드는 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]
