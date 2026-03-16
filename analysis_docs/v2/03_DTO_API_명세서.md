# 03. DTO / API 명세서

## 1. 문서 목적

이 문서는 `financeproject` 저장소에서 확인 가능한 타입과 API route를 기준으로
현재 계약을 정리하고, 향후 정규화해야 할 표준 DTO를 제안합니다.

중요 원칙
- **확정 명세**: 저장소에서 직접 확인 가능한 타입/필드/파라미터만 작성
- **권장 표준안**: 저장소 구조를 바탕으로 한 정규화 제안
- 확인되지 않은 필드는 `unknown`, `blob`, `미확정`으로 명시

---

## 2. 공통 계약 원칙

### 2.1 현행 확인 사항

[현행 확인]
- planning write API는 same-origin 검증을 사용합니다.
- CSRF cookie가 있는 경우 CSRF 토큰 검증을 추가합니다.
- 삭제/영구삭제에는 `confirmText` 검증이 사용됩니다.
- 일부 route는 `ok/fail`, 일부 route는 `jsonOk/jsonError` helper를 사용합니다.

### 2.2 해석

[해석]
보안 가드는 비교적 일관되지만, 응답 envelope는 완전히 단일화되었다고 보기 어렵습니다.

### 2.3 권장 공통 응답 표준

```ts
type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: {
    generatedAt?: string;
    cache?: { hit?: boolean; keyPrefix?: string };
    snapshot?: Record<string, unknown>;
    health?: Record<string, unknown>;
    issues?: string[];
  };
};

type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    issues?: string[];
    meta?: Record<string, unknown>;
  };
};
```

---

## 3. Planning v2 핵심 타입 (확정)

## 3.1 ProfileV2Debt

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | Y | 부채 식별자 |
| name | string | Y | 부채명 |
| balance | number | Y | 잔액 |
| minimumPayment | number | Y | 최소 납입액 |
| aprPct | number | N | 연이율(퍼센트 단위) |
| apr | number | N | 레거시/내부 decimal APR |
| remainingMonths | number | N | 잔여 개월 수 |
| repaymentType | `"amortizing" \| "interestOnly"` | N | 상환 방식 |

## 3.2 ProfileV2Goal

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | Y | 목표 ID |
| name | string | Y | 목표명 |
| targetAmount | number | Y | 목표 금액 |
| currentAmount | number | N | 현재 적립 금액 |
| targetMonth | number | N | 목표 월 인덱스 |
| priority | number | N | 우선순위 |
| minimumMonthlyContribution | number | N | 최소 월 적립액 |

## 3.3 ProfileCashflowV2 관련

### CashflowPhaseV2

| 필드 | 타입 | 필수 |
|---|---|---|
| id | string | Y |
| title | string | Y |
| range.startMonth | number | Y |
| range.endMonth | number | Y |
| monthlyIncomeKrw | number | N |
| monthlyFixedExpensesKrw | number | N |
| monthlyVariableExpensesKrw | number | N |
| incomeGrowthPctYoY | number | N |
| expenseGrowthExtraPctYoY | number | N |

### PensionFlowV2

| 필드 | 타입 | 필수 |
|---|---|---|
| id | string | Y |
| title | string | Y |
| range.startMonth | number | Y |
| range.endMonth | number | Y |
| monthlyPayoutKrw | number | Y |

### ContributionFlowV2

| 필드 | 타입 | 필수 |
|---|---|---|
| id | string | Y |
| title | string | Y |
| range.startMonth | number | Y |
| range.endMonth | number | Y |
| from | `"cash"` | Y |
| to | `"investments" \| "pension"` | Y |
| monthlyAmountKrw | number | Y |

## 3.4 Tax / Pension

### TaxProfileV1

| 필드 | 타입 | 필수 |
|---|---|---|
| regime | `"KR"` | Y |
| filingStatus | `"single" \| "married"` | N |
| dependents | number | N |
| notes | string | N |

### PensionProfileV1

