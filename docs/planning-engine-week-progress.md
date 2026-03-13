# Planning Engine Week Progress

Last updated: 2026-03-06

## 현재 상태

- 진행 중: `P0-2 engine orchestration` / `P1-2 UI 계산 제거 후속`
- 기준 문서: `docs/planning-engine-week-realignment.md`
- 현재 초점:
  - workspace compat/normalization 경계 추가 축소
  - runs orchestration 공통 runner 여지 점검
  - strict 전환 후보와 fallback 관찰성 유지

## 작업 로그

### Slice 1. Report VM canonical helper 도입

- 추가:
  - `src/app/planning/reports/_lib/reportViewModel.ts`
    - `buildReportVMFromRun()`
- 전환:
  - `src/components/PlanningReportDetailClient.tsx`
  - `src/components/PlanningReportsDashboardClient.tsx`
- 목적:
  - report UI가 `run -> ReportInputContract -> ReportVM` 경로를 공통으로 사용하게 정리

### Slice 2. Report contract mode 도입

- 추가:
  - `src/lib/planning/reports/reportInputContract.ts`
    - `ReportContractMode`
    - `getReportInputContractOptions()`
- 전환:
  - `src/app/api/planning/v2/runs/[id]/report/route.ts`
  - `src/app/api/planning/v2/runs/[id]/report.pdf/route.ts`
  - `src/app/api/planning/reports/[runId]/export.html/route.ts`
- 목적:
  - route별로 흩어진 legacy fallback 옵션을 `compat/strict` 모드로 수렴

### Slice 3. Standalone report route helper + canonical DTO helper

- 추가:
  - `src/app/planning/reports/_lib/standaloneReportArtifacts.ts`
  - `src/app/planning/reports/_lib/reportViewModel.ts`
    - `resolveReportResultDtoFromRun()`
- 전환 대상:
  - `src/app/api/planning/v2/runs/[id]/report/route.ts`
  - `src/app/api/planning/v2/runs/[id]/report.pdf/route.ts`
  - `src/app/api/planning/reports/[runId]/export.html/route.ts`
  - `src/components/PlanningReportsClient.tsx`
  - `src/components/PlanningReportsDashboardClient.tsx`
  - `src/app/planning/reports/_lib/runReportHubRows.ts`
- 목적:
  - route 3개의 HTML 조립 중복 제거
  - report 화면 계열이 직접 `buildResultDtoV1FromRunRecord()`를 호출하지 않고 report contract semantics를 공유하게 정리

### Slice 4. Canonical DTO resolver를 lib/report contract로 승격

- 추가:
  - `src/lib/planning/reports/reportInputContract.ts`
    - `resolveReportResultDtoFromRun()`
- 전환:
  - `src/app/planning/reports/_lib/reportViewModel.ts`
  - `src/components/PlanningRunsClient.tsx`
  - `src/lib/planning/reports/storage.ts`
- 목적:
  - report canonical DTO 해석 규칙을 app helper에만 두지 않고 lib 계층으로 끌어올려 server-side report storage와 runs UI도 같은 규칙을 사용하게 정리

### Slice 5. 인접 전이층의 runtime fallback 공통화

- 전환:
  - `src/app/api/planning/v2/runs/[id]/export/route.ts`
  - `src/lib/planning/store/runActionStore.ts`
  - `src/lib/planning/store/engineEnvelopeMigration.ts`
- 목적:
  - report migration에서 정의한 canonical DTO 해석 규칙을 인접 전이층에도 적용
  - fallback 정책 변경 지점을 `reportInputContract` 쪽으로 더 모음

### Slice 6. Report contract fallback source 명시화

- 추가:
  - `src/lib/planning/reports/reportInputContract.ts`
    - `ReportContractFallbackSource`
    - `contract.fallbacks`
- 테스트 보강:
  - `tests/planning-v2/reportInputContract.test.ts`
    - `resultDto` rebuild fallback 추적 케이스 추가
- 목적:
  - compat 모드에서 어떤 fallback이 실제로 사용됐는지 타입 차원에서 드러내기
  - strict 전환 전 관찰/계측 근거를 더 명확히 남기기

### Slice 7. Report VM에 contract fallback metadata 전달

- 추가:
  - `src/app/planning/reports/_lib/reportViewModel.ts`
    - `vm.contract.engineSchemaVersion`
    - `vm.contract.fallbacks`
- 테스트 보강:
  - `tests/planning-v2/reportViewModel.test.ts`
