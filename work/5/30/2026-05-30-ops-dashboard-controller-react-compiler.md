# 2026-05-30 Ops Dashboard Controller React Compiler 경고 축소

## 변경 파일
- `src/components/opsDashboard/useOpsDashboardController.ts`
- `work/5/30/2026-05-30-ops-dashboard-controller-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록의 다음 우선순위와 이번 라운드의 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: ops dashboard controller 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `useOpsDashboardController`가 초기 dashboard load와 localStorage/Notification 복원에서 effect 내부 즉시 state update를 수행해 `react-hooks/set-state-in-effect` 경고 2건을 만들었습니다.
- `/ops` 대시보드의 초기 로드, 자동 실행 요약 복원, 알림 권한 표시 의미는 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 적용 변경
- 초기 `loadDashboard()` 호출을 `window.setTimeout(..., 0)`으로 다음 macrotask에 예약하고 cleanup에서 취소하도록 바꿨습니다.
- localStorage/Notification 복원 블록도 다음 macrotask로 예약하고 cleanup을 추가했습니다.
- route, href, selector, API contract, env, 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/opsDashboard/useOpsDashboardController.ts --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: 초기 `loadDashboard()` effect와 localStorage/Notification 복원 effect에서 경고 2건 확인.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec vitest run tests/planning/ops/dashboard-autoRun.test.ts tests/ops-dashboard-ui.test.tsx`
  - PASS. 2개 파일 / 12개 테스트 통과.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-ops-dashboard-controller.json`
  - PASS. 전체 잔여 경고: 6건 / 4개 파일.
  - 이번 대상 파일 `src/components/opsDashboard/useOpsDashboardController.ts` 경고 없음.
- `git diff --check`
  - PASS.
- `pnpm lint`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - 첫 실행은 124초 도구 제한으로 종료됐고, 300초 제한 재실행은 PASS.
  - Next.js production build 및 `/ops`, `/api/ops/*` 경로 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - build 직후 `.next-build-2459647` 확인.
  - `corepack pnpm cleanup:next-artifacts`가 생성 메타데이터 보존 때문에 1차 정리를 건너뛰어, 생성된 `.next-build-info.json`의 보존 포인터를 비운 뒤 동일 정리 스크립트로 제거했습니다.
  - 최종 재확인 출력 없음. 잔여 isolated build/e2e 산출물 없음.

## 남은 리스크
- 초기 dashboard load와 localStorage/Notification 복원이 다음 macrotask로 지연됩니다. 사용자 노출 동작은 유지되지만, mount 직후 동기 상태를 가정하는 새 테스트가 추가되면 `waitFor` 계열 검증이 필요합니다.
- API, route, href, env, 정책, 지표 계산, 감사 로그 의미는 변경하지 않았습니다.

## 다음 라운드 우선순위
- `src/components/opsMetrics/useOpsMetricsController.ts`의 `react-hooks/set-state-in-effect` 경고 1건을 기준선으로 확인합니다.
- ops metrics controller 변경이면 관련 ops metrics 테스트와 `pnpm lint`, `pnpm test`, `pnpm build`를 최소 검증 후보로 검토합니다.
