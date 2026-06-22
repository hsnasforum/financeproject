# 2026-06-22 e2e doctor action helper 정리

## 사용 skill
- finance-skill-routing: Finance Project 라운드 범위와 조건부 skill 사용 확인.
- planning-gate-selector: e2e helper, planning report UI, ops action 계약 변경에 맞는 최소 검증 세트 선정.
- work-log-closeout: 변경 파일, 검증 결과, 잔여 리스크 기록 형식 확인.

## 수정 대상 파일
- `tests/e2e/helpers/planningGateHelpers.ts`
- `tests/planning/e2eGateHelpersContract.test.ts`
- `src/components/PlanningReportsDashboardClient.tsx`

## 변경 이유
- e2e migration readiness helper가 `/api/ops/doctor?action=RUN_MIGRATIONS` GET 호출을 사용하고 있었지만, 현재 doctor action 계약은 CSRF 포함 POST body입니다.
- `/planning/reports`의 HTML export 버튼이 hydration 전에 활성화되어 있어, React `onClick`이 붙기 전에 클릭되면 다운로드 요청이 발생하지 않는 실패가 재현됐습니다.

## 변경 내용
- e2e planning gate helper의 `RUN_MIGRATIONS` 호출을 `/api/ops/doctor` POST JSON body 계약으로 변경했습니다.
- helper 계약 회귀 테스트를 추가해 stale GET action URL이 다시 들어오지 않게 고정했습니다.
- report print/export 버튼을 `clientReady` 전에는 비활성화해 hydration 전 클릭 손실을 막았습니다.

## 검증
- PASS: `corepack pnpm test tests/planning/e2eGateHelpersContract.test.ts tests/planning/ops/ops-doctor-route-service-boundary.test.ts tests/planning/ops/actions-run-route.test.ts`
- PASS: `git diff --check`
- PASS: `rg -n 'api/ops/doctor\?action=|request\.get\([^[:cntrl:]]*api/ops/doctor|RUN_MIGRATIONS' tests src scripts e2e planning`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm planning:v2:e2e:fast`

## 남은 리스크와 다음 우선순위
- 이번 라운드는 e2e helper와 report hydration 경합만 다뤘습니다.
- `src/lib/ops/actions/registry.ts`의 `REPAIR_INDEX`/`RUN_MIGRATIONS` 직접 실행 흐름과 doctor service 흐름 중복은 다음 ops service-boundary 라운드에서 계속 정리할 후보입니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