- 목적:
  - report detail/debug surface가 contract fallback 정보를 다시 계산 없이 바로 참조할 수 있게 정리

### Slice 8. PlanningReportsClient를 report VM 중심으로 축소

- 전환:
  - `src/components/PlanningReportsClient.tsx`
- 내용:
  - summary/warnings/timeline/monte/debt 요약을 `buildReportVMFromRun()` 결과 기준으로 재조립
  - 고급 보기 JSON에 `report contract` 섹션 추가
  - 기준정보 섹션에 `engine schema`, `compat fallback` 표시 추가
- 목적:
  - reports hub가 다시 mini-VM을 따로 만들지 않고 report VM을 공통 소스로 사용하게 정리

### Slice 9. Planning workspace의 canonical/compat path 분리 명시

- 전환:
  - `src/components/PlanningWorkspaceClient.tsx`
- 내용:
  - `toCombinedRunResultFromRecord()`에 canonical persisted output 경로 주석 추가
  - `buildCompatResultDtoFromRunResult()` helper 분리
- 목적:
  - workspace 내부에서 persisted resultDto와 compat rebuild path를 코드 레벨에서 구분

### Slice 10. Report detail 화면에도 fallback metadata 노출

- 전환:
  - `src/components/PlanningReportDetailClient.tsx`
- 내용:
  - detail header에 `engine schema`, `compat fallback` 표시 추가
- 목적:
  - reports hub 외 상세 화면에서도 compat 경로 사용 여부를 바로 확인할 수 있게 정리

### Slice 11. Engine route response helper 도입

- 추가:
  - `src/lib/planning/engine/index.ts`
    - `attachEngineResponse()`
- 전환:
  - `src/app/api/planning/v2/simulate/route.ts`
  - `src/app/api/planning/v2/actions/route.ts`
  - `src/app/api/planning/v2/scenarios/route.ts`
  - `src/app/api/planning/v2/debt-strategy/route.ts`
  - `src/app/api/planning/v2/optimize/route.ts`
  - `src/app/api/planning/v2/runs/route.ts`
- 목적:
  - route별로 흩어진 `createEngineEnvelope + engineSchemaVersion` 조립 패턴을 공통 helper로 수렴
  - `P0-2 engine orchestration`의 첫 단계로 response wiring을 먼저 정리

### Slice 12. Stage 정책 매핑 문서화

- 추가:
  - `docs/planning-stage-policy-mapping.md`
- 목적:
  - core/v2 warning/action/report 해석과 engine stage/status/decision의 현재 대응을 문서로 고정
  - 이번 주 기준의 “정책 충돌 없음” 범위를 명확히 하기

### Slice 13. Legacy `/report` 경계 명시

- 전환:
  - `src/app/report/page.tsx`
  - `src/components/ReportClient.tsx`
  - `src/lib/report/reportBuilder.ts`
  - `docs/planner-deprecated-cleanup.md`
- 내용:
  - page metadata를 `Legacy Report`로 명시
  - legacy route 배너 추가
  - `reportBuilder`에 deprecated header 추가
  - deprecated cleanup 문서에 legacy `/report` 경계 추가
- 목적:
  - planning 공식 report와 legacy `/report`를 사용자/개발자 모두에게 명확히 분리

### Slice 14. UI 계산 제거 후보 문서화

- 추가:
  - `docs/planning-ui-calculation-removal-candidates.md`
- 내용:
  - `PlanningReportsClient`의 action/scenario/monte parser 잔존 지점 식별
  - `PlanningReportsDashboardClient`의 goal/action/disclosure 재해석 지점 식별
  - `PlanningWorkspaceClient`의 compat rebuild/helper 성격 계산 지점 식별
  - recommend profile 계약이 planning stage 입력을 아직 담지 못한다는 제약 문서화
- 목적:
  - 이번 주에 전부 지우지 못한 UI 내부 계산을 다음 스프린트 작업 대상으로 고정
  - 정책 계산과 표현 계산의 경계를 문서로 먼저 고정

### Slice 15. Legacy `/report` 진입 링크 표시 강화

- 전환:
  - `src/components/home/ServiceLinks.tsx`
  - `src/components/RecommendHistoryClient.tsx`
  - `docs/planner-deprecated-cleanup.md`
- 내용:
  - 홈 quick link의 `/report`를 `리포트 (legacy)`로 표시
  - recommend history의 `/report` 링크를 `legacy 리포트`로 표시
  - recommend history 상단에 planning 공식 report와 legacy `/report` 차이를 설명하는 문구 추가
