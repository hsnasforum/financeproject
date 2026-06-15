# 2026-05-25 dirty worktree stage candidates

## 변경 파일
- `work/5/25/2026-05-25-dirty-worktree-stage-candidates.md`

## 사용 skill
- `finance-skill-routing`: 오늘 최신 `/work`와 현재 dirty 범위를 기준으로 이번 라운드에 필요한 최소 skill 조합을 고르기 위해 사용했습니다.
- `planning-gate-selector`: 남은 변경을 stage 후보로 나누고 각 stage별 최소 검증 세트를 정리하기 위해 사용했습니다.
- `work-log-closeout`: 이번 라운드의 분해 결과와 실제 실행 명령, 다음 우선순위를 `/work` 형식에 맞춰 남기기 위해 사용했습니다.

## 변경 이유
- 사용자가 `2a0e485 Split planning workspace controller` 이후 남은 dirty worktree를 다음 stage 후보로 3~5단계로 나눠 달라고 요청했습니다.
- 현재 tracked diff가 planner wizard, planning v3 balances/batches/news, planning v2 guard/regression scripts, DART 상태 카드/추천 UI, 다수의 `/work` 및 문서 정리 항목으로 섞여 있어 그대로 stage하면 범위와 검증이 다시 커질 위험이 있습니다.

## 전달 변경
- 코드나 기존 dirty 파일은 수정하지 않고, 최신 `/work`와 `git status --short` 기준으로 남은 변경 묶음을 다시 분류했습니다.
- 메인 에이전트가 직접 처리할 핵심 경로를 `PlannerWizard + Recommend/Recovery/QuickStartGate`, `planning v3 balances/batches/news + transactionStore/API tests`, `planning_v2_* scripts + 관련 테스트` 세 축으로 좁혔습니다.
- `OpenDartStatusCard`는 DART/public source 흐름 성격이 강하지만 실제 diff가 색상 토큰 1건이라 planner/home UI stage와 묶는 쪽이 충돌이 적다고 판단했습니다.
- `.gitignore`, `docs/dart-rules-quality-report.md`, `guidedoc/*.Zone.Identifier`, 다수의 `/work` note는 코드 stage와 분리한 문서/정리 stage 후보로 유지했습니다.

## 검증
- `Get-ChildItem -Path work/5/25 -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 3 FullName,LastWriteTime`
- `git log --oneline -n 5`
- `Get-Content work/5/25/2026-05-25-planning-workspace-split-stage.md -TotalCount 220`
- `git status --short --untracked-files=all`
- `Get-Content .codex/skills/finance-skill-routing/SKILL.md -TotalCount 220`
- `Get-Content .codex/skills/planning-gate-selector/SKILL.md -TotalCount 260`
- `Get-Content work/5/25/2026-05-25-worktree-candidate-bundles.md -TotalCount 260`
- `Get-Content work/5/25/2026-05-25-next-round-planning-breakdown.md -TotalCount 260`
- `git diff --name-only`
- `git diff --stat`
- `Get-Content work/5/25/2026-05-25-stage-pr-bundle-order.md -TotalCount 260`
- `Get-Content work/5/25/2026-05-25-worktree-scope-audit.md -TotalCount 260`
- `git diff -- src/components/PlannerWizard.tsx src/components/plannerWizard/shared.ts src/components/plannerWizard/steps.tsx src/components/plannerWizard/surfaces.tsx src/components/RecommendHubClient.tsx src/components/RecoveryClient.tsx src/components/planning/PlanningQuickStartGate.tsx src/components/OpenDartStatusCard.tsx --stat`
- `git diff -- src/app/planning/v3/balances/_components/BalancesClient.tsx src/app/planning/v3/batches/_components/BatchesCenterClient.tsx src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/WeeklyPlanPanel.tsx src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts --stat`
- `git diff -- scripts/datago_sync.mjs scripts/planning_v2_ops_scheduler.sh scripts/planning_v2_regression.mjs scripts/planning_v2_static_guard.mjs tests/planning-v2/reportInterpretationAdapter.test.ts tests/news-search-index.test.ts tests/next-artifact-prune.test.ts --stat`
- `git diff -- .gitignore docs/dart-rules-quality-report.md guidedoc/personal_finance_planner_dto_validator_rules_v2_2_c.docx:Zone.Identifier guidedoc/personal_finance_planner_openapi_documentation_v2_2_c.docx:Zone.Identifier guidedoc/personal_finance_planner_openapi_documentation_v2_2_c.pdf:Zone.Identifier guidedoc/personal_finance_planner_qa_case_table_v2_2_c.xlsx:Zone.Identifier guidedoc/personal_finance_planner_screen_definition_v2_2_a.docx:Zone.Identifier guidedoc/personal_finance_planner_screen_definition_v2_2_a.pdf:Zone.Identifier --stat`
- `Get-Content .codex/skills/work-log-closeout/SKILL.md -TotalCount 260`

## 남은 리스크
- `tmp/flow-v3-import-to-cashflow-audit.spec.ts`, `tmp/txn-batch-detail-client-audit.tsx`는 `git diff` 출력에서 `Function not implemented`가 끼어들어 stage pathspec 작성 시 별도 제외 확인이 필요합니다.
- `.dist/planning-v2-desktop*`, `scripts/pack-*.sh`, `scripts/smoke/public-apis-sample.mjs`, `scripts/run_codex_multi_agent.sh`는 이번 요청 범위에 직접 포함되지 않았지만 여전히 dirty라서 실제 `git add` 시 의도치 않게 섞일 수 있습니다.
- `docs/dart-rules-quality-report.md`와 `guidedoc/*.Zone.Identifier` 삭제는 코드 동작과 별개라 stage 순서를 잘못 잡으면 검증 대비 신호가 약한 PR이 될 수 있습니다.
- 최종 `pnpm build`, `pnpm e2e:rc`, production smoke는 이번 라운드에서 실행하지 않았고, 메인 에이전트가 각 구현 stage 종료 시 단독 실행해야 합니다.
