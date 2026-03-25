# 2026-03-24 n5-settings-data-sources-opendartstatuscard-loading-error-empty-state-helper-ownership-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-loading-error-empty-state-helper-ownership-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: `지금 읽는 기준` 안의 loading/error/empty fallback이 missing-index helper나 dev-only disclosure와 섞이지 않도록 ownership 경계를 docs-first로 다시 좁혔다.
- `work-log-closeout`: 이번 candidate memo audit의 role map, 다음 좁은 컷 권고, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- missing-index warning spike가 닫힌 뒤에도 `OpenDartStatusCard` 안의 `상태를 불러오는 중...`, fetch error, `정보 없음`은 같은 `지금 읽는 기준` 영역 안에 있어 어떤 helper ownership으로 읽어야 하는지 더 좁힐 필요가 있었다.
- 이번 라운드는 구현 spike가 아니라, 이 fallback slot이 read-through basis의 일부인지 별도 상태 helper인지 먼저 정리해 broad OpenDART card rewrite나 fetch/status contract 재설계로 번지지 않도록 하기 위한 docs-first candidate audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 loading-error empty-state role map을 추가해 `사용자에게 먼저 보이는 기준`은 primary summary, `지금 읽는 기준`은 read-through basis, `loading`/fetch error/`정보 없음`은 그 안의 fallback slot이라고 정리했다.
- 같은 메모에서 `상태를 불러오는 중...`은 transitional helper, fetch error는 failure fallback, `정보 없음`은 empty placeholder로 읽는 편이 맞다고 정리했다.
- current smallest viable next candidate를 `/settings/data-sources` `OpenDartStatusCard` loading-error empty-state helper ownership copy/helper spike로 좁혔다.
- `fetchStatus()` response contract, 409/null handling, `status` null + empty error 경로의 semantics, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, details disclosure 구조, status schema, route/href contract는 비범위로 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 같은 판단을 짧게 sync해 current next `N5` cut이 narrow loading-error empty-state helper ownership spike라는 점만 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-opendartstatuscard-loading-error-empty-state-helper-ownership-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `status`가 null이면서 `error`가 비어 있는 경로의 실제 의미를 다시 정의하기 시작하면 copy/helper 범위를 넘어 fetch/status contract 재설계로 바로 커질 수 있다. [검증 필요]
- fetch error와 `정보 없음`이 현재 같은 red fallback slot을 쓰므로, 둘을 구조나 스타일 수준에서 분리하려 들면 UI 구조 변경으로 번질 수 있다. [검증 필요]
- left summary/read-through/fallback slot, missing-index helper, right dev-only disclosure, bottom build result helper를 한 배치로 다시 열면 user-facing trust helper와 fetch/disclosure contract를 동시에 흔드는 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]
