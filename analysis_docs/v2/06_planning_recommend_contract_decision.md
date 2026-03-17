# 06. Planning → Recommend canonical contract 결정

작성 기준: 저장소 코드 정적 분석, 2026-03-16(KST)
범위: `P2-1 canonical planning-to-recommend contract 정의`

---

## 1. 목적

이 문서는 Planning 결과와 Recommend 입력 사이의 canonical contract를
문서 기준으로 먼저 고정하기 위한 결정 문서입니다.

이번 라운드의 목표는 아래 3가지입니다.

1. Planning → Recommend handoff의 canonical source를 정한다.
2. `runId`, `stage`, `status`, `trace`의 owner를 정한다.
3. `P2-2 ~ P2-5`가 바로 구현에 들어갈 수 있도록 DTO 초안과 선행 순서를 남긴다.

[비범위]
- API route 구현
- schema migration
- planning v3 영속 모델 정규화
- recommend scoring/상품 선택 로직 변경

---

## 2. 현재 코드 기준 현행 계약

### 2.1 Recommend 입력

현행 `/api/recommend` 입력은 `UserRecommendProfile` 기준입니다.

- 추천 입력 본체: 목적, 상품 종류, 기간, 유동성 선호, 금리 모드, `topN`, weight, source, 예금자보호 정책
- planning 연동 입력: `planningContext`
- `planningContext` 현행 필드
  - `monthlyIncomeKrw`
  - `monthlyExpenseKrw`
  - `liquidAssetsKrw`
  - `debtBalanceKrw`

제약:
- planning run을 가리키는 `runId`가 없음
- planning stage/status/trace가 없음
- `/api/recommend`는 `meta.planningLinkage.stageInference = "disabled"`를 현재 계약으로 노출함

### 2.2 Planning 결과 저장

현행 Planning 결과의 persisted owner는 `PlanningRunRecord`입니다.

이미 있는 필드:
- `id`
- `profileId`
- `createdAt`
- `overallStatus`
- `stages[]`
- `meta.snapshot`
- `meta.health`
- `reproducibility`
- `outputs.engine`
- `outputs.resultDto`
- `outputs.actions`

이미 없는 것:
- recommend용 canonical summary projection
- recommend용 canonical action projection
- recommend handoff 전용 `traceRef`

### 2.3 Report / share / history의 위치

`ReportInputContract`, report markdown, share markdown는 모두 planning run에서 파생되는 read model입니다.

주의:
- report는 `runId + resultDto + engine` 기준 read model입니다.
- share는 `run.profileId`를 따라 live profile을 다시 읽습니다.
- 따라서 report/share는 설명용 뷰에는 적합하지만, recommend handoff의 source-of-truth로 삼기에는 drift 위험이 있습니다.

### 2.4 Recommend saved run의 위치

`SavedRecommendRun.runId`는 recommend local history 식별자입니다.

주의:
- 이 `runId`는 planning run id가 아닙니다.
- 향후 planning 연동을 붙일 때는 recommend history id와 planning run id를 같은 필드에 섞으면 안 됩니다.

---

## 3. canonical source of truth 결정

### 3.1 후보 비교

| 후보 | 장점 | 한계 | 결론 |
| --- | --- | --- | --- |
| `PlanningRunRecord` | `runId`, `overallStatus`, `stages`, `reproducibility`, `engine`, `resultDto`를 이미 소유함 | recommend가 쓰는 요약 숫자 4개가 run 안에 안정 projection으로 아직 없음 | `[권장안]` owner |
| report VM / `ReportInputContract` | 설명 UI와 export에 바로 쓰기 좋음 | planning run에서 파생되는 read model이라 owner가 아님 | 파생 read model |
| `PlanningProfileRecord` / live profile join | 월수입, 지출, 자산 같은 입력 수치를 쉽게 읽을 수 있음 | run 시점 이후 profile이 바뀌면 과거 recommend 근거가 흔들림 | provenance only |
| ad-hoc 조합(run + live profile) | 당장 구현은 쉬움 | reproducibility와 history 연결 기준이 약해짐 | 임시 bridge만 허용 |

### 3.2 결정

