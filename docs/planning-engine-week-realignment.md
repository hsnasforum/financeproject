# Planning Engine Week Realignment

Last updated: 2026-03-06

## 목적

현재 리포는 다음 4개 축이 동시에 존재한다.

- planning 계산 본체: `src/lib/planning/core/v2/*`
- planning API/저장/리포트 연결층: `src/app/api/planning/v2/*`, `src/lib/planning/reports/*`
- planning engine envelope/stage 전이층: `src/lib/planning/engine/*`
- legacy planner/recommend/report 경로: `src/lib/planner/*`, `src/app/recommend/*`, `src/components/ReportClient.tsx`

이번 주 목표는 새 기능 추가가 아니라 아래를 확정하는 것이다.

- `planning/core/v2`를 사실상 공식 계산 SSOT로 고정
- `runPlanningEngine()`를 stage/status 보조 함수에서 공식 엔진 진입점으로 승격
- planning report 경로를 `run -> resultDto -> report contract -> report VM` 단일 흐름으로 고정
- legacy planner/report/recommend 병렬 계산 경로를 신규 코드 금지 상태로 묶음

## 현재 판단

현재 진행 상태 업데이트:

- `P0-1 report 단일화`: route/UI/contract/fallback 관찰성까지 정리되어 거의 마감 단계
- `P0-2 engine orchestration`: `engine response helper` 도입으로 route response wiring 공통화 시작
- `P0-2 engine orchestration`: `runPlanningEngineFromProfile()` 도입으로 route entry 호출부도 일부 수렴
- `P0-2 engine orchestration`: `buildPlanningRunArtifacts()` 도입으로 run outputs/resultDto 조립부도 helper로 분리
- `P0-3 stage 정책 매핑`: `docs/planning-stage-policy-mapping.md` 기준으로 현재 대응표 문서화 완료
- `P0-4 legacy planner/report 차단`: legacy `/report` 경계가 코드/문서/UI에 명시됨
- `P1-2 UI 계산 제거 후보 정리`: reports hub/dashboard 1차 parser 이관까지 반영
- `P1-1 recommendation 연결`: 현재 recommend profile 계약으로는 planning stage 입력이 부족해 설계 전제 확인 단계

### 이미 된 것

- `runPlanningEngine()` 엔트리 존재
- `Stage`, `FinancialStatus`, `StageDecision` 타입 존재
- `determineFinancialStatus()` / `buildStageDecision()` 구현 및 테스트 존재
- `ReportInputContract` 존재
- planning API engine envelope 호환 계층 존재
- deprecated planner guard / engine guard / compatibility exit 문서 존재

### 아직 안 된 것

- `runPlanningEngine()`가 `planning/core/v2` 전체 orchestration entry는 아님
- `recommend`는 planning engine/resultDto를 재사용하지 않음
- planning report는 contract 기반으로 가지만 legacy fallback이 기본 허용 상태
- 구형 `/report`는 여전히 localStorage + recommend/planner snapshot 기반
- workspace와 일부 transition UI는 preview 성격 계산을 남겨두고 있음

## 이번 주 실제 작업 순서

### P0-1. Report 경로를 먼저 고정

이유:

- 지금 가장 큰 병렬 경로는 계산 자체보다 `/report` 이원화다.
- report를 먼저 단일화해야 이후 engine/resultDto 기준 회귀 검증이 가능하다.
- 사용자 체감 결과 불일치도 report에서 가장 쉽게 드러난다.

작업 목표:

- planning report 상세/HTML/PDF/export 경로를 모두 `ReportInputContract` 기준으로 통일
- `buildReportVM()` 직접 호출 경로를 contract 기반 호출로 몰기
- legacy fallback은 관찰 가능한 fallback-only 경로로 축소
- 구형 `/report`는 planning 공식 경로와 분리된 legacy route로 분류

### P0-2. Engine 엔트리를 core/v2 orchestration 쪽으로 확장

이유:

- 지금 `runPlanningEngine()`는 stage/status wrapper에 가깝다.
- API route별 계산 본체는 아직 `planningService.simulate`, `runScenarios`, `buildActions`, `computeDebtStrategy`에 흩어져 있다.
- 이걸 하나의 엔진 entry 아래에 모아야 “공식 엔진”이라고 부를 수 있다.

작업 목표:

- `runPlanningEngine()` 또는 새 engine runner가 `core/v2` 계산 orchestration을 감싸도록 정리
- route에서 `toEngineInput + runPlanningEngine + createEngineEnvelope` 패턴을 공통화
- `resultDto` 생성 입력도 engine result 기준으로 재정렬

### P0-3. Stage 판정과 기존 v2 정책 매핑

이유:

- 현재 stage 모델은 존재하지만 단순화되어 있다.
- 기존 v2의 warning/action/report 해석과 정책 의미가 아직 1:1로 매핑되지 않았다.

