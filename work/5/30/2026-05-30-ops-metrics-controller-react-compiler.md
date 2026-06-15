# 2026-05-30 Ops Metrics Controller React Compiler 경고 축소

## 변경 파일
- `src/components/opsMetrics/useOpsMetricsController.ts`
- `work/5/30/2026-05-30-ops-metrics-controller-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록의 다음 우선순위와 이번 라운드의 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: React hook/controller와 `/ops/metrics` 소비 경로 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `useOpsMetricsController`가 초기 `loadMetrics()`를 effect 본문에서 즉시 호출해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/ops/metrics`의 초기 metrics 이벤트/요약 로드 의미는 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 초기 `loadMetrics()` 호출을 `window.setTimeout(..., 0)`으로 다음 macrotask에 예약했습니다.
- effect cleanup에서 예약된 초기 로드를 취소하도록 `window.clearTimeout(timeoutId)`를 추가했습니다.
- metrics API 호출, fallback delta 계산, event type 필터, route, href, selector, env, 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/opsMetrics/useOpsMetricsController.ts --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: 초기 `loadMetrics()` effect에서 경고 1건 확인.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec vitest run tests/ops-metrics-ui.test.tsx tests/planning/ops/metrics-api-routes.test.ts tests/planning/ops/metricsStore.test.ts`
  - PASS. 3개 파일 / 10개 테스트 통과.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-ops-metrics-controller.json`
  - PASS. 전체 잔여 경고: 5건 / 3개 파일.
  - 이번 대상 파일 `src/components/opsMetrics/useOpsMetricsController.ts` 경고 없음.
- `git diff --check`
  - PASS.
- `pnpm lint`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/ops/metrics`, `/api/ops/metrics/events`, `/api/ops/metrics/summary` 경로 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 잔여 isolated build/e2e 산출물 없음.

## 남은 리스크
- 초기 metrics 로드가 다음 macrotask로 지연됩니다. 사용자 노출 동작은 유지되지만, mount 직후 동기 fetch 호출을 가정하는 새 테스트가 추가되면 비동기 대기 검증이 필요합니다.
- API, route, href, env, metrics 계산, fallback delta 계산 의미는 변경하지 않았습니다.

## 다음 라운드 우선순위
- `src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts`의 `react-hooks/set-state-in-effect` 경고 2건을 기준선으로 확인합니다.
- planning workspace bundle 변경이면 planning UI/workspace 테스트와 `pnpm lint`, `pnpm test`, `pnpm build`를 최소 검증 후보로 검토합니다.