| 필드 | 타입 | 필수 |
|---|---|---|
| regime | `"KR"` | Y |
| nationalPension.expectedMonthlyPayoutKrw | number | N |
| nationalPension.startAge | number | N |
| retirementPension.type | `"DC" \| "DB" \| "IRP"` | N |
| retirementPension.expectedMonthlyPayoutKrw | number | N |
| retirementPension.startAge | number | N |
| personalPension.expectedMonthlyPayoutKrw | number | N |
| personalPension.startAge | number | N |
| notes | string | N |

## 3.5 ProfileV2

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| currentAge | number | N | 현재 나이 |
| birthYear | number | N | 출생연도 |
| gender | `"M" \| "F"` | N | 성별 |
| sido | string | N | 시도 |
| sigungu | string | N | 시군구 |
| monthlyIncomeNet | number | Y | 월 순수입 |
| monthlyEssentialExpenses | number | Y | 월 필수지출 |
| monthlyDiscretionaryExpenses | number | Y | 월 선택지출 |
| liquidAssets | number | Y | 유동자산 |
| investmentAssets | number | Y | 투자자산 |
| debts | `ProfileV2Debt[]` | Y | 부채 목록 |
| goals | `ProfileV2Goal[]` | Y | 목표 목록 |
| cashflow | `ProfileCashflowV2` | N | 확장 현금흐름 |
| tax | `TaxProfileV1` | N | 세금 프로필 |
| pensionsDetailed | `PensionProfileV1` | N | 연금 프로필 |
| defaultsApplied | `ProfileDefaultsAppliedV2` | N | 기본값 적용 정보 |

근거 파일
- `src/lib/planning/core/v2/types.ts`

---

## 4. Planning 시뮬레이션/시나리오 타입 (확정)

## 4.1 SimulationAssumptionsV2

| 필드 | 타입 | 필수 |
|---|---|---|
| inflation | number | Y |
| expectedReturn | number | Y |
| debtRates | `Record<string, number>` | N |

## 4.2 AssumptionsV2

| 필드 | 타입 | 필수 |
|---|---|---|
| inflationPct | number | Y |
| investReturnPct | number | Y |
| cashReturnPct | number | Y |
| withdrawalRatePct | number | Y |
| debtRates | `Record<string, number>` | N |

## 4.3 ScenarioSpec

| 필드 | 타입 | 필수 |
|---|---|---|
| id | `"base" \| "conservative" \| "aggressive"` | Y |
| title | string | Y |
| assumptions | `AssumptionsV2` | Y |

---

## 5. Planning 저장 레코드 타입 (확정)

## 5.1 PlanningProfileRecord

```ts
type PlanningProfileRecord = {
  version: 1;
  schemaVersion?: 2;
  id: string;
  name: string;
  profile: ProfileV2;
  createdAt: string;
  updatedAt: string;
};
```

## 5.2 PlanningProfileMeta

```ts
type PlanningProfileMeta = {
  profileId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
};
```

## 5.3 PlanningRunStageResult

| 필드 | 타입 | 설명 |
|---|---|---|
| id | `"simulate" \| "scenarios" \| "monteCarlo" \| "actions" \| "debtStrategy" \| "debt"` | 단계 ID |
| status | `"PENDING" \| "RUNNING" \| "SUCCESS" \| "FAILED" \| "SKIPPED"` | 단계 상태 |
| startedAt | string | 시작 시각 |
| endedAt | string | 종료 시각 |
| durationMs | number | 수행 시간 |
| reason | stage reason enum | 건너뜀/실패 사유 |
| errorSummary | string | 오류 요약 |
| outputRef | `{ key, hasData, ref? }` | 산출물 참조 |

### PlanningRunStageReason

- `OPTION_DISABLED`
- `SERVER_DISABLED`
- `HEALTH_BLOCKED`
- `BUDGET_EXCEEDED`
- `PREREQ_FAILED`
- `STAGE_ERROR`

## 5.4 PlanningRunRecord (확정 범위)

