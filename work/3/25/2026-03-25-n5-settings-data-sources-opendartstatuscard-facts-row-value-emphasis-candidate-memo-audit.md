# 2026-03-25 n5-settings-data-sources-opendartstatuscard-facts-row-value-emphasis-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-value-emphasis-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: facts row trio의 현재 value emphasis를 row별로 분리해 읽고, 없는 row-order/source-of-truth/`fetchStatus()`/status schema/build semantics 변경 계획을 만들지 않은 채 next helper 후보만 좁혔다.
- `work-log-closeout`: 이번 docs-only audit 라운드의 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- facts-row scan-hierarchy spike 이후 backlog 문서는 다음 후보를 `facts-row value-emphasis docs-first memo`로만 남겨 둔 상태였고, 현재 row values가 readiness / freshness / coverage를 실제로 얼마나 닫아 주는지는 아직 분리해 적지 못했다.
- 이번 라운드는 UI 구현이나 row 계약 재설계가 아니라, 현재 number prefix와 row values만으로 어떤 signal은 충분하고 어떤 signal은 helper 보강 여지가 있는지 docs-first로 좁히는 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 facts-row value-emphasis candidate memo를 추가해 `1. 인덱스 준비 상태` value는 primary readiness signal로 충분하고, `3. 반영된 회사 수` value는 coverage breadth support fact로 충분하다고 정리했다.
- 같은 문서에서 `2. 마지막 생성 시점` value는 freshness row라는 점은 읽히지만 raw timestamp 해석을 사용자에게 더 맡기는 편이라 trio 안에서 가장 약한 emphasis라고 적고, 필요 시 copy/helper 차원의 freshness meaning closure만 다음 후보로 좁혔다. [검증 필요]
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 짧게 sync해 current next `N5` cut이 broad rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row freshness-read helper docs-first memo라는 점을 남겼다.
- row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위로 명시했다. [검증 필요]
- `src/components/OpenDartStatusCard.tsx`, `docs/current-screens.md`, `src/app/settings/data-sources/page.tsx`는 기준 확인만 했고 수정하지 않았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-value-emphasis-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- freshness emphasis가 약하다는 판단은 현재 markup과 copy를 바탕으로 한 docs-first 추론이며, 실제 사용자 해석까지 검증한 것은 아니다. [검증 필요]
- freshness helper 후보를 fallback slot, missing-index helper, dev-only disclosure와 한 배치로 다시 열면 copy/helper 범위를 넘어 card IA 재조정으로 쉽게 커질 수 있다. [검증 필요]
- route 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 명령으로 다시 검증한 것은 아니다. [미실행]
