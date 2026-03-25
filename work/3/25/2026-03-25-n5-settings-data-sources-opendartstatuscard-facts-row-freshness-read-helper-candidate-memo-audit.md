# 2026-03-25 n5-settings-data-sources-opendartstatuscard-facts-row-freshness-read-helper-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-freshness-read-helper-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: `마지막 생성 시점` row의 freshness meaning을 user-facing current basis facts layer 안에서만 읽도록 좁히고, 없는 row-order/source-of-truth/`fetchStatus()`/status schema/build semantics 변경 계획을 만들지 않은 채 next helper 후보만 정리했다.
- `work-log-closeout`: 이번 docs-only audit 라운드의 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- 이전 value-emphasis audit에서 `2. 마지막 생성 시점` row가 trio 안에서 가장 약한 emphasis라는 점은 정리됐지만, raw timestamp를 그대로 둔 채 어떤 helper로 freshness meaning closure를 좁힐 수 있는지는 아직 분리해 적지 못했다.
- 이번 라운드는 UI 구현이나 formatting/logic 변경이 아니라, `마지막 생성 시점` row 하나만 놓고 user-facing current basis facts layer 안에서 helper가 어디까지 의미를 닫아야 하는지 docs-first로 좁히는 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 facts-row freshness-read helper candidate memo를 추가해 `2. 마지막 생성 시점` row를 trio 안의 freshness anchor로 고정하고, raw timestamp는 사실 노출로는 충분하지만 meaning closure는 helper 한 줄로만 보강할 여지가 있다고 정리했다. [검증 필요]
- 같은 문서에서 helper는 “이 시점이 현재 공시 검색/상세 화면의 마지막 생성 기준”이라는 뜻만 닫아야 하고, stale 판정, 상대 시간 계산, freshness threshold, warning tone으로 확장되면 안 된다고 명시했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 짧게 sync해 current next `N5` cut이 broad rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row freshness-read helper copy/helper spike라는 점을 남겼다.
- row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위로 명시했다. [검증 필요]
- `src/components/OpenDartStatusCard.tsx`, `docs/current-screens.md`, `src/app/settings/data-sources/page.tsx`는 기준 확인만 했고 수정하지 않았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-freshness-read-helper-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- freshness helper가 어디까지 meaning closure를 주는 것이 적절한지는 현재 markup과 copy를 바탕으로 한 docs-first 추론이며, 실제 사용자 이해도까지 검증한 것은 아니다. [검증 필요]
- freshness helper 후보를 fallback slot, missing-index helper, dev-only disclosure와 한 배치로 다시 열면 copy/helper 범위를 넘어 card IA 재조정으로 쉽게 커질 수 있다. [검증 필요]
- route 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 명령으로 다시 검증한 것은 아니다. [미실행]
