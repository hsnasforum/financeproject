# 2026-03-25 n5-settings-data-sources-opendartstatuscard-facts-row-coverage-read-helper-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-coverage-read-helper-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `OpenDartStatusCard` 사용자 문구 수정과 data-source settings 화면 build 영향으로 `pnpm lint`, `pnpm build`, 지정 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract 변경이 없음을 확인했다.
- `dart-data-source-hardening`: `반영된 회사 수` row를 user-facing current basis facts layer 안의 coverage breadth fact로 유지한 채, raw count 의미를 닫는 helper 한 줄만 추가하고 completeness/total-market/staleness semantics는 열지 않았다.
- `work-log-closeout`: 이번 spike 라운드의 실제 변경 파일, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 candidate memo audit에서는 `3. 반영된 회사 수` raw count가 규모감은 주지만, 현재 공시 검색과 상세 화면에 반영된 회사 범위를 뜻한다는 meaning closure는 아직 사용자에게 더 맡기는 상태라고 정리했다.
- 이번 라운드는 count semantics나 completeness 판단을 새로 만드는 것이 아니라, facts trio 안의 coverage breadth fact 주변에 helper 한 줄만 추가해 그 의미를 더 또렷하게 읽히게 하는 최소 구현이다.

## 핵심 변경
- `src/components/OpenDartStatusCard.tsx`에서 `3. 반영된 회사 수` row를 label/value 줄과 helper 한 줄로 감싸, row 아래에 `위 수는 현재 공시 검색과 상세 화면에 반영된 회사 범위를 읽는 기준입니다.` 문구를 추가했다.
- 이 변경으로 raw count가 total market 규모, completeness, 누락 경고가 아니라 현재 공시 검색/상세 화면의 반영 범위를 읽는 기준이라는 뜻만 닫도록 좁혔다.
- facts trio intro, `1. 인덱스 준비 상태`, `2. 마지막 생성 시점` 및 freshness helper wording은 그대로 유지했다.
- row 순서 변경, source-of-truth 변경, show/hide 조건 변경, count formatting rule 변경, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract 변경은 하지 않았다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`, `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`, `docs/current-screens.md`, `src/app/settings/data-sources/page.tsx`는 기준 확인만 했고 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 실행: `pnpm build`
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-coverage-read-helper-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- 새 helper 문구는 coverage meaning closure를 좁게 닫는 copy 개선이며, 실제 사용자 이해도까지 검증한 것은 아니다. [검증 필요]
- 다음 라운드에서 coverage helper를 freshness/fallback/missing-index/dev-only disclosure와 함께 다시 열면 copy/helper 범위를 넘어 card IA 재조정으로 쉽게 커질 수 있다. [검증 필요]
- route 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 명령으로 다시 검증한 것은 아니다. [미실행]
