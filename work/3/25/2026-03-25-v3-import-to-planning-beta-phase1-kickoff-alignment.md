# 2026-03-25 v3 import-to-planning beta Phase 1 kickoff alignment

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`
- `work/3/25/2026-03-25-v3-import-to-planning-beta-phase1-kickoff-alignment.md`

## 사용 skill
- `planning-gate-selector`: docs-only 라운드에 맞는 최소 검증을 `git diff --check -- ...`로 고르고, 미실행 검증을 분리해 기록하기 위해 사용.
- `route-ssot-check`: `docs/current-screens.md`의 route inventory와 이번 라운드의 official entry overlay를 같은 뜻으로 섞지 않도록 실제 page route surface를 대조하기 위해 사용.
- `work-log-closeout`: 이번 라운드의 변경 파일, 실제 실행 검증, 미실행 검증, 남은 리스크를 `/work` 표준 형식으로 남기기 위해 사용.

## 변경 이유
- `analysis_docs/v3` 공통 결론인 `Import-to-Planning Beta`를 broad v3 추진이 아니라 실제 다음 구현 배치용 kickoff baseline으로 잠글 필요가 있었다.
- 현재 저장소에는 `/planning/v3/*` route inventory가 넓게 열려 있어, official beta entry와 current-screens inventory를 분리해서 적지 않으면 broad route promotion으로 해석될 위험이 있었다.
- `/planning/v3/start`의 현재 구현이 import funnel entry인지 별도 wrapper인지 다시 확인해, 이번 Phase 1에서 무엇을 열지 않는지까지 명시할 필요가 있었다.

## 핵심 변경
- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`에 official beta entry map, deep-link only map, non-entry/internal route 목록을 표로 추가했다.
- 같은 문서에 대표 사용자 시나리오, 첫 구현 배치 권장, `/planning/v3/start` 판단 메모, broad v3 route promotion을 지금 열면 위험한 이유를 명시했다.
- `/planning/v3/transactions`는 현재도 `/planning/v3/transactions/batches` redirect alias라는 점, stable `/planning/reports`는 v3 공식 entry가 아니라 stable 결과 확인 도착점이라는 점을 문서에 반영했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N4 beta exposure / visibility policy`에 이번 docs-only Phase 1 kickoff baseline이 current-screens inventory를 바꾸지 않는 overlay 정렬이라는 연결 메모를 추가했다.
- `docs/current-screens.md`와 `docs/planning-v3-kickoff.md`는 이번 라운드에서 route inventory/classification 자체를 바꾸지 않아 수정하지 않았다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md work/3/25/2026-03-25-v3-import-to-planning-beta-phase1-kickoff-alignment.md`
- [미실행] `pnpm lint` — docs-only 라운드라 실행하지 않았다.
- [미실행] `pnpm test` — docs-only 라운드라 실행하지 않았다.
- [미실행] `pnpm build` — docs-only 라운드라 실행하지 않았다.
- [미실행] `pnpm planning:current-screens:guard` — current-screens inventory/classification 자체는 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route SSOT 변경이 아니라 docs-only overlay alignment라 실행하지 않았다.
- [미실행] `pnpm e2e:rc` — 사용자 흐름 구현이나 `href` 변경이 없어 실행하지 않았다.

## 남은 리스크
- `/planning/v3/start`는 이번 라운드에서 `non-entry/onboarding wrapper 후보`로만 잠갔고, 후속 구현에서 import funnel 전용 wrapper로 재정의할지 여부는 별도 판단이 필요하다.
- `docs/current-screens.md`는 inventory SSOT로 유지했으므로, 이후 실제 nav/href/current-screens classification 변경이 생기면 이번 overlay와 함께 다시 검증해야 한다.
- 이번 라운드는 kickoff 기준선만 닫았고, 실제 CTA 정리, handoff 구현, beta gate 실행 증거는 다음 구현 배치에서 별도로 남겨야 한다.
