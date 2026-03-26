# 2026-03-26 v3 import-to-planning beta post-closeout next-official-axis reselection audit

## 변경 전 메모

1. 수정 대상 파일
- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- 필요하면 `docs/planning-v3-kickoff.md`

2. 변경 이유
- representative funnel implementation/closeout은 현재 `none for now`로 잠겼고, 다음 질문은 더 이상 funnel 내부 micro batch가 아니라 “다음 공식 축 선정”으로 바뀌었다.

3. 실행할 검증 명령
- `git diff --check -- analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/26/2026-03-26-v3-import-to-planning-beta-post-closeout-next-official-axis-reselection-audit.md`

## 사용 skill

- `planning-gate-selector`: docs-only 라운드의 최소 검증 범위를 유지하기 위해 사용
- `route-ssot-check`: route inventory와 official entry/ stable destination/ ops-readiness 층위를 섞지 않도록 확인
- `work-log-closeout`: `/work` closeout 형식으로 이번 라운드 결론을 기록

## 이번 라운드에서 바뀐 것

1. `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`에 post-closeout next-axis reselection subsection을 추가했다.
2. representative funnel closeout은 그대로 parked baseline으로 두고, current smallest viable next official axis를 `Stream B. Contract & QA`로 재선정했다.
3. `Stream B`의 current smallest official question을 `targeted beta gate / evidence bundle` 선정으로 좁히고, `Stream C`는 `v3:doctor/export/restore/support-bundle` readiness 후속 축으로 분리했다.
4. `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 결론을 local audit 메모로 연결했다.
5. `docs/planning-v3-kickoff.md`와 `docs/current-screens.md`는 이번 docs-only 범위에서 수정하지 않았다.

## 판단 근거

- representative product-flow proof asset은 이미 존재한다.
  - `tests/e2e/v3-draft-apply.spec.ts`
  - `tests/e2e/planning-quickstart-preview.spec.ts`
  - `tests/e2e/flow-history-to-report.spec.ts`
- current code에는 `pnpm v3:doctor`, `pnpm v3:export`, `pnpm v3:restore`, `pnpm v3:support-bundle` readiness asset도 이미 존재하지만, 이는 product-flow beta proof와 다른 층의 operator workflow다.
- 따라서 broad reopen 없이 가장 작게 열 수 있는 다음 공식 축은 `Stream B` 쪽 targeted gate/evidence 정의이고, `Stream C`를 먼저 열면 backup/restore/support semantics까지 함께 다뤄야 해서 범위가 넓어진다.
- `2026-03-26-rc-e2e-dart-monitor-invalid-date-range-red-baseline-triage-audit.md` 기준 DART rerun green은 이 판단과 충돌하지 않는다.

## 검증

- 실행:
  - `git diff --check -- analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/26/2026-03-26-v3-import-to-planning-beta-post-closeout-next-official-axis-reselection-audit.md`

- 미실행:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm planning:current-screens:guard`
  - `pnpm planning:ssot:check`
  - `pnpm e2e:rc`
  - `pnpm v3:doctor`
  - `pnpm v3:export`
  - `pnpm v3:restore`
  - 이유: 이번 라운드는 docs-only reselection audit이며 코드, route inventory, runtime contract, ops execution을 바꾸지 않았다.

## 남은 리스크와 엣지케이스

- 이번 결론은 import-to-planning beta post-closeout question을 재선정한 것이지, `N1 ~ N5` 전체 backlog 우선순위를 다시 쓰는 것은 아니다. 이 층위를 섞으면 `Stream B` 선정이 broad v3 promotion이나 stable/public IA 재편으로 잘못 읽힐 수 있다.
- `Stream B`를 실제로 열 때는 기존 e2e/build/lint/test 중 무엇을 targeted beta gate로 고정할지와 evidence bundle 형식을 다시 좁혀야 한다. 아직 전용 명령이나 release artifact shape를 새로 정의하지는 않았다.

## 다음 라운드 우선순위

1. `Stream B. Contract & QA` 기준으로 representative funnel targeted beta gate / evidence bundle 범위를 docs-only로 먼저 고정
2. 그다음에만 `Stream C. Ops & Readiness`의 `v3:doctor/export/restore/support-bundle` 운영 루틴을 별도 축으로 검토
