# 2026-03-25 n5-settings-data-sources-opendartstatuscard-facts-row-scan-hierarchy-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-scan-hierarchy-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate memo audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: `OpenDartStatusCard` facts row trio를 current basis facts layer로 고정한 채, 없는 `configured`/`userSummary()`/`fetchStatus()`/status schema/build semantics 변경 계획을 만들지 않고 scan hierarchy 후보만 좁혔다.
- `work-log-closeout`: 이번 docs-only audit 라운드의 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- read-through-basis-facts ownership spike 이후 backlog 문서는 `facts-row scan-hierarchy`를 다음 후보로만 남겨 둔 상태였고, 세 row를 사용자가 어떤 순서와 위계로 읽는지에 대한 role map이 아직 비어 있었다.
- 이번 라운드는 UI 구현이나 row 재배치가 아니라, `인덱스 준비 상태`, `마지막 생성 시점`, `반영된 회사 수`가 top summary, fallback slot, missing-index helper, dev-only disclosure와 어떻게 분리돼 읽혀야 하는지 docs-first로 좁히는 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 facts-row scan-hierarchy candidate memo를 추가해, 3개 facts row를 readiness → freshness → coverage 순서로 훑는 current basis facts layer로 정리했다.
- 같은 문서에서 loading/error/empty는 이 layer를 잠시 대신하는 fallback slot, missing-index helper는 trio 뒤의 secondary helper, dev-only disclosure와 build action/result helper는 별도 operator/dev layer라는 점을 분리해 적었다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 판단을 짧게 sync해 current next `N5` cut이 broad rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row scan-hierarchy copy/helper spike라는 점을 남겼다.
- row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 계속 비범위로 명시했다. [검증 필요]
- `src/components/OpenDartStatusCard.tsx`, `docs/current-screens.md`, `src/app/settings/data-sources/page.tsx`는 기준 확인만 했고 수정하지 않았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-scan-hierarchy-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- readiness → freshness → coverage 순서는 현재 markup과 copy를 바탕으로 한 docs-first 권고일 뿐이며, 실제 사용자 스캔 우선순위는 구현 spike 전 한 번 더 copy/helper 수준에서 좁히는 편이 안전하다. [검증 필요]
- facts row trio를 top summary, fallback slot, missing-index helper, dev-only disclosure와 한 배치로 다시 설계하면 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]
- route 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 명령으로 다시 검증한 것은 아니다. [미실행]