```ts
type BlobRefLike = {
  ref?: { name: string; path: string; sizeBytes?: number };
  [key: string]: unknown;
};

type PlanningRunRecord = {
  version: 1;
  schemaVersion?: 2;
  id: string;
  profileId: string;
  title?: string;
  createdAt: string;
  scenario?: ScenarioMeta;
  overallStatus?: "RUNNING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  stages?: PlanningRunStageResult[];
  input: {
    horizonMonths: number;
    policyId?: AllocationPolicyId;
    snapshotId?: string;
    assumptionsOverride?: Record<string, unknown>;
    runScenarios?: boolean;
    getActions?: boolean;
    analyzeDebt?: boolean;
    debtStrategy?: {
      offers?: RefiOffer[];
      options?: {
        extraPaymentKrw?: number;
        compareTermsMonths?: number[];
      };
    };
    includeProducts?: boolean;
    monteCarlo?: { paths?: number; seed?: number };
    scenario?: {
      title?: string;
      baseRunId?: string;
      patch: ScenarioPatch[];
    };
  };
  meta: {
    snapshot?: {
      id?: string;
      asOf?: string;
      fetchedAt?: string;
      missing?: boolean;
      warningsCount?: number;
      sourcesCount?: number;
    };
    normalization?: ProfileNormalizationDisclosure;
    health?: {
      warningsCodes: string[];
      warningCodes?: string[];
      criticalCount: number;
      snapshotStaleDays?: number;
    };
  };
  reproducibility?: {
    appVersion: string;
    engineVersion: string;
    profileHash: string;
    assumptionsSnapshotId?: string;
    assumptionsHash?: string;
    effectiveAssumptionsHash?: string;
    appliedOverrides?: AssumptionsOverrideEntry[];
    policy: PlanningInterpretationPolicy;
  };
  actionCenter?: {
    plan: PlanningRunActionPlan;
    progress: PlanningRunActionProgress;
  };
  outputs: {
    engineSchemaVersion?: number;
    engine?: EngineEnvelope;
    resultDto?: ResultDtoV1;
    simulate?: BlobRefLike;
    scenarios?: BlobRefLike;
    monteCarlo?: BlobRefLike;
    actions?: BlobRefLike;
    debtStrategy?: BlobRefLike;
  };
};
```

주의
- `BlobRefLike`의 내부 필드는 route/store 타입에서 일부만 확인 가능하므로 문서에서는 blob ref 성격으로 취급합니다.
- `ScenarioMeta`, `ResultDtoV1`, `EngineEnvelope`의 전체 구조는 이 문서 범위에서 완전 확정하지 않습니다.

근거 파일
- `src/lib/planning/store/types.ts`

---

## 6. Recommend 타입 (확정)

## 6.1 UserRecommendProfile

```ts
type UserRecommendProfile = {
  purpose: "emergency" | "seed-money" | "long-term";
  kind: "deposit" | "saving";
  preferredTerm: 3 | 6 | 12 | 24 | 36;
  liquidityPref: "low" | "mid" | "high";
  rateMode: "max" | "base" | "simple";
  topN: number;
  weights?: Partial<{
    rate: number;
    term: number;
    liquidity: number;
  }>;
  candidateSources?: ("finlife" | "datago_kdb")[];
  candidatePool?: "unified";
  depositProtection?: "any" | "prefer" | "require";
  planningContext?: {
    monthlyIncomeKrw?: number;
    monthlyExpenseKrw?: number;
    liquidAssetsKrw?: number;
    debtBalanceKrw?: number;
  };
};
```

확인 메모 (2026-03-16)
- 현행 recommend 입력의 planning linkage는 top-level `planningContext` 4개 숫자와 `/api/recommend`의 `stageInference: "disabled"`에 머뭅니다.
- planning run 기준 canonical `runId / stage / status / trace` ownership과 DTO 승격 방향은 `06_planning_recommend_contract_decision.md`를 우선 기준으로 삼습니다.
- `planningContext`는 `RecommendRequestV2` 구현 전까지 compatibility bridge로 유지하는 것이 안전합니다.

## 6.2 SelectedOption

```ts
type SelectedOption = {
  saveTrm: string | null;
  termMonths: number | null;
  appliedRate: number;
  baseRate: number | null;
  maxRate: number | null;
  rateSource: "intr_rate2" | "intr_rate" | "none";
  reasons: string[];
};
```

