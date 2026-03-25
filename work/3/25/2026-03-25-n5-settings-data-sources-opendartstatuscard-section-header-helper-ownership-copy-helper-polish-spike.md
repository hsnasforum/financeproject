# 2026-03-25 n5-settings-data-sources-opendartstatuscard-section-header-helper-ownership-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-section-header-helper-ownership-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `OpenDartStatusCard`의 user-facing helper 문구 조정으로 분류해 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 다시 대조해 `/settings/data-sources` route/href contract 변경이 없고 route 문서 sync도 불필요함을 확인했다.
- `dart-data-source-hardening`: `configured` boolean semantics, `userSummary()` 분기, env/operator disclosure contract는 유지한 채, 상단 user-facing summary를 먼저 읽고 dev-only 관리 구간은 아래에서만 읽게 하는 orientation helper 한 줄만 좁게 조정했다.
- `work-log-closeout`: 이번 spike의 실제 변경 범위, 실행 검증, 미실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- `공시 데이터 연결 상태` 아래 helper가 card 전체 orientation layer이자 reading-order bridge 역할을 더 또렷하게 하도록, 상단 user-facing summary 우선 읽기와 하단 dev-only 관리 구간 분리를 한 문장 안에서 더 직접적으로 드러낼 필요가 있었다.
- badge-summary landing scope, loading/error/empty landing scope, missing-index warning, disclosure/build helper scope는 다시 열지 않고 section-header helper wording만 최소 범위로 마무리하는 것이 이번 round 목표였다.

## 핵심 변경
- `src/components/OpenDartStatusCard.tsx`의 section-header helper를 `상단 상태 표시와 사용자용 요약`을 먼저 읽고 `아래 관리 구간`을 나중에 확인한다는 순서가 보이도록 한 줄 조정했다.
- `configured` boolean semantics, `userSummary()` 분기, badge 아래 quick-status helper, `사용자에게 먼저 보이는 기준` helper, loading/error/empty fallback, missing-index warning, details disclosure 구조, build/button semantics, route/href contract는 바꾸지 않았다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`와 `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 actual landed 범위가 current candidate memo와 어긋나지 않아 이번 round에서 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 결과: pass. 기존 미사용 변수 warning 30건은 그대로 남아 있고, 이번 변경에서 새 lint error는 발생하지 않았다.
- 실행: `pnpm build`
- 결과: pass.
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-section-header-helper-ownership-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 round는 header helper 한 줄만 조정했으므로, 상단 orientation 효과는 기존 badge-summary helper와 dev-only 관리 helper가 현재 층위를 유지한다는 전제에 의존한다. [검증 필요]
- route/href 변경이 없어서 `pnpm planning:current-screens:guard`는 생략했지만, route SSOT 자체를 재검증한 것은 아니다. [미실행]
- 사용자 흐름 전체 회귀는 `pnpm e2e:rc`를 실행하지 않았으므로 UI copy read-through에 대한 end-to-end 확인은 남아 있다. [미실행]