작업 목표:

- 기존 조건식과 새 stage/status/trace의 대응표 작성
- stage 판정 trace를 action/report 해석의 공통 근거로 쓰게 정리
- 경계값/예외 케이스 테스트 보강

### P0-4. Legacy planner/report 신규 진입 차단

이유:

- 이미 deprecated 표시는 있으나, 구형 `/report`와 planner 저장소가 살아 있어 신규 회귀 가능성이 남아 있다.
- 삭제보다 먼저 신규 진입 금지가 필요하다.

작업 목표:

- legacy planner/report 경로를 docs + guard + route 표시로 fallback-only/legacy-only 명시
- 신규 연결은 planning engine/resultDto/report contract 쪽으로만 허용

### P1-1. Recommendation 연결부 이관 시작

이유:

- `/recommend`는 아직 planning과 완전히 별도 시스템이다.
- 다만 이번 주 안에 완전 이관까지 가기보다, 최소한 stage/status/trace를 공유하는 어댑터를 놓는 것이 현실적이다.

작업 목표:

- recommend 결과 reason이 planning stage/status와 충돌하지 않도록 연결층 도입
- `scoreProducts`/`scoreBenefits` 자체를 지우기보다 입력 근거를 engine/result 쪽과 맞춤
- 이미 존재하는 `planningContext`는 context-only로 유지하고, stage/status/trace는 canonical planning result 없이 추정하지 않음
- 현재 `/api/recommend`는 `meta.planningLinkage`로 readiness만 노출하고, `stageInference: "disabled"` 상태를 명시해 stage/status/trace 미연결을 계약으로 고정함

### P1-2. UI 내부 계산 제거 후보 정리

이유:

- `PlanningWorkspaceClient`와 report client 계열에 파생 계산이 많이 남아 있다.
- 이번 주 안에 전부 제거하기보다, 정책 계산과 표현 파생값을 먼저 분리해야 한다.

작업 목표:

- 정책 계산 / 화면 표현 계산을 구분한 제거 목록 작성
- 다음 스프린트 제거 대상 확정

현재 상태:

- `docs/planning-ui-calculation-removal-candidates.md`에 1차 후보를 고정했다.
- reports hub/dashboard의 1차 parser 이관은 반영됐다.
- 남은 우선순위는 `PlanningWorkspaceClient`의 compat/normalization 경계 축소다.

## 파일 단위 실행 계획

### 1. Report 단일화

#### 1-1. Contract를 단일 진입점으로 고정

- `src/lib/planning/reports/reportInputContract.ts`
  - legacy fallback 분기를 `strict`/`fallback` 모드로 분리
  - 현재 기본값 `allowLegacyEngineFallback !== false`, `allowLegacyResultDtoFallback !== false`를 strict-first로 뒤집을 준비
  - fallback source enum을 문서화

#### 1-2. Report VM contract-first 전환

- `src/app/planning/reports/_lib/reportViewModel.ts`
  - `buildReportVMFromContract()`를 기본 경로로 선언
  - `buildReportVM()`는 legacy/helper 성격으로 다운그레이드
  - `buildResultDtoV1FromRunRecord()` fallback 호출 지점을 식별해 contract 경로 바깥으로 격리

#### 1-3. Report route 통합

- `src/app/api/planning/v2/runs/[id]/report/route.ts`
- `src/app/api/planning/v2/runs/[id]/report.pdf/route.ts`
- `src/app/api/planning/reports/[runId]/export.html/route.ts`
  - 세 route의 contract 생성 옵션을 공통화
  - strict mode 전환 가능한 형태로 정리
  - route별 중복 로직을 묶을 helper 후보 식별

#### 1-4. Report detail/dashboard 소비 정리