- 목적:
  - report 제품 경계가 실제 진입 링크에서도 드러나게 정리
  - 사용자가 planning 공식 report와 legacy `/report`를 혼동하지 않게 하기

### Slice 16. `profile -> engine` runner helper 수렴

- 추가:
  - `src/lib/planning/server/v2/toEngineInput.ts`
    - `runPlanningEngineFromProfile()`
- 전환:
  - `src/app/api/planning/v2/simulate/route.ts`
  - `src/app/api/planning/v2/actions/route.ts`
  - `src/app/api/planning/v2/scenarios/route.ts`
  - `src/app/api/planning/v2/optimize/route.ts`
  - `src/app/api/planning/v2/debt-strategy/route.ts`
  - `src/app/api/planning/v2/runs/route.ts`
- 목적:
  - route마다 반복되던 `toEngineInputFromProfile(profile) -> runPlanningEngine(...)` 패턴을 server/v2 helper로 수렴
  - `P0-2 engine orchestration`의 다음 단계로 engine entry 호출부를 더 좁힘

### Slice 17. 공식 경로 아키텍처 메모 고정

- 전환:
  - `docs/planning-v2-architecture.md`
- 내용:
  - 공식 계산 SSOT, 공식 engine 진입, 공식 report 경로를 한 섹션으로 명시
  - 신규 계산 추가 금지 경로와 legacy 경로를 문서로 고정
  - recommend가 planning stage 입력 계약 없이 대체 판정을 만들지 않는 원칙 명시
- 목적:
  - Day 1의 "공식 경로 선언" 항목을 별도 섹션으로 완료
  - 이후 신규 PR에서 계산 추가 위치가 모호해지지 않게 하기

### Slice 18. Report VM에 report hub 파생 row 수렴

- 전환:
  - `src/app/planning/reports/_lib/reportViewModel.ts`
  - `src/components/PlanningReportsClient.tsx`
  - `tests/planning-v2/reportViewModel.test.ts`
- 내용:
  - `assumptionsLines`, `actionRows`, `scenarioRows`, `monteProbabilityRows`, `montePercentileRows`, `debtSummaryRows`를 `ReportVM`에 추가
  - reports hub가 action/scenario/monte/debt parser를 client 내부에서 직접 만들지 않고 report VM을 소비하게 정리
- 목적:
  - `P1-2 UI 계산 제거 후보` 중 reports hub의 1순위 parser를 실제 코드에서 제거
  - report 해석 규칙을 client보다 report VM helper에 더 모으기

### Slice 19. Dashboard goal/action/disclosure를 VM 기준으로 전환

- 전환:
  - `src/components/PlanningReportsDashboardClient.tsx`
  - `tests/planning/reports/reportDashboardOverrides.test.tsx`
- 내용:
  - dashboard의 `toGoals()`, `toTopActions()`, `parseNormalizationDisclosure()` 직접 파싱 제거
  - `selectedRunVm.goalsTable`, `selectedRunVm.actionRows`, `selectedRunVm.normalization` 기준으로 표시
- 목적:
  - dashboard도 reports hub와 같은 report VM semantics를 공유하게 정리
  - dashboard의 `run.outputs.*` 직접 해석 범위를 더 줄이기

### Slice 20. Normalization disclosure parser 공통화

- 전환:
  - `src/lib/planning/v2/normalizationDisclosure.ts`
  - `src/app/planning/reports/_lib/reportViewModel.ts`
  - `src/components/PlanningWorkspaceClient.tsx`
- 내용:
  - `parseProfileNormalizationDisclosure()` 공통 helper 추가
  - report VM과 workspace가 같은 normalization disclosure parser를 공유하도록 정리
- 목적:
  - report/workspace 사이의 transition parser 중복 제거
  - `P1-2 UI 계산 제거 후보` 중 normalization 파서 중복을 실제 코드에서 축소

### Slice 21. Run outputs/resultDto 조립부를 server helper로 분리

- 추가:
  - `src/lib/planning/server/v2/runArtifacts.ts`
    - `buildPlanningRunArtifacts()`
- 전환:
  - `src/app/api/planning/v2/runs/route.ts`
- 내용:
  - `simulate/scenarios/monte/actions/debt -> outputs/resultDto` 조립 책임을 route 바깥 helper로 분리
  - route는 pipeline 실행과 저장 흐름에 더 집중하고, artifacts 조립은 server/v2 helper가 담당하도록 정리
- 목적:
  - `P0-2 engine orchestration`에서 가장 큰 단일 route인 `runs/route.ts`의 조립 책임 축소
  - engine/resultDto SSOT 형성 지점을 helper로 고정

