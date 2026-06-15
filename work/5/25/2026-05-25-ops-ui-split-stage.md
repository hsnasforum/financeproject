# 2026-05-25 ops UI split stage

## 변경 파일
- `src/components/OpsDashboardClient.tsx`
- `src/components/opsDashboard/sections.tsx`
- `src/components/opsDashboard/shared.ts`
- `src/components/opsDashboard/useOpsDashboardController.ts`
- `src/components/OpsMetricsClient.tsx`
- `src/components/opsMetrics/sections.tsx`
- `src/components/opsMetrics/shared.ts`
- `src/components/opsMetrics/useOpsMetricsController.ts`
- `tests/ops-dashboard-ui.test.tsx`
- `tests/ops-metrics-ui.test.tsx`
- `work/5/25/2026-05-25-ops-ui-split-stage.md`

## 사용 skill
- `browser:browser`: 변경된 OPS 화면을 로컬 Next 서버에서 실제 렌더링해 `/ops`, `/ops/metrics` 스모크를 확인했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크를 `/work` 기록으로 정리했습니다.

## 변경 이유
- `OpsDashboardClient`와 `OpsMetricsClient`가 상태 관리, API 호출, 렌더링 섹션을 한 파일에 모두 포함해 유지보수 위험이 컸습니다.
- 화면 진입점은 얇게 유지하고, controller/shared/sections 계약으로 나눠 후속 운영 UI 변경의 회귀 범위를 줄이기 위함입니다.
- 분리 중 `opsDashboard/sections.tsx`가 controller 파일에서 상수를 가져오던 경계를 shared/lib 소유 위치로 바로잡았습니다.

## 핵심 변경
- OPS dashboard 상태, API 호출, 자동 실행, scheduler 정책 조작을 `useOpsDashboardController`로 분리했습니다.
- dashboard 렌더링 덩어리를 `OpsDashboard*Section` 컴포넌트들로 나눴습니다.
- OPS metrics 이벤트/요약/fallback 계산을 `useOpsMetricsController`와 `opsMetrics/shared.ts`로 분리했습니다.
- metrics summary, fallback, filter, events UI를 독립 section 컴포넌트로 나눴습니다.
- dashboard/metrics shell selector 회귀를 각각 focused UI 테스트로 고정했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- src/components/OpsDashboardClient.tsx src/components/opsDashboard src/components/OpsMetricsClient.tsx src/components/opsMetrics tests/ops-dashboard-ui.test.tsx tests/ops-metrics-ui.test.tsx` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint src/components/OpsDashboardClient.tsx src/components/opsDashboard/sections.tsx src/components/opsDashboard/shared.ts src/components/opsDashboard/useOpsDashboardController.ts src/components/OpsMetricsClient.tsx src/components/opsMetrics/sections.tsx src/components/opsMetrics/shared.ts src/components/opsMetrics/useOpsMetricsController.ts tests/ops-dashboard-ui.test.tsx tests/ops-metrics-ui.test.tsx` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/ops-dashboard-ui.test.tsx tests/ops-metrics-ui.test.tsx` 통과: 2 files, 3 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm typecheck` 통과
- Browser smoke 통과: `http://127.0.0.1:3200/ops`와 `http://127.0.0.1:3200/ops/metrics`에서 shell 렌더링 확인, console error 0건
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm worktree:scope src/components/OpsDashboardClient.tsx src/components/opsDashboard src/components/OpsMetricsClient.tsx src/components/opsMetrics tests/ops-dashboard-ui.test.tsx tests/ops-metrics-ui.test.tsx` 통과: 전체 변경 127, 범위 내 10, 범위 밖 117

## 남은 리스크
- 이번 라운드는 OPS dashboard/metrics UI 분리만 검증했습니다. 전체 `pnpm lint`, `pnpm test`, `pnpm build`는 PR 최종 전 다시 묶어야 합니다.
- 현재 worktree에는 planning workspace, planning v3 news/transaction, planner wizard 등 범위 밖 변경이 남아 있습니다.
- 로컬 개발 서버는 `http://127.0.0.1:3200`에서 실행 중입니다.

## 다음 라운드
- planning v3 news settings 또는 transaction batch detail 분리 후보를 다음 pathspec 묶음으로 검토합니다.
- 이후 planning workspace 대형 분리 후보는 별도 라운드에서 focused test와 e2e 필요 여부를 다시 판단합니다.