- `src/components/PlanningReportDetailClient.tsx`
  - `buildReportVM()` 직접 호출 제거
  - run fetch 후 contract 기반 VM 조립 경로로 교체
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/PlanningReportsClient.tsx`
  - `buildResultDtoV1FromRunRecord()` fallback 호출을 contract 또는 canonical DTO loader로 정리

#### 1-5. Legacy `/report` 격리

- `src/app/report/page.tsx`
- `src/components/ReportClient.tsx`
- `src/lib/report/reportBuilder.ts`
  - planning 공식 report와 완전히 분리된 legacy/report-v1 취급으로 명시
  - 새 planning report와 동일 계열로 보이지 않게 route/문서/주석 정리
  - 가능하면 다음 스프린트에 `/report` -> `/planning/reports` 유도 계획 작성

### 2. Engine 엔트리 승격

#### 2-1. 엔진 orchestration 설계

- `src/lib/planning/engine/index.ts`
- `src/lib/planning/engine/types.ts`
  - 현재 `status/decision/core` 구조를 유지할지, `simulate/scenarios/actions/debt/report-ready`까지 담을지 결정
  - `EngineResult<TCore>`를 route별 ad-hoc wrapper가 아니라 planning orchestration result에 맞춰 확장

#### 2-2. core/v2 호출 통합

- `src/lib/planning/core/v2/service.ts`
- `src/app/api/planning/v2/simulate/route.ts`
- `src/app/api/planning/v2/actions/route.ts`
- `src/app/api/planning/v2/scenarios/route.ts`
- `src/app/api/planning/v2/optimize/route.ts`
- `src/app/api/planning/v2/debt-strategy/route.ts`
- `src/app/api/planning/v2/runs/route.ts`
  - route별 `toEngineInput()` + `runPlanningEngine()` + `planningService.*` 분산 패턴을 공통 runner로 수렴
  - 최소 1차 목표는 route들이 같은 engine orchestration helper를 부르게 만드는 것

#### 2-3. 결과 저장 SSOT 정리

- `src/app/api/planning/v2/runs/route.ts`
- `src/lib/planning/v2/resultDto.ts`
- `src/lib/planning/store/runStore.ts`
  - run outputs에서 `engine`, `engineSchemaVersion`, `resultDto`가 기본 SSOT라는 점을 명시
  - `resultDto` 재생성 fallback은 migration path로만 남기는 방향 검토

### 3. Stage 정책 매핑

- `src/lib/planning/engine/financialStatus.ts`
- `src/lib/planning/engine/stageDecision.ts`
- `src/lib/planning/core/v2/explain.ts`
- `src/lib/planning/core/v2/report.ts`
- `src/lib/planning/core/v2/actions/buildActions.ts`
- `src/lib/planning/core/v2/warningsCatalog.ko.ts`
  - 기존 warning/action/report 판단식과 새 stage/status/trace의 대응표를 만들고 문서로 남김
  - `trace`를 explanation/report/action reason의 공통 데이터로 재사용

### 4. Recommendation 연결층

- `src/app/recommend/page.tsx`
- `src/components/RecommendHubClient.tsx`
- `src/components/RecommendClient.tsx`
- `src/app/api/recommend/route.ts`
- `src/lib/recommend/score.ts`
- `src/lib/recommend/scoreBenefits.ts`
  - 즉시 삭제보다 adapter 도입이 우선
  - planning engine 결과와 recommend score reason이 충돌하지 않도록 최소 공유 모델 도입
  - localStorage persistence는 유지하되 계산 근거는 planning과 맞추는 방향

### 5. Legacy planner 차단

- `src/lib/planner/legacyPlanModel.ts`
- `src/lib/planner/plan.ts`
- `src/components/PlannerWizard.tsx`
- `src/lib/planner/storage.ts`
- `src/app/api/planner/compute/route.ts`
- `scripts/planner_deprecated_guard.mjs`
  - legacy planner는 유지하되 신규 진입 금지 범위를 넓힘
  - caller inventory를 문서화하고 삭제 우선순위를 정함

## 남은 병렬 경로 Caller Map

### A. 공식 planning 엔진 경로

#### 엔진 진입점

- `src/lib/planning/engine/index.ts`
  - `runPlanningEngine()`
  - `createEngineEnvelope()`

#### planning API route 호출부

- `src/app/api/planning/v2/simulate/route.ts`
- `src/app/api/planning/v2/actions/route.ts`
- `src/app/api/planning/v2/scenarios/route.ts`
- `src/app/api/planning/v2/optimize/route.ts`
- `src/app/api/planning/v2/debt-strategy/route.ts`
- `src/app/api/planning/v2/runs/route.ts`

#### planning 프론트 정규화

- `src/lib/planning/api/contracts.ts`
  - `getEngineEnvelope()`
  - `normalizePlanningResponse()`
- `src/app/planning/_lib/runPipeline.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `src/components/DebugPlanningV2Client.tsx`

### B. planning/core/v2 계산 SSOT 경로

#### core/v2 직접 원본

- `src/lib/planning/core/v2/service.ts`
- `src/lib/planning/core/v2/simulateMonthly.ts`
- `src/lib/planning/core/v2/runScenarios.ts`
- `src/lib/planning/core/v2/actions/buildActions.ts`
- `src/lib/planning/core/v2/debt/strategy.ts`
- `src/lib/planning/core/v2/report.ts`

#### server/v2 re-export 경유 경로

- `src/lib/planning/server/v2/service.ts`
- `src/lib/planning/server/v2/simulateMonthly.ts`
- `src/lib/planning/server/v2/runScenarios.ts`
- `src/lib/planning/server/v2/actions/buildActions.ts`
- `src/lib/planning/server/v2/debt/strategy.ts`
- `src/lib/planning/server/v2/report.ts`

