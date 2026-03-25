# 2026-03-25 n5-settings-data-sources-opendartstatuscard-facts-row-scan-hierarchy-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-scan-hierarchy-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: DART data-source settings UI text 변경으로 분류해 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract 변경이 없고 route 문서 sync도 불필요함을 확인했다.
- `dart-data-source-hardening`: facts row trio를 user-facing current basis facts layer로 유지한 채, row 순서나 source-of-truth를 바꾸지 않고 readiness → freshness → coverage scan order가 더 직접적으로 읽히도록 wording만 좁게 조정했다.
- `work-log-closeout`: 이번 spike의 실제 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- 이전 candidate memo audit에서 `인덱스 준비 상태`, `마지막 생성 시점`, `반영된 회사 수` 3개 row는 readiness → freshness → coverage 순서로 읽히는 current basis facts layer라고 정리됐지만, 실제 컴포넌트 wording에는 그 scan hierarchy가 아직 직접 드러나지 않았다.
- 이번 라운드는 row 순서나 데이터 계약을 건드리지 않고, `OpenDartStatusCard` facts trio 주변 copy/helper만 가장 작게 다듬어 사용자가 읽는 순서를 더 쉽게 따라가게 만드는 single-surface spike다.

## 핵심 변경
- `src/components/OpenDartStatusCard.tsx`의 facts trio intro sentence를 `아래 세 항목은 순서대로 준비 여부, 마지막 생성 시점, 반영 범위를 읽는 현재 기준입니다.`로 조정해 readiness → freshness → coverage scan order를 직접 드러냈다.
- 같은 block의 row labels를 `1. 인덱스 준비 상태`, `2. 마지막 생성 시점`, `3. 반영된 회사 수`로 조정해 실제 row 순서를 바꾸지 않고도 읽는 위계를 더 쉽게 따라가게 했다.
- `configured` boolean semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, source-of-truth, show/hide 조건, date/count formatting rule, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract는 바꾸지 않았다.
- 현재 landed 범위가 기존 candidate memo와 어긋나지 않아 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`와 `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 이번 라운드에서 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 결과: pass. 이번 변경과 무관한 기존 warning 30건만 남았고 새 lint error는 발생하지 않았다.
- 실행: `pnpm build`
- 결과: pass.
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-scan-hierarchy-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 round는 intro helper와 row label tone만 조정했으므로, readiness → freshness → coverage scan order가 실제 사용자 체감상 충분히 또렷한지는 e2e 수준에서 다시 확인하지 않았다. [미실행]
- route/href 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 명령으로 다시 검증한 것은 아니다. [미실행]
- facts row trio를 fallback slot, missing-index helper, dev-only disclosure와 한 배치로 다시 열기 시작하면 copy/helper 범위를 넘어 card IA 재조정으로 번질 수 있다. [검증 필요]
