# 2026-03-11 reports/runs flake round

## 1. 무엇이 바뀌었는지
1. /planning/reports는 큰 client 대시보드를 PlanningReportsDashboardBoundary 뒤로 분리해 server render 경로 부담을 줄였다.
2. src/app/planning/reports/page.tsx는 초기 run scope/fallback 로직을 유지한 채 새 boundary를 사용하도록 연결됐다.
3. PlanningRunsClient는 selected run의 Action Center 자동 로드를 250ms 지연시키고 requestId 보호를 유지하도록 정리됐다.
4. PlanningRunsClient는 loadSelectedActionCenterRef를 추가해 effect가 ref.current를 호출하도록 바뀌었고 react-hooks/exhaustive-deps 경고를 제거했다.

## 2. 실행/검증 명령
- pnpm test tests/planning/reports/runSelection.test.ts tests/planning-v2-api/report-contract-mode-route.test.ts : PASS
- pnpm exec eslint src/app/planning/reports/page.tsx src/components/PlanningReportsDashboardBoundary.tsx src/components/PlanningRunsClient.tsx : PASS
- pnpm e2e:rc : PASS
- pnpm exec eslint src/components/PlanningRunsClient.tsx : PASS
- pnpm build : [검증 필요] .next/lock 및 잔류 next build 프로세스 충돌로 완료 확인 실패
- pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3116 : [blocked] listen EPERM

## 3. 남은 리스크와 엣지케이스
- dev 병렬 환경의 __webpack_modules__[moduleId] is not a function 자체가 근본 해결된 것은 아니다. 이번 수정은 /planning/reports 진입과 Action Center 초기 fan-out를 줄이는 완화다.
- pnpm build는 clean 상태 완료 로그를 아직 다시 확보하지 못했다. 앱 회귀가 아니라 환경/lock 문제로 보이지만 build PASS로 재확인 필요하다.
- 병렬 classify는 이번 수정 후 코드 회귀 대신 포트 bind EPERM에 막혀 재분류를 끝내지 못했다.
- PlanningRunsClient는 현재 run 선택이 빠르게 바뀌는 경우 stale 응답 무시를 유지하지만, 느린 단건 API가 반복되면 UX 지연이 여전히 보일 수 있다.

## 4. 다음 라운드 우선순위
1. clean 환경에서 pnpm build를 다시 끝까지 통과시켜 build gate를 회복한다.
2. 포트 bind 가능한 환경에서 pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build를 다시 돌려 dev-only flake 감소 여부를 확인한다.
3. 필요하면 /planning/reports와 /planning/runs의 남은 초기 API fan-out를 trace 기준으로 한 번 더 줄인다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