## 6.3 RecommendedItem

```ts
type RecommendedItem = {
  sourceId: UnifiedSourceId;
  kind: "deposit" | "saving";
  finPrdtCd: string;
  providerName: string;
  productName: string;
  finalScore: number;
  selectedOption: SelectedOption;
  breakdown: ScoreBreakdownItem[];
  reasons: string[];
  detailProduct?: RecommendDetailProduct;
  signals?: {
    depositProtection?: "matched" | "unknown";
  };
  badges?: string[];
};
```

근거 파일
- `src/lib/recommend/types.ts`

---

## 7. Unified Catalog 계약 (확정)

## 7.1 요청 파라미터

| 파라미터 | 타입 | 설명 |
|---|---|---|
| mode | `merged \| integrated` | merged가 기본 사용자용, integrated는 debug 성격 |
| kind | `deposit \| saving` | 상품 종류 |
| includeSources | source list | `finlife`, `datago_kdb`, `samplebank` 조합 |
| sourceId | source id | 단일 source 강제 시 |
| limit | `1..1000` | 페이지 크기 |
| cursor | string | 커서 기반 페이지네이션 |
| q | string | 검색어 |
| qMode | `contains \| prefix` | 검색 모드 |
| sort | `recent \| name` | 정렬 |
| depositProtection | `any \| prefer \| require` | 예금자보호 필터 |
| includeKdbOnly | boolean | KDB only 조건 |

## 7.2 성공 응답 핵심 필드

```ts
type UnifiedCatalogResponse = {
  ok: true;
  data: UnifiedCatalogItem[];
  coverage: {
    totalProducts: number;
    kdbBadged?: number;
  };
  meta: {
    generatedAt: string;
    fetchedAt?: string;
  };
};
```

## 7.3 UnifiedCatalogItem 핵심 필드

| 필드 | 설명 |
|---|---|
| stableId | 소스/옵션 병합에도 안정적으로 유지되는 ID |
| sourceId | 데이터 출처 |
| kind | deposit/saving |
| externalKey | 외부 키 |
| providerName | 금융사명 |
| productName | 상품명 |
| options[] | 상품 옵션 목록 |
| pageInfo | 페이지 정보 |

근거 파일
- `docs/unified-catalog-contract.md`
- `src/app/api/products/unified/route.ts`

---

## 8. 주요 API 명세 (확정 범위)

## 8.1 `GET /api/planning/v2/profiles`

| 항목 | 내용 |
|---|---|
| 목적 | 프로필 목록 조회 |
| Guard | same-origin read guard |
| 응답 | 프로필 목록(`listProfiles`) |

## 8.2 `POST /api/planning/v2/profiles`

### 요청

```json
{
  "name": "기본 프로필",
  "profile": { "...canonical profile..." : true },
  "csrf": "token"
}
```

### 처리 특징
- canonical profile normalization 수행
- 성공 시 생성된 record와 normalization meta 반환
- validation 실패 시 `INPUT`

## 8.3 `GET /api/planning/v2/profiles/[id]`

| 항목 | 내용 |
|---|---|
| 목적 | 단일 프로필 조회 |
| 오류 | 없으면 `NO_DATA` |

## 8.4 `PATCH /api/planning/v2/profiles/[id]`

| 항목 | 내용 |
|---|---|
| 목적 | 이름 또는 profile 갱신 |
| 입력 | `name`, `profile`, `csrf` |
| 특징 | 둘 다 없으면 `INPUT` |
| 추가 | profile patch 시 normalization meta 포함 가능 |

## 8.5 `DELETE /api/planning/v2/profiles/[id]`

| 항목 | 내용 |
|---|---|
| 목적 | soft delete |
| 입력 | `csrf`, `confirmText` |
| confirm 규칙 | `buildConfirmString("DELETE profile", id)` |
| 성공 응답 | `{ id, deleted: true, softDeleted: true }` |

## 8.6 `POST /api/planning/v2/simulate`

### 요청 바디 (확정)

