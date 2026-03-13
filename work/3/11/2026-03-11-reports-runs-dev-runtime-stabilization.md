# 2026-03-11 reports/runs dev runtime 안정화

## 변경 이유
- 병렬 dev classify에서 `__webpack_modules__[moduleId] is not a function` 직후 `/planning/reports` 500, `ERR_ABORTED`, `ERR_EMPTY_RESPONSE`가 다시 섞였다.
- `/planning/runs`는 첫 진입 직후 Action Center fetch가 바로 붙어 초기 경합을 키우고 있었다.
- 리포트 client fetch는 cleanup 없이 남아 late update/잔여 요청 가능성이 있었다.

## 이번 변경
1. `src/app/planning/reports/page.tsx`
   - 리포트 페이지가 `PlanningReportsDashboardBoundary`를 통해 대시보드를 한 단계 늦게 붙이도록 바꿨다.
   - 첫 scope 실패 시 notice를 유지한 채 client fallback으로 이어지게 유지했다.
2. `src/components/PlanningReportsDashboardBoundary.tsx`
   - 리포트 대시보드를 `dynamic(..., { ssr: false })` 경로로 감싸고, 서버 쪽에는 헤더 + 로딩 셸만 먼저 보여주게 했다.
3. `src/components/PlanningReportsDashboardClient.tsx`
   - 초기 run 목록 fetch와 후보 비교 fetch에 `AbortController`를 붙여 cleanup 시 잔여 요청을 끊게 했다.
4. `src/components/PlanningRunsClient.tsx`
   - 선택 run의 Action Center 자동 로드를 `250ms` 늦춰 초기 화면 경쟁을 줄였다.
5. `playwright.config.ts`
   - dev webServer의 기본 dist dir를 `.next-e2e-${PORT}` 로 바꿔 포트별 dev 산출물을 분리했다.

## 검증
1. `pnpm test tests/planning/reports/runSelection.test.ts tests/planning-v2-api/report-contract-mode-route.test.ts`
2. `pnpm exec eslint src/app/planning/reports/page.tsx src/components/PlanningReportsDashboardClient.tsx src/components/PlanningReportsDashboardBoundary.tsx src/components/PlanningRunsClient.tsx playwright.config.ts`
3. `pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts tests/e2e/planning-v2-fast.spec.ts --workers=1`
4. `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3126`

## 검증 결과
- 단위 테스트 7개 PASS.
- 대상 eslint PASS.
- `flow-history-to-report` + `planning-v2-fast` 단독 E2E PASS.
- 병렬 dev classify `3/3 PASS`:
  - attempt 1: `port=3126`
  - attempt 2: `port=3127`
  - attempt 3: `port=3128`
- classify 로그 기준 `/planning/reports`는 세 시도 모두 `200`으로 응답했다.

## 남은 리스크
- `Fast Refresh had to perform a full reload` 로그는 여전히 남아 있어 dev webpack 경로의 근본 원인이 완전히 사라졌다고 단정할 수는 없다.
- `pnpm build` 는 이번 라운드에서 확인을 끝내지 못했다.
  - [blocked] 별도 `next build --webpack` 프로세스가 `.next/lock` 을 잡고 있어 새 빌드 검증을 안전하게 다시 시작하지 않았다.
- `src/app/planning/reports/page.tsx`, `src/components/PlanningReportsDashboardClient.tsx`, `src/components/PlanningRunsClient.tsx`, `playwright.config.ts` 는 이미 다른 in-progress 수정이 함께 있는 dirty 파일이라 후속 병합 시 주의가 필요하다.

## 다음 라운드 우선순위
1. `pnpm build` 를 clean lock 상태에서 다시 확인해 route/build 회귀를 닫는다.
2. 필요하면 `pnpm e2e:parallel:classify -- --runs=5 --mode=development --skip-build --dev-port-base=3136` 로 반복도를 더 올려 dev flake 잔존 여부를 본다.
3. full reload 로그가 계속 남으면 `planning`/`dart` 초기 compile fan-out를 더 줄일 지점을 다시 좁힌다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