### Slice 22. Workspace compat rebuild helper를 lib migration helper로 격리

- 추가:
  - `src/lib/planning/v2/compatResultDto.ts`
    - `rebuildResultDtoFromCombinedRunResultForCompat()`
  - `src/lib/planning/v2/resultSummary.ts`
    - `buildResultSummaryMetrics()`
- 전환:
  - `src/components/PlanningWorkspaceClient.tsx`
  - `src/app/planning/reports/_lib/reportViewModel.ts`
- 내용:
  - workspace의 compat resultDto rebuild를 lib migration helper로 이동
  - report VM과 workspace가 summary/evidence 계산도 공통 helper를 공유하도록 정리
- 목적:
  - `P1-2 UI 계산 제거 후보` 중 workspace compat 경로를 더 명시적으로 migration helper로 격리
  - report/workspace의 summary metric 공식이 다시 벌어지지 않게 하기

## 검증 상태

- 실행 완료:
  - `pnpm test tests/planning-v2/reportViewModel.test.ts`
    - 결과: 통과
  - `pnpm test tests/planning-v2/reportInputContract.test.ts`
    - 결과: 통과
  - `pnpm test tests/planning-v2-api/reports-export-html-route.test.ts`
    - 결과: 통과
  - `pnpm test tests/planning-v2-api/runs-report-pdf-route.test.ts`
    - 결과: 통과
  - `pnpm typecheck:planning`
    - 1차 결과: `src/app/planning/reports/_lib/runReportHubRows.ts`의 `asRecord()` 누락으로 실패
    - 조치: helper 복구
    - 최종 결과: 통과
  - `pnpm test tests/planning-reports/storage.test.ts`
    - 결과: 통과
  - `pnpm test tests/planning/v2/runActionStore.test.ts`
    - 결과: 통과
  - `pnpm test tests/planning-v2-api/runs-export-route.test.ts`
    - 결과: 통과
  - `pnpm test tests/planning-v2/reportInputContract.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/planning-reports/storage.test.ts`
    - 결과: 통과
  - `pnpm test tests/planning-v2/reportInputContract.test.ts tests/planning-v2/reportViewModel.test.ts`
    - 1차 결과: `reportViewModel` fixture가 `outputs.resultDto.rebuild` fallback까지 발생하는데 기대값이 누락되어 실패
    - 조치: 기대값을 실제 fixture 상태에 맞게 수정
    - 최종 결과: 통과
  - `pnpm test tests/planning-v2/reportInputContract.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning-reports/storage.test.ts tests/planning-v2-api/reports-export-html-route.test.ts`
    - 결과: 통과
  - `pnpm test tests/planning-v2-api/simulate-route.test.ts tests/planning-v2-api/actions-route.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2-api/debt-strategy-route.test.ts tests/planning-v2-api/optimize-route.test.ts tests/planning-store.test.ts`
    - 결과: 통과
  - `pnpm test tests/report-builder.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning-v2/reportInputContract.test.ts`
    - 결과: 통과
  - `pnpm test tests/planning-v2/reportViewModel.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx`
    - 결과: 통과
  - `pnpm typecheck:planning`
    - 결과: 통과
  - `pnpm typecheck:planning`
    - 1차 결과: `PlanningWorkspaceClient.tsx`에 기존 `parseNormalizationDisclosure()` 호출이 남아 실패
    - 조치: `parseProfileNormalizationDisclosure()`로 전부 치환
    - 최종 결과: 통과
  - `pnpm test tests/planning-v2-api/persistence-routes.test.ts tests/planning-v2-api/runs-report-route.test.ts tests/planning-v2-api/reports-route.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/planning-v2-api/run-blob-route.test.ts tests/planning-v2-api/share-report-route.test.ts tests/planning-v2-api/run-action-progress-route.test.ts`
    - 결과: 통과
    - 참고: audit log temp rename stderr가 1회 출력됐지만 테스트는 통과했고 기존 로컬 `.data` 환경 차이에서 발생한 부수 로그였다.
  - `pnpm test tests/planning-v2/reportViewModel.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning-store.test.ts`
    - 결과: 통과

## 이번 slice 결과

