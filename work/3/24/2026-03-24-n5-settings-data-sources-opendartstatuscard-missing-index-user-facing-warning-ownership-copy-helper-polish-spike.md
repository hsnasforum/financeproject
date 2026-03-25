# 2026-03-24 n5-settings-data-sources-opendartstatuscard-missing-index-user-facing-warning-ownership-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-missing-index-user-facing-warning-ownership-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: user-facing warning wording만 바꾼 single-surface spike에 맞춰 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행하는 최소 검증 세트를 유지했다.
- `route-ssot-check`: `docs/current-screens.md`와 `/settings/data-sources` page를 다시 대조해 route/href contract 변경이 없는 component wording spike임을 확인했다.
- `dart-data-source-hardening`: missing-index amber warning block이 raw 운영 메모처럼 읽히지 않도록, user-facing secondary helper tone만 좁게 조정했다.
- `work-log-closeout`: 실제 변경 범위, 실행 검증, 남은 리스크를 이번 spike closeout 형식으로 정리했다.

## 변경 이유
- candidate memo audit에서 좌측 amber warning block은 raw current-state warning이 아니라, 위 `사용자에게 먼저 보이는 기준`과 `지금 읽는 기준`을 읽은 뒤에 제한 상태를 다시 짚는 user-facing secondary helper로 읽혀야 한다고 좁혔다.
- 이번 라운드는 raw `status.message` 승격이나 build/button/disclosure contract 재설계가 아니라, 같은 card 안의 읽는 순서를 문구 수준에서 더 또렷하게 만드는 single-surface copy/helper spike다.

## 핵심 변경
- 좌측 amber warning block에 짧은 label을 추가해 이 구간이 missing-index 제한 상태를 한 번 더 확인하는 사용자 안내라는 점을 먼저 보이게 했다.
- warning 본문을 `위 기준에서 본 것처럼`으로 시작하게 바꿔, 현재 상태 facts를 새로 추가하는 경고가 아니라 위 summary/read-through를 보조하는 안내로 읽히게 만들었다.
- 짧은 helper 한 줄을 추가해 이 block이 새로운 운영 경고가 아니라 위 요약과 읽는 기준을 다시 짚는 user-facing secondary helper라는 점을 명시했다.
- raw `status.message`는 계속 details 내부 `개발용 운영 메모`에만 남겼고, warning show/hide 조건, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, details disclosure 구조, route/href는 바꾸지 않았다.
- current candidate memo와 landed 범위가 같아서 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`, `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 결과: 에러 없이 통과. 현재 브랜치 전반에 이미 있던 `@typescript-eslint/no-unused-vars` 경고 30건은 그대로 남았다.
- 실행: `pnpm build`
- 결과: 성공.
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-missing-index-user-facing-warning-ownership-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- amber warning block은 wording으로만 secondary helper 성격을 더 분명히 했고 show/hide 조건은 그대로라, 이후 라운드에서 노출 기준을 다시 열면 warning ownership 문제를 다시 검토해야 한다. [검증 필요]
- raw `status.message`는 계속 details 내부 운영 메모로만 남아 있으므로, 이를 좌측 warning과 연결하기 시작하면 copy/helper 범위를 넘어 source semantics 재설계로 커질 수 있다. [검증 필요]
- 좌측 warning, 상단 summary/read-through, details disclosure, build action/result helper를 한 번에 다시 만지면 user-facing trust helper와 env/operator disclosure contract를 동시에 흔드는 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]
