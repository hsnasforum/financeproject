# Planning Stage Policy Mapping

Last updated: 2026-03-06

## 목적

이 문서는 현재 `planning/core/v2`의 warning/action/report 해석과
`planning/engine`의 `Stage`/`FinancialStatus`/`StageDecision` 사이의 대응을 명시한다.

현재 상태는 완전한 정책 통합이 아니라, 다음 두 층의 의미를 맞추는 단계다.

- 계산/경고 원본: `src/lib/planning/core/v2/*`
- stage/status/domain 전이층: `src/lib/planning/engine/*`

## 현재 stage 판정 소스

### 엔진 판정

- 파일:
  - `src/lib/planning/engine/financialStatus.ts`
  - `src/lib/planning/engine/stageDecision.ts`

### 판정 규칙

| Stage | 판정 조건 | trace 핵심값 | 기본 우선순위 |
| --- | --- | --- | --- |
| `DEFICIT` | `savingCapacity < 0` | `savingCapacity`, `savingRate` | `CUT_SPENDING` |
| `DEBT` | `savingCapacity >= 0` 이고 `debtBalance > 0` | `debtBalance` | `PAY_DEBT` |
| `EMERGENCY` | 위 두 조건이 아니고 `emergencyFundGap > 0` | `emergencyFundTarget`, `emergencyFundGap` | `BUILD_EMERGENCY_FUND` |
| `INVEST` | 그 외 | `savingCapacity`, `emergencyFundGap = 0` | `INVEST` |

### trace 필드

- `savingCapacity`
- `savingRate`
- `liquidAssets`
- `debtBalance`
- `emergencyFundTarget`
- `emergencyFundGap`
- `triggeredRules[]`

## core/v2 정책 소스와의 대응

### 1. Warning 해석

- 파일:
  - `src/lib/planning/core/v2/explain.ts`
  - `src/lib/planning/core/v2/warningsCatalog.ko.ts`
  - `src/lib/planning/core/v2/report/warningsAggregate.ts`

현재 warning 해석은 월별 timeline row와 reason code를 기준으로 만들어진다.
즉 warning은 `Stage`를 직접 만들지 않고, timeline 기반 현상 진단을 나타낸다.

### 대응표

| core/v2 warning/reason | stage 대응 | 근거 |
| --- | --- | --- |
| `NEGATIVE_CASHFLOW` | `DEFICIT` 우선 후보 | `savingCapacity < 0` 와 가장 직접적으로 연결됨 |
| `HIGH_DEBT_RATIO`, `HIGH_DEBT_SERVICE` | `DEBT` 우선 후보 | 부채 상환 부담이 stage `DEBT` 의미와 일치 |
| `EMERGENCY_FUND_DRAWDOWN`, `EMERGENCY_FUND_SHORT`, `INSOLVENT` 일부 | `EMERGENCY` 또는 `DEFICIT` 후보 | 유동성 완충 부족 또는 현금 부족을 의미 |
| `RETURN_BOOST`, `STEADY_PROGRESS` | `INVEST` 보조 신호 | 직접 판정 규칙은 아니지만 안정 상태와 더 가깝다 |

주의:

- warning code와 stage는 1:1 동치가 아니다.
- stage는 현재 월 단위 현상 묶음이 아니라 입력 기반 상위 상태다.
- 따라서 warning은 `stage 판정 근거`라기보다 `stage 설명 보조 데이터`로 취급해야 한다.

### 2. Action 해석

- 파일:
  - `src/lib/planning/core/v2/actions/buildActions.ts`

### 대응표

| core/v2 action code | stage 대응 | 비고 |
| --- | --- | --- |
| `FIX_NEGATIVE_CASHFLOW` | `DEFICIT` | 현재 `CUT_SPENDING` priority와 가장 직접 대응 |
| `REDUCE_DEBT_SERVICE` | `DEBT` | `PAY_DEBT` priority와 대응 |
| `BUILD_EMERGENCY_FUND` | `EMERGENCY` | `BUILD_EMERGENCY_FUND` priority와 직접 대응 |
| `COVER_LUMP_SUM_GOAL` | stage 공통 보조 action | 목표 갭용 보조 action |
| `IMPROVE_RETIREMENT_PLAN` | stage 공통 보조 action | 은퇴 목표 갭용 보조 action |
| `SET_ASSUMPTIONS_REVIEW` | stage 공통 보조 action | 가정/데이터 점검용 보조 action |

### 3. Report 해석

- 파일:
  - `src/lib/planning/core/v2/report.ts`
  - `src/app/planning/reports/_lib/reportViewModel.ts`

report는 현재:

- summary metric
- aggregated warnings
- goals
- top actions

를 묶어서 보여준다.

이 구조에서 stage가 직접 노출되지는 않지만, 다음 방식으로 연결된다.

- `ReportInputContract.engine`
- `ReportVM.stage`
- `ReportVM.contract.fallbacks`

즉 report는 앞으로 `warning/action 요약 + stage/status + fallback 상태`를 함께 보여주는 방향이 canonical이다.

## 현재 정책 차이와 남은 과제

### 이미 맞춰진 것

- `DEFICIT` ↔ `FIX_NEGATIVE_CASHFLOW`
- `DEBT` ↔ `REDUCE_DEBT_SERVICE`
- `EMERGENCY` ↔ `BUILD_EMERGENCY_FUND`

### 아직 남은 차이

- warning code는 월별 현상이고 stage는 입력 기준 상위 상태라 시간 축이 다름
- goal/retirement 관련 action은 현재 stage 공통 보조 action이며 특정 stage에 귀속되지 않음
- `INVEST`는 현재 “투자 가능” 정도의 상위 상태만 있고, core/v2의 action/report 해석과 완전히 결합되진 않음

## 이번 주 기준 결론

- 이번 주 목적은 `Stage`를 core/v2 전체 정책의 완전한 대체물로 만드는 것이 아니다.
- 이번 주 목적은 최소한 아래를 만족하게 만드는 것이다.

1. `DEFICIT / DEBT / EMERGENCY / INVEST`가 공식 타입으로 존재한다.
2. report와 UI가 stage/status를 참조할 수 있다.
3. core/v2 warning/action/report 해석이 stage와 충돌하지 않도록 매핑표가 문서화된다.
4. 다음 단계에서 action/report reason이 `trace`를 공통 근거로 소비할 수 있게 기반을 만든다.
