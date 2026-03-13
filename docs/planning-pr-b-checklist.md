# PR-B Checklist — Remove planning client/report fallback paths

## 목적

PR-A 이후 남아있는 fallback 경로를 제거해 planning 계약을 `engine` + `engineSchemaVersion` 단일 경로로 고정한다.

대상 fallback:

- `getEngineEnvelope()` fallback
- `normalizePlanningResponse()` fallback
- report contract fallback

## 범위

대상 변경:

- [x] planning 클라이언트 helper fallback 제거
- [x] API 응답 정규화 fallback 제거
- [x] report legacy fallback 제거
- [x] 관련 테스트/fixture를 단일 계약 기준으로 정리

## 비범위

이번 PR에서 하지 않는 것:

- [ ] `engineSchemaVersion` 변경
- [ ] run storage 구조 재설계
- [ ] planning 정책/수치 로직 변경
- [ ] UI 문구/디자인 개편

## 클라이언트 변경 체크리스트

- [x] `getEngineEnvelope()`가 fallback 없이 `data.engine`만 사용
- [x] `normalizePlanningResponse()`에서 legacy shape 흡수 제거
- [x] stale cache 처리 분기에서 legacy 필드 의존 제거
- [ ] 화면(stage/action/debt/report)에서 `engine.*`만 참조

## report 변경 체크리스트

- [x] report route가 `ReportInputContract`를 기본 경로로 사용
- [ ] report builder/viewModel이 contract 입력만 소비
- [x] legacy run fallback 제거 또는 명시적 차단 처리
- [ ] planning/simulate/report 동일 run 결과 일치 확인

## 테스트/fixture 체크리스트

- [x] fallback 관련 테스트를 제거 또는 단일 계약 검증으로 전환
- [x] exact match 테스트는 새 계약 기준으로 정리
- [x] `planning:v2:engine:guard` 통과
- [x] `planner:deprecated:guard` 통과
- [x] `typecheck:planning` 통과
- [x] 관련 vitest 통과
- [x] 관련 eslint 통과

## 운영 게이트 확인

공통 운영 게이트는 PR-A와 동일한 문구/기준을 사용한다.

- [ ] 공통 게이트 확인: `docs/planning-pr-a-checklist.md`
- [ ] fallback 관찰 규칙 확인: `docs/runbook.md`의 `planning fallback 관찰 (P4)`

## 배포 후 모니터링

- [ ] `/ops/metrics`에서 fallback 카운터 재증가 없는지 확인
- [ ] planning 주요 화면(stage/action/debt/report) 정상 확인
- [ ] report export.html / report.pdf / run report 경로 정상 확인

## 롤백 조건

- [ ] fallback 카운터 재증가
- [ ] 화면에서 stage/decision 표기 누락
- [ ] report 생성 실패 증가
- [ ] 응답/계약 mismatch 재발

## PR 완료 기준

- [x] planning 클라이언트/리포트에서 fallback 경로 제거 완료
- [x] 단일 계약(`engine` + `engineSchemaVersion`)만 사용
- [x] 테스트/fixture 정리 완료
- [ ] 운영 모니터링 이상 없음

## PR 본문 템플릿

### PR 제목

`planning: remove client/report fallback and clean up related fixtures and tests after P4 observation`

### PR 설명

`planning-compatibility-exit.md` 기준으로 PR-B를 수행한다.

이번 PR은 P4 관찰 종료 이후 client/report fallback을 제거하고, 이에 맞는 fixture 및 test를 정리하는 데 한정한다.

PR-A에서 서버 응답 및 캐시 응답의 legacy top-level 필드 제거가 적용되었고, 본 PR에서는 더 이상 필요하지 않은 클라이언트 fallback 경로를 제거한다.

이번 PR에는 서버 응답 계약 변경이나 추가 호환성 게이트 변경을 포함하지 않는다.

관련 fixture 및 test는 fallback 제거 이후의 기대 동작에 맞게 정리한다.

### 검증

