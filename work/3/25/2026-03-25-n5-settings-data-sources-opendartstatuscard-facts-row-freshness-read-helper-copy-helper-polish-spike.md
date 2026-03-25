# 2026-03-25 n5-settings-data-sources-opendartstatuscard-facts-row-freshness-read-helper-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-freshness-read-helper-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: DART data-source settings UI text 변경으로 분류해 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract 변경이 없고 route 문서 sync도 불필요함을 확인했다.
- `dart-data-source-hardening`: `2. 마지막 생성 시점` row를 freshness anchor로 유지한 채, stale 판정이나 상대 시간 계산 없이 raw timestamp가 현재 화면이 마지막으로 읽는 생성 기준이라는 뜻만 닫도록 helper 한 줄만 좁게 추가했다.
- `work-log-closeout`: 이번 spike의 실제 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- 이전 candidate memo audit에서는 `마지막 생성 시점` row가 freshness anchor이지만 raw timestamp만으로는 meaning closure가 완전히 닫히지 않는다고 정리됐고, 다음 smallest cut은 helper 한 줄로 그 뜻만 닫는 copy/helper spike로 좁혀져 있었다.
- 이번 라운드는 row 순서, formatting, stale logic, warning tone을 건드리지 않고, `OpenDartStatusCard` 안에서 raw timestamp가 현재 공시 검색과 상세 화면이 마지막으로 읽는 생성 기준이라는 점만 더 또렷하게 읽히게 만드는 single-surface spike다.

## 핵심 변경
- `src/components/OpenDartStatusCard.tsx`의 `2. 마지막 생성 시점` row를 label/value 한 줄과 helper 한 줄로만 벌려, `위 시점은 현재 공시 검색과 상세 화면이 마지막으로 읽는 생성 기준입니다.` 문구를 추가했다.
- 이 helper는 raw timestamp의 의미만 닫고, stale 여부 판단, 상대 시간 계산, freshness threshold, warning tone, freshness badge는 추가하지 않았다.
- row 순서, source-of-truth, show/hide 조건, timestamp formatting rule, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, loading/error/empty fallback, missing-index warning, details disclosure 구조, build/button semantics, route/href contract는 바꾸지 않았다.
- 현재 landed 범위가 freshness-read helper candidate memo와 어긋나지 않아 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`와 `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 이번 라운드에서 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 결과: pass. 이번 변경과 무관한 기존 warning 30건만 남았고 새 lint error는 발생하지 않았다.
- 실행: `pnpm build`
- 결과: pass.
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-facts-row-freshness-read-helper-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 round는 helper 한 줄만 추가했으므로, 사용자가 이 문구를 freshness meaning closure로 충분히 받아들이는지는 e2e 수준에서 다시 확인하지 않았다. [미실행]
- route/href 변경이 없어 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 전체를 명령으로 다시 검증한 것은 아니다. [미실행]
- freshness helper를 fallback slot, missing-index helper, dev-only disclosure와 한 배치로 다시 열기 시작하면 copy/helper 범위를 넘어 card IA 재조정으로 번질 수 있다. [검증 필요]
