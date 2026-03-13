# 2026-03-11 reports/runs fallback hardening

## 변경 이유
- /planning/reports 와 /planning/runs 는 초기 로드 실패나 stale 응답이 섞일 때 빈 상태 또는 오류 상태로 쉽게 무너질 수 있었다.
- 병렬 E2E 분류는 현재 환경에서 loopback bind 자체가 막혀 있어, flake 자체보다 실행 환경 차단을 먼저 드러내는 편이 안전하다.

## 이번 변경
1. `src/lib/planning/reports/runSelection.ts` 에 requested run 기반 scope 조립 helper를 추가해 client fallback이 requested run과 profile 범위를 같이 유지하게 했다.
2. `src/components/PlanningReportsDashboardClient.tsx` 는 초기 scope 재조회 실패 시 requested run detail로 단일 fallback을 만들고, 실제 run 기준 profile 링크를 다시 계산하게 했다.
3. `src/components/PlanningRunsClient.tsx` 는 runs 재조회 실패 시 이전 목록을 유지하거나 selected run detail만 fallback으로 남기고, Action Center 재조회 실패 시 같은 run의 기존 상태를 유지하도록 보강했다.
4. 같은 `PlanningRunsClient` 에 request order guard와 `useEffectEvent` 정리를 넣어 stale 응답과 hook dependency 경고를 줄였다.
5. `scripts/e2e_parallel_flake_classify.mjs` 는 포트 bind preflight를 먼저 확인해 환경 차단을 `BLOCKED` 로 빠르게 보고하게 했다.
6. `tests/planning/reports/runSelection.test.ts` 에 requested run fallback scope 케이스를 추가했다.

## 검증
1. `pnpm test tests/planning/reports/runSelection.test.ts tests/planning-v2-api/run-detail-route-fallback.test.ts tests/planning-v2-api/run-action-progress-route.test.ts tests/planning-v2-api/run-route.test.ts tests/planning-v2-api/report-contract-mode-route.test.ts`
2. `pnpm lint`
3. `pnpm exec tsc --noEmit`
4. `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3116`
5. `pnpm build`

## 검증 결과
- 관련 unit/api 테스트 15건 PASS
- `pnpm lint` PASS
- `pnpm exec tsc --noEmit` PASS
- `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3116` 는 `listen EPERM` 으로 첫 시도에서 바로 `BLOCKED` 보고 후 exit 2
- `pnpm build` 는 `Compiled successfully in 2.0min` 뒤 `Running TypeScript ...` 다음 `ELIFECYCLE Command failed.` 만 남기고 종료되어 [blocked]

## 남은 리스크
- loopback bind가 막힌 현재 환경에서는 실제 browser E2E로 reports/runs 회복 경로를 확인하지 못했다.
- `pnpm build` 실패 원인이 이번 수정인지, 현재 dirty worktree 전체 영향인지 아직 분리되지 않았다.
- `PlanningReportsDashboardClient` 는 requested run fallback은 보강했지만, stale response order guard는 `runs` 쪽만큼 직접적이지 않다.

## 다음 라운드 우선순위
1. `pnpm build` 무메시지 실패를 단독으로 축약해 현재 수정 영향인지 전체 worktree 영향인지 분리
2. loopback 허용 환경에서 `pnpm e2e:rc` 또는 최소 runs/reports render 경로 재검증
3. 필요하면 `PlanningReportsDashboardClient` 에도 request-order guard 패턴 확대
4. runs/reports 선택 전환에 대한 컴포넌트 회귀 테스트 추가
5. .next lock 및 build 정체 재발 조건 정리

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
