# 2026-03-25 n5-settings-data-sources-opendartstatuscard-loading-error-empty-state-helper-ownership-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-loading-error-empty-state-helper-ownership-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: copy/helper 단일 표면 스파이크로 분류해 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행했다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: `지금 읽는 기준` 안의 loading/error/empty fallback을 user-facing read-through basis 보조 상태로만 다루고, fetch/status contract나 disclosure/build semantics를 다시 열지 않았다.
- `work-log-closeout`: 이번 copy/helper polish spike의 실제 landed 범위, 실행 검증, 미실행 검증, 잔여 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- candidate memo audit에서 `상태를 불러오는 중...`, fetch error, `정보 없음`이 같은 slot 안에 있어도 서로 다른 helper ownership으로 읽혀야 한다고 정리했기 때문에, 이번 라운드에서는 wording만 최소 범위로 맞출 필요가 있었다.
- 이번 작업은 fetch/status contract 재설계가 아니라, `지금 읽는 기준` 영역 안에서 transitional helper, failure fallback, empty placeholder가 더 또렷하게 읽히도록 하는 single-surface polish spike다.

## 핵심 변경
- loading 문구를 `지금 읽는 기준을 확인하는 중입니다...`와 보조 helper로 정리해 transitional helper로 읽히게 했다.
- fetch error 문구를 `지금 읽는 기준을 아직 불러오지 못했습니다.`와 짧은 helper로 정리해 failure fallback으로 읽히게 했다.
- empty 문구를 `지금 읽는 기준 정보가 아직 없습니다.`와 helper로 정리해 오류가 아니라 empty placeholder로 읽히게 했다.
- 세 상태 모두 `사용자에게 먼저 보이는 기준` 아래 `지금 읽는 기준` slot 안에 남겨 두고, missing-index warning, details disclosure, build/button semantics는 건드리지 않았다.
- 구현 범위가 current memo와 같아 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`, `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 실행: `pnpm build`
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-loading-error-empty-state-helper-ownership-copy-helper-polish-spike.md`
- 참고: `pnpm lint`는 이번 변경과 무관한 기존 `@typescript-eslint/no-unused-vars` 경고 30건만 보고했다.
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `status`가 null이고 `error`가 비어 있는 경로의 실제 의미는 그대로라서, empty placeholder의 copy가 모든 데이터 부재 상황을 충분히 설명하는지는 후속 확인이 필요하다. [검증 필요]
- fetch error와 empty placeholder가 같은 fallback slot을 공유하므로, 구조나 스타일 수준에서 더 강하게 분리하려 들면 copy/helper 범위를 넘어 UI 구조 수정으로 커질 수 있다. [검증 필요]
- left read-through fallback, missing-index warning, right disclosure, bottom build result helper를 한꺼번에 다시 열면 broad OpenDART card rewrite로 번질 위험이 있다. [검증 필요]
