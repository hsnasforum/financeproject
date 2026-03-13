# Planning UI Calculation Removal Candidates

Last updated: 2026-03-10

## 목적

이번 문서는 이번 주 범위에서 바로 삭제하지는 않지만, 다음 스프린트에서 planning 공식 엔진/report contract 경로로 이관해야 할 UI 내부 계산/재해석 지점을 고정한다.

원칙:

- 정책 계산은 `src/lib/planning/core/v2/*`, `src/lib/planning/engine/*`, `src/lib/planning/reports/*`에서만 확장한다.
- UI는 가능한 한 `ReportVM`, `ResultDto`, canonical engine envelope를 소비만 한다.
- 화면 표현용 formatting은 유지하되, raw `run.outputs.*` 파싱은 줄인다.

## P1. 다음 제거 우선순위

### 1. `src/components/PlanningReportsClient.tsx`

현재 상태:

- `action/scenario/monte/debt` parser는 `ReportVM` 쪽으로 이동했다.
- summary/debt 카드도 `ReportVM` typed 필드 직접 소비로 정리했다.
- `react-hooks/exhaustive-deps` 우회 주석을 제거했다.

남은 후보:

- `toAssumptionLines()`
  - 현재는 `ReportVM.assumptionsLines`로 이동했다.
  - 후보 방향: report VM의 `assumptions` 또는 `report meta` 섹션으로 이동.

판단:

- P1 범위(파싱 축소)는 완료.
- 남은 것은 표시 전용 section 조립과 debug JSON surface 개선이다.

### 2. `src/components/PlanningReportsDashboardClient.tsx`

현재 상태:

- `toGoals()`, `toTopActions()`, `parseNormalizationDisclosure()` 직접 파싱은 제거했다.
- dashboard는 `selectedRunVm` 기준으로 goal/action/disclosure를 소비한다.

남은 후보:

- interpretation/debug panel 쪽 추가 raw run 접근 여부 재평가
- summary card 일부를 `selectedRunVm.insight` 기반으로 더 좁힐지 검토

판단:

- dashboard의 큰 병렬 parser는 1차 정리 완료.
- 남은 것은 summary shaping과 일부 debug/transition surface다.

### 3. `src/components/PlanningWorkspaceClient.tsx`

현재 상태:

- normalization disclosure parser는 공통 helper로 이동했다.
- compat rebuild path도 `rebuildResultDtoFromCombinedRunResultForCompat()`로 lib migration helper에 격리했다.
- summary/evidence 계산은 `buildResultSummaryMetrics()` 공통 helper를 공유한다.
- quick start/live summary 계산은 `workspaceQuickStart` helper로 이동했다.

남은 후보:

- summary evidence 계산
  - 현재는 `buildResultSummaryMetrics()` 공통 helper를 사용한다.
  - 후보 방향: preview-only 계산인지, canonical result summary로 대체 가능한지 추가 구분.
- `runResult` 조합부
  - canonical persisted outputs와 ad-hoc local summary 계산이 섞여 있다.
  - 후보 방향: `CombinedRunResult`를 engine/result DTO 중심 shape로 더 좁힘.
- debt 요약/경고는 `resultDto.debt` typed 필드를 우선 소비하고 `raw.debt`는 legacy fallback으로만 사용한다.
- `react-hooks/exhaustive-deps` 우회 주석을 제거했다.

판단:

- workspace는 사용자 입력 preview가 있어 일부 로컬 계산이 불가피하다.
- 저장된 run을 다시 표시하는 경로의 compat rebuild helper는 이미 migration helper로 격리했다.

## P2. Legacy/transition UI

### 4. `src/app/report/page.tsx` / `src/components/ReportClient.tsx`

- legacy `/report`는 planning 공식 report와 다른 제품이다.
- 이 경로에는 신규 planning 계산/해석을 넣지 않는다.
- `/report`는 `/planning/reports`로 영구 리다이렉트(permanentRedirect)한다.
- 남은 과제는 redirect 이후 sunset 시점 결정뿐이다.

### 5. `src/components/RecommendHistoryClient.tsx`

- recommend saved run의 기본 리포트 진입은 `/planning/reports`로 고정했다.
- legacy `/report` 혼동 방지 문구를 유지한다.

### 6. `src/components/home/ServiceLinks.tsx`

- 홈 quick link의 리포트 진입은 공식 `/planning/reports`로 고정했다.
- legacy `/report`는 홈 기본 동선에서 제거했다.

## Recommend 연결층 관련 현재 제약

현재 `src/lib/recommend/types.ts`의 `UserRecommendProfile`은 `planningContext`로 아래 planning 입력을 받을 수 있다.

- `monthlyIncomeKrw`
- `monthlyExpenseKrw`
- `liquidAssetsKrw`
- `debtBalanceKrw`

다만 아직 아래 planning contract는 없다.

- canonical `runId`
- planning `Stage` / `FinancialStatus` / `StageDecision`
- stage 판정 trace

따라서 이번 주 범위에서 `/recommend`에 planning `Stage`를 그대로 주입하면 실제 엔진 판정이 아니라 추정치가 된다.

판단:

- 이번 주에는 recommend에 가짜 stage adapter를 넣지 않는다.
- `/api/recommend`는 `meta.planningLinkage`로 `none | partial | ready` readiness와 `stageInference: "disabled"`만 노출한다.
- readiness는 `planningContext` 4개 입력(`monthlyIncomeKrw`, `monthlyExpenseKrw`, `liquidAssetsKrw`, `debtBalanceKrw`) 충족도만 보여주고, planning stage/status/trace를 추정하지 않는다.
- 대신 legacy `/report` 진입 표기와 문서화를 먼저 끝낸다.
- recommend adapter는 canonical planning result 연결 이후 진행한다.

## 다음 스프린트 바로 할 일

1. `PlanningWorkspaceClient`의 `CombinedRunResult` shape를 더 줄일지 결정
2. `PlanningReportsDashboardClient`의 summary/debug shaping을 `selectedRunVm` 기준으로 더 좁힐지 결정
3. `PlanningReportsClient`의 debug/meta section도 report VM 기준으로 더 좁힐지 결정
4. recommend profile 계약에 canonical run/stage 연결을 어떻게 추가할지 결정