```ts
type SimulateRequestBody = {
  profile?: unknown;
  horizonMonths?: unknown;
  assumptions?: unknown;
  policyId?: unknown;    // balanced | safety | growth
  snapshotId?: unknown;  // latest 또는 explicit id
  csrf?: unknown;
} | null;
```

### 처리 특징
- `profile`, `horizonMonths`, `assumptions`, `policyId`, `snapshotId` 파싱
- `snapshotId="latest"`는 별도 ID 없이 최신으로 해석
- cache key를 구성하고 hit/miss meta 반환
- snapshot 없음이면 `SNAPSHOT_NOT_FOUND`
- validation 실패면 `INPUT`

### 알려진 응답 메타
- `generatedAt`
- `snapshot`
- `health`
- `cache.hit`
- `cache.keyPrefix`

## 8.7 `GET /api/planning/v2/trash`

| 항목 | 내용 |
|---|---|
| 목적 | 휴지통 항목 조회 |
| query | `kind=profiles|runs|reports|all`, `limit` |
| 응답 항목 | `kind`, `id`, `deletedAt`, `sizeBytes` |

## 8.8 `DELETE /api/planning/v2/trash`

| 항목 | 내용 |
|---|---|
| 목적 | 휴지통 항목 영구 삭제 |
| 입력 | `kind`, `id`, `confirmText`, `csrf` |
| kind 허용값 | `profiles`, `runs`, `reports` |
| confirm 규칙 | `buildConfirmString("DELETE {kind}", id)` |
| 오류 | `INPUT`, `CONFIRM_MISMATCH`, `NO_DATA`, `INTERNAL` |

## 8.9 `POST /api/recommend`

| 항목 | 내용 |
|---|---|
| 목적 | 추천 결과 생성 |
| 입력 | `UserRecommendProfile` |
| 처리 | unified products 로드 → scoring → deposit protection 반영 |
| 특징 | planning linkage readiness는 계산하나 stage inference는 disabled |
| 예외 | DB에 상품이 없으면 안내 메시지와 meta 반환 가능 |

## 8.10 `GET /api/products/unified`

| 항목 | 내용 |
|---|---|
| 목적 | 통합 상품 카탈로그 조회 |
| 입력 | mode/kind/source/q/filter/cursor/sort 등 |
| 특징 | integrated는 debug 성격 제약 존재 |
| 제약 | cursor는 단일 sourceId에서만 허용 등 |

## 8.11 `GET /api/data-sources/status`

| 항목 | 내용 |
|---|---|
| 목적 | 데이터 소스 상태 요약 |
| 응답 | `getDataSourceStatuses()` 결과 + `fetchedAt` |

---

## 9. 표준화가 필요한 DTO (권장안)

주의 (2026-03-16)
- planning → recommend handoff의 상세 canonical contract는 `06_planning_recommend_contract_decision.md`를 우선합니다.
- 아래 9.1 ~ 9.3은 저장소 전반 DTO 정규화 참고안이고, `P2-1` 구현 시작점은 `PlanningSummaryDto`, `PlanningActionDto`, `PlanningToRecommendContextDto`, `RecommendRequestV2`, `RecommendExplanationDto` 결정안입니다.

## 9.1 CanonicalFinancialProfileDto

권장 이유
- v2 profile, v3 exposure/account/journal, recommend planningContext를 하나로 이어야 함

```ts
type CanonicalFinancialProfileDto = {
  id: string;
  name: string;
  demographics?: {
    birthYear?: number;
    age?: number;
    region?: { sido?: string; sigungu?: string };
  };
  cashflow: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
    phases?: CashflowPhaseDto[];
  };
  assets: {
    liquidAssetsKrw: number;
    investmentAssetsKrw: number;
  };
  debts: DebtDto[];
  goals: GoalDto[];
  risk?: {
    tolerance?: "low" | "mid" | "high";
    liquidityPref?: "low" | "mid" | "high";
  };
  tax?: Record<string, unknown>;
  pension?: Record<string, unknown>;
  provenance?: {
    source: "planning-v2" | "planning-v3" | "manual" | "import";
    updatedAt: string;
  };
};
```

