# 2026-03-11 reports dev runtime fanout reduction

## 수정 대상 파일
- `src/app/planning/reports/page.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/PlanningRunsClient.tsx`

## 변경 이유
- dev parallel classify PASS 로그에도 `/planning/reports 500`, `Fast Refresh had to perform a full reload`, `__webpack_modules__[moduleId] is not a function` 흔적이 남았다.
- `/planning/runs`에서 보이는 리포트 링크와 `/planning/reports`의 서버 초기 scope가 dev compile fan-out를 키우는 축으로 보였다.

## 무엇이 바뀌었는지
- `/planning/reports`는 dev에서 서버 초기 run scope를 만들지 않고 client fetch로 바로 넘기도록 줄였다.
- `/planning/reports` 화면의 상단 이동 링크, 빈 상태 CTA, 상세 리포트 링크에 `prefetch={false}`를 넣었다.
- `/planning/runs`의 대시보드/리포트 진입 링크에도 `prefetch={false}`를 넣어 dev에서 보이는 링크의 선행 compile을 줄였다.

## 검증 명령
- `pnpm exec eslint src/app/planning/reports/page.tsx src/components/PlanningReportsDashboardClient.tsx src/components/PlanningRunsClient.tsx`
- `pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts tests/e2e/flow-planner-to-history.spec.ts --workers=1`
- `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3276`
- `pnpm build`

## 결과
- eslint PASS
- 대상 Playwright PASS
- dev classify `pass=3/3`
- `pnpm build` PASS

## 남은 리스크
- `Fast Refresh had to perform a full reload` 로그는 여전히 간헐적으로 남는다.
- 첫 classify attempt에서는 `__webpack_modules__[moduleId] is not a function` 로그가 한 번 보였지만, 같은 attempt 포함 최종 결과는 PASS였고 이후 2회에서는 재현되지 않았다.
- 이번 라운드에서는 `/planning/reports 500`은 재현되지 않았고, reports 진입 실패는 닫힌 것으로 본다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