- report route 3개가 같은 standalone report 조립 helper를 사용하게 정리됨
- report 화면 계열 일부가 직접 `buildResultDtoV1FromRunRecord()`를 호출하지 않고 `resolveReportResultDtoFromRun()`을 경유하게 정리됨
- report canonical DTO 해석 규칙이 lib 계층으로 올라가면서 report storage와 runs 화면도 같은 경로를 사용하게 정리됨
- report 인접 전이층(`runs export`, `runActionStore`, `engineEnvelopeMigration`)도 같은 canonical DTO resolver를 사용하게 정리됨
- report contract가 fallback 발생 위치를 `fallbacks` 배열로 명시적으로 드러내게 정리됨
- report VM이 contract fallback metadata를 직접 들고 있게 정리됨
- reports hub/detail 화면에서 compat fallback을 직접 볼 수 있게 정리됨
- workspace 내부에서도 canonical persisted path와 compat rebuild path가 코드상 분리됨
- planning v2 route들이 동일한 engine response helper를 쓰기 시작함
- stage 정책 매핑이 문서로 고정됨
- legacy `/report`가 공식 planning report와 다른 경로라는 점이 코드/문서/UI에 명시됨
- UI 내부 계산 제거 후보와 recommend adapter 제약이 문서로 고정됨
- 홈/추천 히스토리의 `/report` 진입이 legacy 경로라는 점이 UI에 직접 표시됨
- planning v2 route들이 `profile -> engine` 실행 helper도 공통으로 쓰기 시작함
- 공식 계산/engine/report 경로가 아키텍처 문서에 명시적으로 고정됨
- reports hub의 action/scenario/monte/debt 파생 row가 report VM으로 이동함
- reports dashboard의 goal/action/disclosure 재해석이 report VM 기준으로 정리됨
- report VM과 workspace가 normalization disclosure parser를 공유하게 정리됨
- `runs/route.ts`의 outputs/resultDto 조립이 server helper로 분리됨
- workspace compat rebuild가 lib migration helper로 이동함
- report VM과 workspace가 summary/evidence 계산 helper도 공유하게 정리됨
- `/docs`에 작업 추적 문서가 생겨 이후 slice 결과를 누적 기록할 기반이 마련됨

## Strict 전환 후보 인벤토리

### 현재 fallback source 타입

- `outputs.resultDto.rebuild`
- `outputs.simulate.engine`
- `outputs.simulate.legacy`
- `engine.resultDtoFallback`

### 현재 compat route 사용처

- `src/app/api/planning/v2/runs/[id]/report/route.ts`
- `src/app/api/planning/v2/runs/[id]/report.pdf/route.ts`
- `src/app/api/planning/reports/[runId]/export.html/route.ts`

### 현재 테스트 fixture 기준 strict blocker 후보

- `tests/planning-v2/reportInputContract.test.ts`
  - `createRunRecord(false)`
  - `createRunRecord(false, false)`
- `tests/planning-v2/reportViewModel.test.ts`
  - `sampleRunWithWarnings(...)`

### 전환 판단 기준

- report detail/hub에서 `compat fallback: 없음`인 run이 기본 사례가 되어야 함
- `strict` 모드에서 깨지는 fixture/run이 의도된 legacy coverage만 남아야 함
- runtime 관찰 기준은 `contract.fallbacks`와 `legacyReportContractFallbackCount`를 함께 본다

## 남은 항목

- `strict` report contract 전환:
  - 현재는 compat fallback 관찰 단계다.
  - `runbook.md` 기준 관찰 종료 전에는 코드로 닫을 수 없다.
- `/recommend` 연결:
  - 현재 `UserRecommendProfile`에 planning stage 입력(`monthlyIncome`, `monthlyExpense`, `liquidAssets`, `debtBalance`)이 없다.
  - 입력 계약 확장 전에는 실제 engine stage 재사용을 구현할 수 없다.

## 현재 판단

- `P0-1 report 단일화`: 실질적으로 완료에 가까움
- `P0-2 engine orchestration`: response wiring + `profile -> engine` helper + run artifacts helper 분리까지 완료
- `Day 1 공식 경로 선언`: 문서 기준 완료
- `P0-3 stage 정책 매핑`: 문서 기준 완료
- `P0-4 legacy planner/report 차단`: legacy 진입 링크 표기까지 반영
- `P1-2 UI 계산 제거 후보 정리`: reports hub/dashboard/workspace compat helper 기준 1차 코드 반영 완료
- `P1-1 recommendation 연결`: 입력 계약 부재로 이번 주 범위에서는 설계 전제 확인까지 완료
- 이번 주 남은 실질 작업:
  - 없음
- 다음 스프린트/운영 게이트 이후 작업:
  - strict fallback 종료
  - recommend profile 계약 확장 후 engine adapter 도입