판단:

- 계산 원본은 사실상 `core/v2`
- 하지만 호출 진입점은 아직 `server/v2`/route별 분산 상태

### C. planning report 계약 경로

#### 계약/VM 생성

- `src/lib/planning/reports/reportInputContract.ts`
- `src/app/planning/reports/_lib/reportViewModel.ts`

#### contract-first route

- `src/app/api/planning/v2/runs/[id]/report/route.ts`
- `src/app/api/planning/v2/runs/[id]/report.pdf/route.ts`
- `src/app/api/planning/reports/[runId]/export.html/route.ts`

#### 아직 legacy fallback 의존이 남은 지점

- `src/lib/planning/reports/reportInputContract.ts`
  - `outputs.simulate.legacy`
  - `resultDtoFallback`
- `src/app/planning/reports/_lib/reportViewModel.ts`
  - `buildResultDtoV1FromRunRecord(run)` fallback
- `src/components/PlanningReportsClient.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/app/planning/reports/_lib/runReportHubRows.ts`

### D. planning report UI 병렬 경로

#### 공식 planning reports 쪽

- `src/app/planning/reports/page.tsx`
- `src/app/planning/reports/[id]/page.tsx`
- `src/components/PlanningReportsClient.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/PlanningReportDetailClient.tsx`

#### 문제 지점

- `src/components/PlanningReportDetailClient.tsx`
  - `buildReportVM()` 직접 호출
- `src/components/PlanningReportsDashboardClient.tsx`
  - `buildReportVM()` 직접 호출
- `src/components/PlanningReportsClient.tsx`
  - resultDto fallback 직접 호출

판단:

- route는 contract-first에 가까움
- client는 아직 완전 contract-first 아님

### E. legacy `/report` 경로

#### route/UI

- `src/app/report/page.tsx`
- `src/components/ReportClient.tsx`
- `src/lib/report/reportBuilder.ts`

#### 데이터 소스

- `planner_last_snapshot_v1` localStorage
- `recommend` saved run local storage
- disclosure digest / daily brief

판단:

- planning 공식 report 체계와 별도 제품
- 현재는 이름만 `/report`일 뿐 planning run/resultDto 기반 단일화 대상 바깥에 가까움
- planning report와 같은 축에 두면 혼선 발생

### F. legacy planner 경로

#### 남아 있는 전이층

- `src/lib/planner/legacyPlanModel.ts`
- `src/lib/planner/plan.ts`
- `src/lib/planner/storage.ts`
- `src/lib/planner/checklistStorage.ts`
- `src/lib/planner/uiPrefs.ts`
- `src/lib/planner/insuranceMetrics.ts`
- `src/lib/planner/retirementMetrics.ts`
- `src/app/api/planner/compute/route.ts`
- `src/components/PlannerWizard.tsx`

#### 연관 소비자

- `src/components/ReportClient.tsx`
- `src/lib/report/reportBuilder.ts`
- `src/components/SnapshotDeltaCards.tsx`
- `src/components/HomePortalClient.tsx`

판단:

- deprecated 표시는 됐지만 완전 고립되지는 않음
- 특히 legacy `/report`와 planner snapshot이 아직 연결돼 있음

### G. recommendation 병렬 계산 경로

#### 서버 경로

- `src/app/api/recommend/route.ts`
  - `recommendCandidates`

#### 클라이언트 점수 경로

- `src/app/recommend/page.tsx`
  - `/api/recommend` 호출
  - localStorage로 profile/result 저장
- `src/components/RecommendHubClient.tsx`
  - `scoreProducts()`
  - `scoreBenefits()`
- `src/components/RecommendClient.tsx`
  - `scoreProducts()`
- `src/lib/recommend/score.ts`
- `src/lib/recommend/scoreBenefits.ts`

판단:

- planning engine/resultDto와 완전히 별도
- 이번 주 안에 완전 통합은 무리
- 최소 목표는 stage/status/trace 충돌 제거용 adapter 도입

## 이번 주 Done 기준 재정렬

### Must

- planning report route/UI의 기본 경로가 `ReportInputContract` 기준으로 고정됨
- `runPlanningEngine()` 또는 동등 orchestration helper가 `core/v2` 계산 호출의 공통 진입점이 됨
- stage/status/trace와 기존 v2 정책 간 대응표가 문서화됨
- legacy planner/report는 신규 진입 금지 상태가 됨

### Should

- recommend가 planning stage/status와 충돌하지 않도록 최소 연결 adapter를 가짐
- `buildResultDtoV1FromRunRecord()` runtime fallback 사용처가 더 줄어듦

### Not this week

- recommend score 엔진 완전 이관
- legacy planner 실제 삭제
- lifecycle/simulation/risk profile 확장
