# 2026-04-11 High→Middle Surface Refactor 마감

## 변경 파일
- `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`
- `src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/shared.ts`
- `src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/useTransactionBatchDetailController.ts`
- `src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/sections.tsx`
- `src/components/OpsDashboardClient.tsx`
- `src/components/opsDashboard/shared.ts`
- `src/components/opsDashboard/useOpsDashboardController.ts`
- `src/components/opsDashboard/sections.tsx`
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `src/app/planning/v3/news/settings/_components/newsSettings/shared.ts`
- `src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts`
- `src/app/planning/v3/news/settings/_components/newsSettings/sections.tsx`
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `src/app/planning/reports/_components/reportDashboard/shared.ts`
- `src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx`
- `src/app/planning/reports/_components/reportDashboard/sections.tsx`
- `src/components/OpsMetricsClient.tsx`
- `src/components/opsMetrics/shared.ts`
- `src/components/opsMetrics/useOpsMetricsController.ts`
- `src/components/opsMetrics/sections.tsx`
- `src/components/PlannerWizard.tsx`
- `src/components/plannerWizard/shared.ts`
- `src/components/plannerWizard/surfaces.tsx`
- `src/components/plannerWizard/steps.tsx`
- `tests/ops-dashboard-ui.test.tsx`
- `tests/ops-metrics-ui.test.tsx`
- `tests/planner-wizard-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: route/page/ui 변경 배치의 최소 검증 세트 결정
- `work-log-closeout`: 오늘 라운드 종료 기록 형식 정리

## 변경 이유
- 이전 스캔에서 `우선순위 높음`과 `중간 우선순위`로 분류한 6개 surface가 큰 단일 파일 또는 화면/효과/데이터 접근이 한곳에 섞인 상태였습니다.
- 사용자 노출 계약은 유지한 채 route-facing client, controller, section view, local helper 경계를 분리해 diff 표면과 후속 수정 리스크를 줄일 필요가 있었습니다.
- dirty 상태였던 `NewsSettingsClient`, `ReportDashboard`, `OpsMetricsClient`, `PlannerWizard`는 기존 변경을 보존한 채 그 위에서만 구조 정리를 진행했습니다.

## 핵심 변경
- `TransactionBatchDetailClient`
  - route-facing client + controller + section view 구조로 분리했습니다.
  - detail/categorized/accounts/cashflow fetch, override save, draft create, refresh nonce를 controller로 이동했습니다.
  - `tmp/txn-batch-detail-client-audit.tsx` 심볼릭 링크가 빌드 입력에 들어오는 상황을 고려해 local import를 alias 경로로 정리했습니다.
- `OpsDashboardClient`
  - `useOpsDashboardController`를 도입해 fetch, timer, Notification, localStorage, confirm modal 제어를 모았습니다.
  - 화면은 notices, scheduler, doctor/issues, quick actions, recent events, confirm modal로 fan-out 했습니다.
  - `ops-home`, `ops-scheduler-summary`, preview/modal 표면을 고정하는 smoke test를 추가했습니다.
- `NewsSettingsClient`
  - controller + section views + helpers 구조로 분리했습니다.
  - `#news-settings-*` anchor, 저장 gating, alert rules 상태 문구, API 순서와 CSRF 주입은 유지했습니다.
- `ReportDashboard`
  - `CoreMetricEvidenceDock`와 panel-local helper를 분리하고 summary/guide/warnings/goals/actions/simulation-debt section으로 fan-out 했습니다.
  - 기존 disclosure, evidence, `data-testid`, dirty 상태의 semantic class 변경은 그대로 유지했습니다.
- `OpsMetricsClient`
  - fetch/effect를 controller로 옮기고 fallback/legacy selector를 pure helper로 분리했습니다.
  - summary/fallback/filter/events section fan-out과 함께 render smoke test를 추가했습니다.
