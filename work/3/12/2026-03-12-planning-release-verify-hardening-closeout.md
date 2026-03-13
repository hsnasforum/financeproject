# 2026-03-12 planning release verify hardening

## 변경 파일
- `src/app/planning/reports/page.tsx`
- `src/components/PlanningReportsDashboardBoundary.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/lib/planning/security/vaultState.ts`
- `src/lib/planning/migrations/manager.ts`
- `tests/planning/security/vaultState.test.ts`
- `tests/planning/migrations/manager.test.ts`
- `tests/e2e/planning-v2-fast.spec.ts`

## 변경 이유
- `release:verify`에서 반복되던 planning fast e2e/report 로딩 지연과 손상 JSON 방어 누락을 줄이기 위해 최소 수정으로 서버 초기 데이터와 복구 경로를 보강했다.

## 사용 skill
- `planning-gate-selector`: planning v2/report/layout 수정에 필요한 검증 세트 선택.
- `work-log-closeout`: `/work` closeout 기록 정리.

## 무엇이 바뀌었는지
- `/planning/reports` dev 경로도 서버 초기 run scope를 사용하도록 맞춰 리포트 첫 렌더 의존성을 줄였다.
- `PlanningReportsDashboardBoundary`를 dynamic `ssr:false` 경계에서 일반 서버 경계로 되돌렸다.
- dashboard의 고급/raw 토글을 `details`에서 명시적 버튼 상태로 바꾸고 fast e2e 대기 기준을 늘렸다.
- vault config/migration state가 깨진 JSON일 때 예외 대신 미설정/초기 상태로 복구하도록 방어했다.
- 손상 JSON 복구 케이스를 unit test로 추가했다.

## 실행한 검증
- `pnpm exec eslint src/app/planning/reports/page.tsx src/components/PlanningReportsDashboardBoundary.tsx src/components/PlanningReportsDashboardClient.tsx src/lib/planning/security/vaultState.ts src/lib/planning/migrations/manager.ts tests/planning/security/vaultState.test.ts tests/planning/migrations/manager.test.ts tests/e2e/planning-v2-fast.spec.ts scripts/planning_v2_static_guard.mjs`
- `pnpm test tests/planning/security/vaultState.test.ts tests/planning/migrations/manager.test.ts`
- `pnpm planning:v2:guard`
- `pnpm planning:v2:e2e:fast`
- `pnpm build:detached`
- `pnpm release:verify`
- `git diff --check -- src/app/planning/reports/page.tsx src/components/PlanningReportsDashboardBoundary.tsx src/components/PlanningReportsDashboardClient.tsx src/lib/planning/security/vaultState.ts src/lib/planning/migrations/manager.ts tests/planning/security/vaultState.test.ts tests/planning/migrations/manager.test.ts tests/e2e/planning-v2-fast.spec.ts`

## 검증 결과
- `pnpm planning:v2:guard`: PASS
- `pnpm planning:v2:e2e:fast`: 단독 실행 기준 PASS
- `pnpm build:detached`: PASS (`/tmp/finance-build-detached-2026-03-12T03-37-38-907Z.exit.json`, `code=0`)
- `pnpm release:verify`: FAIL
  - `planning:v2:compat -> planning:v2:complete -> planning:v2:e2e:fast`
  - 실패 1: `report-advanced-toggle`가 compat/release 부하에서 `aria-expanded="false"`로 남아 `report-advanced-raw`가 열리지 않음
  - 실패 2: `key interactive controls`에서 `/planning` 진입 시 간헐적으로 `planning-profile-form` 미노출 및 `page: '/planning' SyntaxError: Unexpected end of JSON input`

## 미실행 검증
- 없음

## 남은 리스크 / 엣지 케이스
- compat/release 경로에서만 드러나는 `/planning` JSON parse source가 아직 특정되지 않았다.
- dashboard advanced/raw 토글은 단독 fast e2e에서는 통과하지만 compat/release 부하에서는 여전히 비결정적이다.

## 다음 라운드 메모
- `/planning` 서버 렌더가 직접 타는 컴포넌트/스토어 경로 중 손상 JSON을 아직 그대로 throw 하는 지점을 추적해야 한다.
- `report-advanced-toggle`의 클릭 경로는 test 안정화가 아니라 실제 상태 전환 지연/미전환 원인을 trace 기준으로 확인해야 한다.
