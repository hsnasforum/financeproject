# 2026-03-11 reports/runs fallback 및 dev runtime 정리

## 변경 이유
- `/planning/reports` 초기 scope 로드 실패 시 requested run 보존이 fallback 경로에서 다시 약해질 수 있었다.
- `PlanningRunsClient` 는 실제 목록에 없는 `selectedRunId` 에 대해서도 Action Center 로드를 시도해 늦게 도착한 응답이 현재 선택 상태를 덮어쓸 여지가 있었다.
- Playwright dev webServer 는 raw `next dev --webpack --hostname 127.0.0.1` 경로를 타고 있어 현재 환경에서 bind 실패(`EPERM`)가 재현됐다.

## 이번 변경
1. `src/lib/planning/reports/runSelection.ts` 에 fallback scope helper 를 추가해 requested run lookup 을 한 번 더 재시도하고, fallback scope 에서도 requested run 을 병합하도록 정리했다.
2. `src/app/planning/reports/page.tsx`, `src/app/planning/reports/prototype/page.tsx` 는 fallback 시 새 helper 를 사용하도록 바꿨다.
3. `src/components/PlanningRunsClient.tsx` 는 Action Center debounce effect 를 `selectedRunId` 대신 실제 `selectedRun` 기준으로 바꿔, 현재 목록에 없는 run id 로 API를 치지 않게 했다.
4. `playwright.config.ts` 의 development webServer 는 `scripts/next_dev_safe.mjs --webpack --host 0.0.0.0 --port ... --strict-port` 경로를 사용하도록 바꿨다.
5. `scripts/next_dev_safe.mjs` 에 `--strict-port` 옵션을 추가했다.
6. `tests/planning/reports/runSelection.test.ts` 에 fallback helper 테스트 2건을 추가했다.

## 검증
1. `pnpm test tests/planning/reports/runSelection.test.ts tests/planning-v2-api/report-contract-mode-route.test.ts tests/planning-v2-api/run-action-progress-route.test.ts`
2. `pnpm lint`
3. `pnpm build`
4. [검증 필요] `pnpm e2e:rc`

## 검증 결과
- 단위/계약 테스트 PASS
- `pnpm lint` PASS
- `pnpm build` PASS
- `pnpm e2e:rc` 는 현재 CLI 실행 환경의 dev server bind 제한(`listen EPERM`) 때문에 완료하지 못했다. 외부 base URL 재사용과 같은 셸 내 server 기동 둘 다 현재 환경에서는 안정적이지 않았다.

## 남은 리스크
- 현재 환경에서는 Playwright dev server 자체가 포트 bind 제약을 받으므로, 새 webServer 경로의 실제 E2E 안정성은 로컬/CI에서 다시 확인해야 한다.
- `PlanningRunsClient` 의 Action Center race 는 한 축을 줄였지만, 다른 fetch(`profiles`, `runs`, `action-progress summary`) 에 대한 장기적인 병렬 부하 관찰은 더 필요하다.
- reports prototype/client 쪽 추가 fallback 보강이 더 필요한지는 병렬 E2E 재분류 결과를 다시 보고 판단해야 한다.

## 다음 라운드 우선순위
1. bind 제한이 없는 환경에서 `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build` 재실행
2. `pnpm e2e:rc` 와 reports/runs 관련 spec 재검증
3. 남아 있는 late state update 경고 출처를 `PlanningRunsClient`, `PlanningReportsDashboardClient`, `PlanningWorkspaceClient` 중심으로 추가 축약

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
