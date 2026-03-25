# 2026-03-25 n5-settings-data-sources-opendartstatuscard-read-through-basis-facts-ownership-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-read-through-basis-facts-ownership-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `OpenDartStatusCard`의 user-facing facts block wording 조정으로 분류해 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract 변경이 없고 route 문서 sync도 불필요함을 확인했다.
- `dart-data-source-hardening`: `configured` boolean semantics, `userSummary()` 분기, `fetchStatus()` contract, status schema, build/button/disclosure contract는 유지한 채, `지금 읽는 기준` 정상 intro sentence와 facts labels만 user-facing current basis facts로 더 읽히게 좁게 조정했다.
- `work-log-closeout`: 이번 spike의 실제 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- `지금 읽는 기준` 정상 intro sentence와 facts rows가 support evidence나 dev memo가 아니라 user-facing primary read-through basis layer로 더 또렷하게 읽히도록 wording만 좁게 정리할 필요가 있었다.
- section-header helper, badge-summary, loading/error/empty fallback, missing-index warning, dev-only disclosure/build helper scope는 다시 열지 않고 facts block wording만 최소 범위로 마무리하는 것이 이번 round 목표였다.

## 핵심 변경
- `src/components/OpenDartStatusCard.tsx`의 정상 intro sentence를 `아래 세 항목은 개발용 메모가 아니라 ... 현재 기준`으로 조정해 facts block이 user-facing current basis facts라는 점을 더 직접적으로 드러냈다.
- facts labels를 `인덱스 준비 상태`, `마지막 생성 시점`, `반영된 회사 수`로 조정해 support evidence나 dev trace보다 사용자용 현재 기준 facts로 읽히게 정리했다.
- `configured` boolean semantics, `userSummary()` 분기, `fetchStatus()` 로직, loading/error/empty fallback, missing-index warning, details disclosure 구조, build endpoint/button semantics, route/href contract는 바꾸지 않았다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`와 `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 actual landed 범위가 current candidate memo와 어긋나지 않아 이번 round에서 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 결과: pass. 기존 미사용 변수 warning 30건은 그대로 남아 있고, 이번 변경에서 새 lint error는 발생하지 않았다.
- 실행: `pnpm build`
- 결과: pass.
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-read-through-basis-facts-ownership-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 round는 facts block wording만 조정했으므로, 현재 층위 분리는 top summary, fallback slot, missing-index helper, dev-only disclosure/helper가 기존 위치와 의미를 유지한다는 전제에 의존한다. [검증 필요]
- route/href 변경이 없어서 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 자체를 재검증한 것은 아니다. [미실행]
- 사용자 흐름 전체 회귀는 `pnpm e2e:rc`를 실행하지 않았으므로 read-through wording이 실제 화면 읽기 순서에 미치는 영향에 대한 end-to-end 확인은 남아 있다. [미실행]