`[권장안]` Planning → Recommend handoff의 canonical source는
**`PlanningRunRecord`가 소유하는 handoff projection**으로 고정합니다.

의미:
- owner entity는 `PlanningRunRecord`
- recommend가 읽을 summary/action DTO도 run-owned projection으로 저장
- report/share/profile은 source가 아니라 파생 또는 provenance 역할만 수행

### 3.3 이번 라운드에서 확정하는 범위

지금 문서로 확정:
- owner entity는 `PlanningRunRecord`
- `runId / stage / status / trace` owner
- recommend용 DTO 이름과 1차 필드 묶음
- `P2-2 ~ P2-5` 선행 순서

아직 `[보류]`로 남기는 범위:
- handoff projection의 실제 저장 경로 이름
- 기존 run 데이터 migration 방식
- recommend history에 `planningRunId`를 추가하는 실제 구현 시점

---

## 4. `runId / stage / status / trace` ownership 결정

| 항목 | owner | recommend 쪽 역할 | 메모 |
| --- | --- | --- | --- |
| `runId` | `PlanningRunRecord.id` | handoff, history, report, explain을 묶는 기준 ID | recommend local history id와 분리 |
| `stage` | `PlanningRunRecord.outputs.engine.stage` | planning 상태 기반 preset/설명 기준 | `financialStatus.stage`는 동일 의미의 내부 하위값 |
| `status` | `PlanningRunRecord.overallStatus` + `PlanningRunRecord.stages[].status` | run-level gate와 stage detail 근거 | recommend가 독자 status를 만들지 않음 |
| `trace` | `outputs.engine.financialStatus.trace` + `reproducibility` + `meta.snapshot/health` + `resultDto.meta` | explain/trust/export 근거 | 현재 standalone `traceId`는 없음 |

### 4.1 `runId`

결론:
- canonical planning id는 `PlanningRunRecord.id`
- recommend saved run의 `runId`는 recommend history id로 계속 분리 유지
- 후속 구현에서는 recommend history row에 `planningRunId` 같은 별도 참조 필드를 추가하는 편이 안전함

### 4.2 `stage`

결론:
- canonical planning stage는 `outputs.engine.stage`
- recommend는 이 값을 우선 사용해야 함
- `planningContext` 4개 숫자로 stage를 다시 추론하는 방식은 compatibility fallback까지만 허용

### 4.3 `status`

결론:
- recommend handoff gate는 `overallStatus`가 owner
- 세부 단계 실패/부분 성공 설명은 `stages[].status`가 owner
- recommend가 별도 `planningStatus`를 계산해 source-of-truth처럼 저장하지 않음

### 4.4 `trace`

결론:
- 재무 판단 trace는 `outputs.engine.financialStatus.trace`
- 재현성과 데이터 신뢰 근거는 `reproducibility`, `meta.snapshot`, `meta.health`, `resultDto.meta`
- recommend explanation은 trace 전체를 raw로 복제하지 말고, 필요한 subset이나 ref만 노출하는 방향이 적절함

[검증 필요]
- 장기적으로 export/share/history에서 전용 `traceRef`가 필요할 수 있음
- 다만 현재 저장소에는 standalone planning `traceId`가 없으므로 이번 라운드에서 새 ID를 지어내지 않음

---

## 5. DTO 초안

## 5.1 `PlanningSummaryDto`

목적:
- 현재 `planningContext` 4개 입력을 run-linked summary로 승격하는 최소 단위

```ts
type PlanningSummaryDto = {
  runId: string;
  profileId: string;
  generatedAt: string;
  overallStatus?: PlanningRunOverallStatus;
  stage: Stage;
  stagePriority: StageDecision["priority"];
  investmentAllowed: boolean;
  monthlyIncomeKrw: number;
  monthlyExpenseKrw: number;
  liquidAssetsKrw: number;
  debtBalanceKrw: number;
  goalsAchieved?: { achieved: number; total: number };
  dsrPct?: number;
  criticalWarnings?: number;
  snapshot?: {
    id?: string;
    asOf?: string;
    fetchedAt?: string;
    snapshotStaleDays?: number;
  };
};
```

