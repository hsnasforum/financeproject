# 2026-03-24 n5-settings-data-sources-status-cards-dev-action-disclosure-boundary-copy-helper-polish-spike

## 변경 파일
- `src/components/DataSourceStatusCard.tsx`
- `src/components/OpenDartStatusCard.tsx`
- `work/3/24/2026-03-24-n5-settings-data-sources-status-cards-dev-action-disclosure-boundary-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: status card copy/helper spike에 맞춰 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행했다.
- `route-ssot-check`: `docs/current-screens.md`와 `/settings/data-sources` route/page를 다시 대조해 route/href 변경 없이 status card wording만 조정했는지 확인했다.
- `dart-data-source-hardening`: user-facing current-state helper, support validation helper, dev-only disclosure/action이 섞이지 않도록 wording을 보수적으로 정리하고, ping/build semantics와 status schema는 그대로 유지했다.
- `work-log-closeout`: 이번 single-surface spike의 변경점, 실제 검증 결과, 남은 리스크를 `/work` 형식으로 남겼다.

## 변경 이유
- `DataSourceStatusCard`와 `OpenDartStatusCard` 안에서는 user-facing helper, 최근 ping/build 상태, dev-only disclosure/action이 한 카드 안에 같이 있어 경계가 얇게 읽힐 여지가 있었다.
- 이번 라운드는 ping/build semantics나 status schema를 건드리지 않고, helper와 disclosure/action의 읽는 순서만 문구 수준에서 더 또렷하게 만드는 narrow spike다.

## 핵심 변경
- `DataSourceStatusCard` header helper를 `사용자 영향 → 현재 읽는 기준 → 최근 연결 확인 → 개발용 조건/점검` 순서로 다시 정리했다.
- `최근 연결 확인`을 `최근 연결 확인 참고`로 조정하고, 현재 읽는 기준을 보조하는 최근 점검 기록이라는 짧은 helper를 추가했다.
- `개발용 연결 조건과 메모 보기`를 `개발용 연결 조건과 내부 메모만 보기`로 좁히고, disclosure 내부와 footer ping button 위에 개발 환경 전용 안내 문구를 추가했다.
- `OpenDartStatusCard` header helper, 우측 개발용 관리 title/paragraph, build action helper, `개발용 인덱스 정보만 보기` disclosure helper를 조정해 user summary/read-through와 dev-only action/disclosure 경계를 더 분명히 했다.
- button 동작, ping/build endpoint, local storage snapshot ownership, env key/endpoint/message disclosure 구조, card 구조 재배치, route/href는 건드리지 않았다.
- landed 범위가 current memo와 같아서 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`, `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 실행: `pnpm build`
- 실행: `git diff --check -- src/components/DataSourceStatusCard.tsx src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-status-cards-dev-action-disclosure-boundary-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `DataSourceStatusCard`의 `최근 연결 확인`은 wording으로 support helper임을 더 분명히 했지만, local storage 기반 snapshot ownership 자체는 그대로라 visibility/ownership 변경은 여전히 ping snapshot semantics를 다시 연다.
- `OpenDartStatusCard`의 build/refresh action, disabled reason, build notice/error는 helper tone만 정리된 상태라, 다음 라운드에서 broad rewrite로 가면 ping/build semantics와 env/operator disclosure contract를 다시 흔들 수 있다.
