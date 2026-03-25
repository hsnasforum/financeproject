# 2026-03-23 N3 QA gate stable-beta-dev boundary audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n3-qa-gate-stable-beta-dev-boundary-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`를 route class SSOT로 읽고 `Public Stable`, `Public Beta`, `Local-only Ops`, `Dev/Debug` 분류를 N3 gate boundary 메모와 대조하는 데 사용했다.
- `work-log-closeout`: 이번 N3 docs-first audit의 문서 보정 범위, 실제 실행 검증, 남은 리스크를 저장소 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- N3 backlog는 stable/beta/ops-dev를 같은 검증 세트로 보지 않는다는 목표만 있었고, class별 최소 gate 후보와 release gate vs regression gate 분리 기준은 아직 충분히 구체화되지 않았다.
- 이번 라운드는 gate 스크립트 구현이나 route 정책 변경이 아니라, existing route SSOT와 existing package scripts 위에서 class map과 최소 gate 원칙만 docs-first로 고정하는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/11...` N3 연결 메모에 `docs/current-screens.md`의 `Public Stable`, `Public Beta`, `Local-only Ops`, `Dev/Debug` 분류를 current route-class SSOT로 두고, gate boundary에서는 뒤의 두 class를 non-public `ops/dev`로 묶어 다루는 기준을 추가했다.
- 같은 메모에 class별 최소 gate 후보를 남겨, `public stable`은 `build + test` 기반에 stable flow면 `e2e:rc`, route SSOT 변경이면 `planning:current-screens:guard`를 붙이고, `public beta`와 `ops/dev`는 blanket stable release gate 대신 touched-surface 중심 gate로 분리한다고 적었다.
- release gate는 current `Public Stable` surface 보호에, regression gate는 beta/ops-dev targeted verification에 묶는 분리 원칙을 추가했고, current `e2e:rc`가 stable/public bias를 가진다는 점도 함께 남겼다.
- smallest safe next cut은 broad gate implementation이 아니라 `analysis_docs/v2/14...`에 class별 최소 gate matrix와 release/regression 분리 원칙을 docs-first로 채우는 일이라고 정리했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n3-qa-gate-stable-beta-dev-boundary-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- `public beta`와 `ops/dev`의 최소 gate 후보는 existing route SSOT와 package scripts를 기준으로 한 docs-first recommendation이며, 실제 release blocker 범위는 후속 `analysis_docs/v2/14...`에서 더 구체화가 필요하다. [검증 필요]
- current `e2e:rc` 구성은 stable/public surface 중심이므로, beta/ops-dev flow용 targeted regression set은 아직 별도 정의되지 않았다.
- 이번 audit은 gate 원칙만 정리한 것이므로, CI 구현, route policy enforcement, production exposure 정책 변경 안전성을 바로 보장하지는 않는다.