지금 바로 구현할 필드:
- `runId`, `profileId`
- `generatedAt`
- `overallStatus`
- `stage`
- `stagePriority`
- `investmentAllowed`
- `monthlyIncomeKrw`
- `monthlyExpenseKrw`
- `liquidAssetsKrw`
- `debtBalanceKrw`
- `goalsAchieved`
- `dsrPct`
- `criticalWarnings`
- `snapshot`

후속 확장 후보 필드:
- `monthlySurplusKrw`
- `worstCashKrw`
- `worstCashMonthIndex`
- `endNetWorthKrw`
- `policyId`
- `assumptionsHash`

메모:
- `monthlyIncomeKrw`, `monthlyExpenseKrw`, `liquidAssetsKrw`, `debtBalanceKrw`는 현재 run 본문에 안정 projection이 없으므로, 구현 시점에 run 생성 시 함께 써 넣어야 함
- 이 값들을 live profile에서 다시 읽어 recompute하는 방식은 canonical source로 보지 않음

## 5.2 `PlanningActionDto`

목적:
- planning action을 recommend CTA preset과 explanation에 재사용하는 최소 단위

```ts
type PlanningActionDto = {
  code: ActionCode;
  severity: ActionSeverity;
  title: string;
  summary: string;
  why: Array<{ code: string; message: string; data?: unknown }>;
  metrics: Record<string, number>;
  steps: string[];
  cautions: string[];
  candidates?: ProductCandidate[];
};
```

지금 바로 구현할 필드:
- `code`
- `severity`
- `title`
- `summary`
- `why`
- `metrics`
- `steps`
- `cautions`
- `candidates`

후속 확장 후보 필드:
- `actionKey`
- `sourceActionId`
- `href`
- `progressStatus`
- `recommendPreset`

메모:
- 현재 저장소에는 `ActionItemV2`가 이미 있어 DTO 초안도 그 필드 체계를 최대한 재사용함
- action 진행 상태는 `actionCenter.progress`가 따로 있으므로 이번 1차 DTO에서는 섞지 않음

## 5.3 `PlanningToRecommendContextDto`

목적:
- recommend가 planning 결과를 읽을 때 사용하는 canonical handoff 묶음

```ts
type PlanningToRecommendContextDto = {
  runId: string;
  summary: PlanningSummaryDto;
  topActions?: PlanningActionDto[];
};
```

지금 바로 구현할 필드:
- `runId`
- `summary`
- `topActions`

후속 확장 후보 필드:
- `trace`
- `reproducibility`
- `reportRef`
- `historyRefs`

메모:
- 1차 handoff는 summary + top actions까지만 가져가도 `P2-2`, `P2-3`, `P2-4`를 열 수 있음
- trace 전체를 처음부터 request에 싣는 방식은 payload와 coupling을 키우므로 이번 단계에서는 보류

## 5.4 `RecommendRequestV2`

목적:
- 기존 recommend 입력을 유지하면서 run-linked planning context를 붙이는 전환 계약

```ts
type RecommendRequestV2 = {
  purpose: "emergency" | "seed-money" | "long-term";
  kind: "deposit" | "saving";
  preferredTerm: 3 | 6 | 12 | 24 | 36;
  liquidityPref: "low" | "mid" | "high";
  rateMode: "max" | "base" | "simple";
  topN: number;
  weights?: {
    rate?: number;
    term?: number;
    liquidity?: number;
  };
  candidateSources?: ("finlife" | "datago_kdb")[];
  candidatePool?: "unified";
  depositProtection?: "any" | "prefer" | "require";
  planning?: PlanningToRecommendContextDto;
  planningContext?: {
    monthlyIncomeKrw?: number;
    monthlyExpenseKrw?: number;
    liquidAssetsKrw?: number;
    debtBalanceKrw?: number;
  };
};
```

지금 바로 구현할 필드:
- 현행 recommend 입력 필드 전부 유지
- `planning?: PlanningToRecommendContextDto`
- `planningContext`는 legacy bridge로 유지

후속 확장 후보 필드:
- `planningRunId` 별도 alias 제거 여부
- `openedFrom`
- `uiSource`
- `requestTraceRef`