## 9.2 PlanningDecisionContextDto

```ts
type PlanningDecisionContextDto = {
  profileId: string;
  runId?: string;
  snapshotId?: string;
  horizonMonths: number;
  policyId: "balanced" | "safety" | "growth";
  health?: {
    criticalCount: number;
    warningsCodes: string[];
  };
  summary?: {
    monthlySurplusKrw?: number;
    debtServiceRatio?: number;
    emergencyFundMonths?: number;
  };
};
```

## 9.3 RecommendationRequestDto (권장 통합판)

메모
- 이 섹션은 상위 정규화 참고안입니다.
- planning run 기반 실제 handoff 계약은 `RecommendRequestV2`와 `PlanningToRecommendContextDto`로 별도 고정하는 편이 현재 저장소 구조에 더 가깝습니다.

```ts
type RecommendationRequestDto = {
  source: "manual" | "planning-run";
  planning?: PlanningDecisionContextDto;
  profile: {
    purpose: "emergency" | "seed-money" | "long-term";
    kind: "deposit" | "saving";
    preferredTermMonths: 3 | 6 | 12 | 24 | 36;
    liquidityPref: "low" | "mid" | "high";
    depositProtection: "any" | "prefer" | "require";
  };
  ranking: {
    rateMode: "max" | "base" | "simple";
    topN: number;
    weights?: {
      rate: number;
      term: number;
      liquidity: number;
    };
  };
};
```

## 9.4 ProblemDetail 스타일 에러 표준

```ts
type ProblemDetailDto = {
  code: string;
  message: string;
  issues?: string[];
  retriable?: boolean;
  meta?: Record<string, unknown>;
};
```

## 9.5 History / Report linkage 원칙 (권장안)

메모
- 이 섹션은 `P2-5` 구현 전 선행 계약을 고정하기 위한 문서용 결정입니다.
- 공식 planning report 기준은 `/planning/reports`와 `src/lib/planning/reports/*`입니다.
- legacy `/report` builder는 참고용이며 source-of-truth로 쓰지 않습니다.

- recommend local history owner id는 `SavedRecommendRun.runId`입니다.
- planning run 참조는 이미 저장되는 `SavedRunProfile.planning.runId`를 canonical field로 사용합니다.
- 따라서 history → report 링크는 `SavedRecommendRun.runId`가 아니라 `SavedRunProfile.planning.runId`로 `/planning/reports?runId=...`를 구성해야 합니다.
- planning report/export → recommend reverse link는 concrete recommend history id가 별도로 잡히기 전까지 자동 추론하지 않습니다.
- source freshness / assumptions / trace는 planning report/export가 가진 `snapshot`, `assumptionsLines`, `reproducibility`, interpretation evidence 요약까지만 노출하고 raw trace 복제는 후속 범위로 남깁니다.

---

## 10. DTO/API 개선 우선순위

### P0
1. 응답 envelope 단일화
2. `CanonicalFinancialProfileDto` 확정
3. planning run → recommendation request mapping 확정
4. `confirmText`와 guard 실패 응답 형식 통일

### P1
1. report/export/download 응답 문서화
2. data source status DTO와 ops health DTO 분리
3. v3 draft/exposure/journal DTO 정규화

### P2
1. multi-user, encryption, sharing 고려 DTO 확장
2. schemaVersion migration 정책 자동화

---

## 부록. 근거 파일

- `src/lib/planning/core/v2/types.ts`
- `src/lib/planning/core/v2/scenarios.ts`
- `src/lib/planning/store/types.ts`
- `src/lib/recommend/types.ts`
- `src/app/api/planning/v2/profiles/route.ts`
- `src/app/api/planning/v2/profiles/[id]/route.ts`
- `src/app/api/planning/v2/simulate/route.ts`
- `src/app/api/planning/v2/trash/route.ts`
- `src/app/api/recommend/route.ts`
- `src/app/api/products/unified/route.ts`
- `src/app/api/data-sources/status/route.ts`
- `docs/unified-catalog-contract.md`