- `PlannerWizard`
  - static config/helper와 step body, sidebar/history/trend/footer surface를 개별 module로 분리했습니다.
  - storage key, snapshot 동작, quick view/playbook modal, step order와 copy는 유지했습니다.
  - wizard shell과 snapshot/history surface smoke test를 추가했습니다.

## 검증
- 정적 확인
  - `git diff --check -- src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail src/components/OpsDashboardClient.tsx src/components/opsDashboard src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/settings/_components/newsSettings src/app/planning/reports/_components/ReportDashboard.tsx src/app/planning/reports/_components/reportDashboard src/components/OpsMetricsClient.tsx src/components/opsMetrics src/components/PlannerWizard.tsx src/components/plannerWizard tests/ops-dashboard-ui.test.tsx tests/ops-metrics-ui.test.tsx tests/planner-wizard-ui.test.tsx`
  - `pnpm exec eslint src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/shared.ts src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/useTransactionBatchDetailController.ts src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/sections.tsx`
  - `pnpm exec eslint src/components/OpsDashboardClient.tsx src/components/opsDashboard/shared.ts src/components/opsDashboard/useOpsDashboardController.ts src/components/opsDashboard/sections.tsx tests/ops-dashboard-ui.test.tsx`
  - `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/settings/_components/newsSettings/*.ts* tests/planning-v3-news-settings-ui.test.tsx`
  - `pnpm exec eslint src/app/planning/reports/_components/ReportDashboard.tsx src/app/planning/reports/_components/reportDashboard/*.ts* tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning-reports-page-fallback.test.tsx`
  - `pnpm exec eslint src/components/OpsMetricsClient.tsx src/components/opsMetrics/*.ts* tests/ops-metrics-ui.test.tsx tests/planning/ops/metrics-api-routes.test.ts`
  - `pnpm exec eslint src/components/PlannerWizard.tsx src/components/plannerWizard/*.ts* tests/planner-wizard-ui.test.tsx`
  - `pnpm lint`
- 단위/통합
  - `pnpm exec vitest run tests/planning-v3-import-followthrough-ui.test.tsx tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - `pnpm exec vitest run tests/ops-dashboard-ui.test.tsx tests/planning/ops/dashboard-autoRun.test.ts tests/dev-unlock-shortcut.test.ts`
  - `pnpm exec vitest run tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/news-exposure-api.test.ts tests/planning-v3-indicators-specs-import-api.test.ts`
  - `pnpm exec vitest run tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning-reports-page-fallback.test.tsx`
  - `pnpm exec vitest run tests/planning/ops/metrics-api-routes.test.ts tests/ops-metrics-ui.test.tsx`
  - `pnpm exec vitest run tests/planner-compute.test.ts tests/planner-metrics.test.ts tests/planner-execution-hints.test.ts tests/url-wizard.test.ts tests/planner-page-redirect.test.ts tests/planner-wizard-ui.test.tsx`
- 배치 게이트
  - `pnpm build`
  - `pnpm e2e:rc`
  - 결과: 최종 build 통과, e2e 22/22 통과

## 남은 리스크
- 이번 배치 범위의 6개 surface는 계획한 구조 정리를 완료했습니다.
- 현재 worktree에는 이번 배치와 무관한 기존 tracked/untracked 변경이 계속 남아 있으므로, 다음 라운드에서는 범위 분리 기준을 계속 엄격하게 가져가는 편이 안전합니다.
- `tmp/` 심볼릭 링크처럼 로컬 보조 자산이 빌드 입력에 섞일 수 있는 경로가 남아 있으니, 다음 정리 라운드에서 tmp/local audit 자산 정책을 따로 점검할 가치가 있습니다.

## 다음 라운드 우선순위
- 높은 우선순위 배치에서 구조 정리가 끝난 surface와 무관한, 실제 사용자 가치가 있는 후속 작업만 별도 범위로 다시 잡기
- local 보조 자산(`tmp`, audit symlink, legacy verification 흔적)의 build 영향 여부를 좁게 점검하기