메모:
- recommend route는 `planning.runId`가 있으면 그 값을 우선 source로 사용해야 함
- top-level `planningContext`는 migration 기간 동안만 compatibility 입력으로 남기고, 장기적으로는 `planning.summary`로 흡수하는 편이 적절함

## 5.5 `RecommendExplanationDto`

목적:
- 추천 결과가 "왜 지금 이 상품 후보가 맞는지"를 planning 기준으로 설명하는 응답용 DTO

```ts
type RecommendExplanationDto = {
  planning: {
    runId: string;
    stage: Stage;
    overallStatus?: PlanningRunOverallStatus;
    summary: PlanningSummaryDto;
    topActions?: PlanningActionDto[];
  };
  trust?: {
    snapshotId?: string;
    asOf?: string;
    fetchedAt?: string;
    snapshotStaleDays?: number;
    criticalWarnings?: number;
  };
};
```

지금 바로 구현할 필드:
- `planning.runId`
- `planning.stage`
- `planning.overallStatus`
- `planning.summary`
- `planning.topActions`
- `trust`

후속 확장 후보 필드:
- `traceHighlights`
- `reportLink`
- `historyLink`
- `assumptionNotes`

메모:
- 현재 `/api/recommend`의 `planningLinkage`는 readiness 계산과 disabled stageInference까지만 담당함
- `RecommendExplanationDto`는 그 다음 단계의 정식 응답 DTO로 보고, item-level score breakdown을 대체하지는 않음

---

## 6. `P2-2 ~ P2-5` 선행 순서

`[권장 순서]` `P2-2` → `P2-3` → `P2-4` → `P2-5`

### 6.1 `P2-2 stage inference 활성화`

먼저 열어야 하는 이유:
- `planning.runId`와 `PlanningSummaryDto.stage`를 실제 recommend request/response에 연결해야 함
- 현행 `stageInference: "disabled"`를 제거할 최소 선행 작업임

### 6.2 `P2-3 액션 기반 CTA 도입`

`P2-2` 다음에 여는 이유:
- CTA preset은 `PlanningActionDto`와 `PlanningSummaryDto.stage`를 같이 봐야 함
- stage가 정해진 뒤에야 "비상자금 보강", "부채부담 관리" 같은 preset이 안정적으로 붙음

### 6.3 `P2-4 추천 결과 설명 강화`

`P2-3` 다음에 여는 이유:
- explanation은 summary + action + trust를 한 묶음으로 보여줘야 함
- action preset과 연결된 추천 이유를 함께 설명하는 편이 사용자 문맥에 맞음

### 6.4 `P2-5 history/report 통합`

마지막에 여는 이유:
- recommend history와 planning report를 묶으려면 `runId`와 explanation shape가 먼저 안정돼야 함
- `SavedRecommendRun.runId`와 planning `runId`를 분리 보관하는 작업도 이 단계에서 같이 정리하는 편이 안전함

---

## 7. 지금 확정 가능한 범위와 남은 보류

### 7.1 지금 확정 가능한 범위

- canonical owner entity는 `PlanningRunRecord`
- `runId / stage / status / trace` owner는 planning run 쪽
- recommend용 1차 DTO 이름과 필드 묶음
- `planningContext` 4개 입력은 legacy bridge로 유지
- `P2-2 ~ P2-5` 선행 순서

### 7.2 아직 `[보류]`로 남길 범위

- run-owned handoff projection의 실제 저장 경로 이름
- 기존 run 데이터에 대한 migration/backfill 방식
- `traceRef` 별도 ID 필요 여부
- recommend history에 `planningRunId`를 붙이는 실제 시점

---

## 8. 이번 라운드 결론

`P2-1`은 이번 라운드부터 `[진행중]`으로 올릴 수 있습니다.

이유:
- canonical source와 ownership이 문서로 고정됐고
- DTO 초안과 후속 순서도 문서 기준으로 고정됐기 때문입니다.

다만 아직 구현이 시작된 것은 아니므로, `P2-1`을 `[완료]`로 올리지는 않습니다.