- client/report 경로에서 fallback 없이 정상 동작 확인
- 관련 fixture 정리 반영 확인
- 관련 test 갱신 및 통과 확인
- 필요 시 `pnpm typecheck:planning` 실행 결과 기록
- 필요 시 planning/report 주요 경로 수동 확인 결과 기록

### 운영 게이트

본 PR은 `runbook.md`의 planning fallback 관찰(P4) 기준 충족 이후에만 진행한다.

staging 3일, production 7일 관찰 중 치명 이슈가 없음을 전제로 한다.

배포 후 `/ops/metrics`, planning 주요 화면, report 경로를 최종 확인한다.

## 실행 순서 요약

1. PR-A 운영 게이트 충족 여부 확인 (문구/기준은 PR-A와 동일)
2. PR-B에서 client/report fallback 제거 및 테스트/fixture 동시 정리
3. 배포 후 fallback 카운터/화면/리포트 경로 모니터링

## 검증 실행 기록

- 실행 명령:
  - `pnpm -C finance test` (full suite)
  - `pnpm -C finance release:verify`
  - `pnpm -C finance test tests/planning/components/interpretationGuide.test.tsx tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning-v2/reportInputContract.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning-v2-api/report-contract-mode-route.test.ts tests/schemas-recommend-profile.test.ts tests/saved-runs-store.test.ts tests/recommend-unified-vs-legacy.test.ts`
  - `pnpm -C finance test tests/recommend-api.test.ts tests/schemas-recommend-profile.test.ts tests/saved-runs-store.test.ts`
  - `pnpm -C finance test tests/planning-v2-api/simulate-route.test.ts tests/planning-v2-api/actions-route.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2-api/monte-carlo-route.test.ts tests/planning-v2-api/runs-report-route.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/planning-v2-api/runs-report-pdf-route.test.ts`
  - `pnpm -C finance planning:v2:engine:guard`
  - `pnpm -C finance planner:deprecated:guard`
  - `pnpm -C finance typecheck:planning`
  - `pnpm -C finance planning:v2:guard`
  - `pnpm -C finance planning:v2:compat`
  - `pnpm -C finance planning:v2:regress`
  - `pnpm -C finance exec eslint src/lib/planning/reports/reportInputContract.ts src/app/api/planning/v2/simulate/route.ts src/app/api/planning/v2/actions/route.ts src/app/api/planning/v2/scenarios/route.ts src/app/api/planning/v2/monte-carlo/route.ts src/app/api/recommend/route.ts src/app/recommend/page.tsx src/components/PlanningReportDetailClient.tsx src/components/PlanningReportsClient.tsx src/components/PlanningReportsDashboardClient.tsx src/components/PlanningReportsPrototypeClient.tsx src/components/PlanningRunsClient.tsx src/components/PlanningWorkspaceClient.tsx src/app/planning/reports/_lib/reportViewModel.ts src/app/planning/reports/_components/ReportDashboard.tsx`
- 실행 결과:
  - `pnpm test` full suite PASS (`579 files / 1593 tests`).
  - `release:verify` PASS (`planning:ssot:check` advisory는 WARN 기록, required gate 영향 없음).
  - 위 vitest 대상군은 모두 PASS.
  - `planning:v2:engine:guard`, `planner:deprecated:guard`, `typecheck:planning`, `planning:v2:guard`, `planning:v2:compat`, `planning:v2:regress` PASS.
  - 관련 ESLint는 warning만 존재하고 error 0으로 PASS(exit 0).
- 미실행 항목:
  - eslint 전체
- 미실행 사유:
  - 전체 eslint는 기존 브랜치 전역 warning 정리가 필요하여, 이번 변경 영향 파일 기준으로 우선 검증 수행.
- 추가 확인 사항:
  - `/report`는 `/planning/reports`로 강제 리다이렉트.
  - report contract는 strict-only(`outputs.resultDto`, `outputs.engine`)로 고정.
- 현재 상태 한 줄 정리:
  - PR-B 핵심 fallback 제거와 주요 게이트(guard/typecheck/compat/regress) 검증까지 완료.
