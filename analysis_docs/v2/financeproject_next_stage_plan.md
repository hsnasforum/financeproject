# financeproject 다음 단계 기획안

작성 기준: 공개 저장소 `hsnasforum/financeproject` 정적 분석, 2026-03-16(KST)
분석 범위: README, 화면 카탈로그, 핵심 페이지, API 일부, Prisma schema, 테스트, middleware
제약: 런타임 실행/배포 환경/실데이터 적재 상태는 검증하지 못했음

---

## 0. 실행 상태판

### 0.1 현재 진행률

- 전체 진행률: **69%** (`9 / 13` 항목 완료)
- Phase 1 진행률: **100%** (`4 / 4`)
- Phase 2 진행률: **100%** (`5 / 5`)
- Phase 3 진행률: **0%** (`0 / 4`)

### 0.2 상태 표기 규칙

- `[미착수]`: 아직 실행 배치를 열지 않음
- `[진행중]`: 실행 배치를 열었고 후속 작업이 남아 있음
- `[완료]`: 문서 기준 완료 조건까지 반영됨
- `[보류]`: 방향은 맞지만 선행 결정이나 범위 정리가 필요함

### 0.3 Phase 진행 현황

| Phase | 범위 | 상태 | 진행률 |
| --- | --- | --- | --- |
| Phase 1 | 제품 경계 정리와 Public IA 고정 | `[완료]` | `4 / 4` |
| Phase 2 | Planning → Recommend 실질 연동 | `[완료]` | `5 / 5` |
| Phase 3 | 데이터 신뢰와 성장 기능 제품화 | `[진행중]` | `0 / 4` |

### 0.4 운영 원칙

- 세부 작업은 `P1-1`, `P2-3`, `P3-2`처럼 Phase-순번 ID로 추적합니다.
- `/work` 기록과 commit message에는 가능하면 해당 ID를 함께 남깁니다.
- 한 항목이 여러 배치로 나뉘면 상태를 `[진행중]`으로 두고, 완료 조건을 만족했을 때만 `[완료]`로 올립니다.
- 실행 범위가 커져 항목을 통째로 닫기 어려우면 새 항목을 만들지 말고 기존 항목에 후속 배치로 연결합니다.

---

## 1. 결론

이 프로젝트의 다음 단계는 **기능 추가**보다 **제품화 경계 정리와 핵심 사용자 흐름 통합**이 우선입니다.

현재 저장소는 이미 다음 4축을 동시에 갖고 있습니다.

1. 재무설계(Planning v2)
2. 금융상품 추천(Recommend)
3. 공공/외부 데이터 기반 탐색(DART, 혜택, 주거, 환율, 데이터 소스 상태)
4. experimental v3, ops, debug 도구

문제는 역량이 부족한 것이 아니라, **제품으로 보여줘야 할 영역과 실험/운영/개발 영역이 함께 드러나면서 IA와 메시지가 분산**된 점입니다.

따라서 다음 단계 목표는 아래처럼 재정의하는 것이 적절합니다.

> **Finance Project 2.0 = 내 재무 상태를 진단하고,
> 바로 실행 가능한 상품/혜택/공시 액션으로 연결하며,
> 그 근거 데이터의 신뢰도와 최신성을 함께 보여주는 개인 금융 실행 허브**

---

## 2. 현재 상태 요약

### 2.1 제품 구조

핵심 진입은 `/dashboard`, `/planning`, `/recommend`, `/public/dart`, `/settings/data-sources`, `/products/catalog`입니다.

Public 화면은 계획/추천/상품/공공 정보/설정까지 넓게 열려 있고, 별도로 legacy redirect, prototype/preview, planning v3 experimental, ops/admin, dev/debug 경로가 분리되어 존재합니다.

즉, 이 저장소는 단일 앱처럼 보이지만 실제로는 아래 네 층이 공존합니다.

- 사용자 제품층: dashboard / planning / recommend / products / public / settings
- 실험층: planning v3
- 운영층: ops, planning ops API, data source health
- 개발층: dev/debug, artifacts, local-only API

### 2.2 기술/운영 구조

- Next.js App Router + TypeScript + Tailwind
- Prisma + SQLite
- Vitest + Playwright + ESLint
- `verify`, `planning:ssot:check`, `planning:v2:complete`, `e2e:rc`, `daily:refresh`, `release:verify` 등 운영/품질 명령이 이미 풍부함
- middleware에서 ops 경로와 state-changing planning API를 local-only로 차단함

즉, 기초적인 배포/운영/회귀 관리 습관은 이미 강한 편입니다.

### 2.3 데이터/도메인 상태

Prisma schema 기준 현재 영속 모델은 아래 성격이 강합니다.

- 제품 카탈로그 중심: Provider / Product / ProductOption
- 사용자 선호/즐겨찾기: UserProfile / Favorite
- planner snapshot: PlannerSnapshot
- 외부 데이터 최신성/매칭: ExternalSourceSnapshot / ExternalProduct / ExternalProductMatch

반면 route inventory에 있는 planning v3의 `accounts / balances / transactions / batches / categories/rules / drafts / profile draft` 등은
현 시점 Prisma 공개 schema에서 동일 수준의 정규화 모델이 확인되지 않습니다.

즉, **화면 확장 속도에 비해 v3 도메인 영속 모델 표준화는 아직 초기 단계일 가능성**이 큽니다.

### 2.4 사용자 흐름 상태

#### Planning
- planning v2 문서는 “개인용 로컬 플래닝 시뮬레이터”로 정의됨
- snapshot 기반 실행, summary/simulate/scenarios/Monte Carlo/actions/debt 흐름이 존재함
- 실행 기록 저장, diff/export, ops/assumptions, regression, doctor 등 운영 루틴도 정리됨

#### Recommend
- `/recommend` UI는 사용자의 목적, 상품 유형, 기간, 금리 정책, 가중치(rate/term/liquidity)를 받아 `/api/recommend`로 POST
- 결과는 localStorage에 저장되고 history로 이동 가능
- API는 `topN` 1~50, candidate source 기본값으로 `finlife`/`datago_kdb`, 예금자 보호 정책, planningContext를 함께 처리
- 다만 planning linkage의 `stageInference`는 현재 `disabled`

#### Data trust
- `/settings/data-sources`는 단순 설정 화면이 아니라, 사용자 영향 카드 + 확장 후보 + 운영 최신 기준 + dev 전용 진단을 함께 제공
- production에서는 상세 진단을 숨기고 read-only 기준만 노출

#### Public information
- DART는 검색 → 회사 상세 흐름 E2E가 존재
- news settings alert rules도 follow-through 링크와 분리된 적용 규칙을 테스트함

---

## 3. 핵심 문제 정의

### 문제 1. 제품 메시지가 분산되어 있음

현재 앱은 “재무설계 앱”인지, “금융상품 추천 앱”인지, “데이터 기반 금융 정보 허브”인지, “운영 콘솔 포함 올인원 시스템”인지가 첫 화면만으로 명확하지 않습니다.

**영향**
- 신규 사용자가 어디서 시작해야 하는지 혼란
- 화면 수는 많지만 제품 가치가 한 문장으로 응축되지 않음
- QA 범위와 문서 범위가 계속 커짐

### 문제 2. planning → recommend → action 전환이 반쯤 연결됨

planning과 recommend는 논리적으로 연결되어야 하는데,
현재는 recommend API가 `planningContext`를 받을 수 있음에도 planning stage inference는 disabled 상태입니다.

즉, “진단 결과가 실제 행동 제안으로 이어지는 엔진”이 아직 완성되지 않았습니다.

### 문제 3. experimental v3가 public 제품 인상에 영향을 줄 수 있음

v3는 route inventory상 상당히 넓지만, schema/계약/운영/노출정책이 public product 수준으로 고정되었다고 보기 어렵습니다.

**영향**
- 제품 정의보다 실험 확장이 먼저 보일 수 있음
- 문서/QA/DTO가 안정/실험 경계를 동시에 떠안음

### 문제 4. 데이터 신뢰성은 강점인데 사용자 가치 문장으로 충분히 승화되지 않음

`/settings/data-sources`와 `ExternalSourceSnapshot` 구조는 매우 좋은 자산입니다.
하지만 이것이 아직 “사용자가 안심하고 추천을 믿을 수 있는 이유”로 메인 흐름 안에 일관되게 들어가 있지는 않습니다.

### 문제 5. 영속 모델 표준화 없이 화면이 늘어날 위험

v3 영역이 커지는 속도에 비해 canonical entity/accounting model이 늦으면,
향후 DTO/API/QA/마이그레이션 비용이 급격히 올라갑니다.

---

## 4. 다음 단계 제품 전략

### 전략 문장

다음 단계는 **“실험 기능을 더 붙이는 단계”가 아니라,
이미 있는 역량을 한 개의 제품 흐름으로 묶어 제품화하는 단계”**로 정의합니다.

### 목표 구조

1. **Start**: Dashboard에서 내 상태와 추천 가능한 액션을 즉시 파악
2. **Diagnose**: Planning에서 재무 상태를 구조적으로 진단
3. **Decide**: Recommend/Product Catalog에서 실행 가능한 상품 후보를 비교
4. **Trust**: 추천 근거와 데이터 최신성을 함께 확인
5. **Track**: History/Reports/Feedback으로 결과를 축적

### 핵심 컨셉

**“진단 → 제안 → 실행 → 근거 → 기록” 단일 루프**

---

## 5. 제안하는 3단계 로드맵

## Phase 1. 제품 경계 정리와 Public IA 고정 (2~4주)

### 목표
사용자 제품층과 실험/운영/개발층을 명확히 분리해, public 앱이 무엇인지 한눈에 보이게 만듭니다.

### 해야 할 일

#### P1-1) Public IA 재정의 `[완료]`
Public navigation을 아래 5개 상위 메뉴로 고정합니다.

- 홈/대시보드
- 재무진단(Planning)
- 상품추천(Recommend)
- 금융탐색(Products / DART / 혜택 / 주거 / 환율)
- 내 설정(Settings / Data trust / Backup)

완료 메모 (2026-03-16):
- public 헤더, 모바일 하단 네비게이션, 홈 서비스 링크를 5개 상위 메뉴 기준으로 1차 반영함
- `docs/current-screens.md`에 Public IA 기준을 추가함
- `pnpm build`, `pnpm planning:current-screens:guard`는 선행 라운드에서 통과함
- 이후 좁은 selector/copy drift follow-up을 정리했고, `pnpm e2e:rc`가 최종 재실행 기준으로 통과함
- 따라서 Public IA first-pass closeout gate를 충족한 것으로 보고 `P1-1`을 닫음

#### P1-2) route policy 문서화 `[완료]`
각 경로를 아래 중 하나로 분류합니다.

- Public Stable
- Public Beta
- Legacy Redirect
- Local-only Ops
- Dev/Debug

완료 메모 (2026-03-16):
- `docs/current-screens.md`에 route policy 분류 기준을 추가함
- public stable / public beta / legacy redirect / local-only ops / dev-debug 구간을 문서 상에서 바로 읽히게 정리함

#### P1-3) 화면 노출 규칙 정리 `[완료]`
- `planning/v3/*`는 기본적으로 Public Beta 또는 internal experimental로 분리
- `/ops/*`, `/dev/*`, `/debug/*`는 사용자 문서/헤더/검색 노출 금지
- `/settings/data-sources`는 “설정”이 아니라 “데이터 신뢰” 하위 영역으로 재배치 검토

완료 메모 (2026-03-16):
- `docs/current-screens.md` 기준으로 `planning/v3`, `ops`, `dev`, `debug` 노출 경계를 명시함
- public 헤더/홈에는 해당 경로를 추가 노출하지 않음
- `/settings/data-sources` 관련 public copy를 `데이터 신뢰` 기준으로 조정함

#### P1-4) 카피와 시작점 정비 `[완료]`
Dashboard 상단에서 사용자를 두 갈래로 분기합니다.

- “내 재무 상태 진단하기” → `/planning`
- “조건에 맞는 상품 찾기” → `/recommend` 또는 `/products/catalog`

완료 메모 (2026-03-16):
- Dashboard hero에서 최근 실행이 없을 때 두 갈래 시작 CTA를 직접 노출함
- 진단 시작은 `/planning`, 상품 탐색 시작은 `/recommend`로 연결함

### 완료 기준
- current-screens 문서와 실제 route 정책 일치
- public 헤더/홈/CTA가 stable route만 가리킴
- dev/debug/ops 노출 이슈 0건
- RC E2E + current-screens guard green

---

## Phase 2. Planning → Recommend 실질 연동 (3~5주)

### 목표
재무설계 결과가 곧바로 상품 추천/행동 제안으로 이어지도록 단일 사용자 흐름을 완성합니다.

### 해야 할 일

#### P2-1) canonical planning-to-recommend contract 정의 `[완료]`
새 DTO를 만듭니다.

- `PlanningSummaryDto`
- `PlanningActionDto`
- `PlanningToRecommendContextDto`
- `RecommendRequestV2`
- `RecommendExplanationDto`

핵심 필드 예시:
- 월수입/월지출/월저축
- 유동자산/부채잔액
- 긴급자금개월수
- 목표 금액/기간
- 위험/유동성 선호
- planning stage
- 추천 목적(reason code)

완료 메모 (2026-03-16):
- `analysis_docs/v2/06_planning_recommend_contract_decision.md`에 canonical source, ownership, DTO 초안, `P2-2 ~ P2-5` 선행 순서를 고정했습니다.
- canonical handoff source는 report VM이나 live profile join이 아니라 `PlanningRunRecord`가 소유하는 handoff projection으로 정리했습니다.
- 현행 `UserRecommendProfile.planningContext` 4개 입력은 legacy bridge로 유지하고, `PlanningToRecommendContextDto`와 `RecommendRequestV2`로 승격하는 방향을 문서 기준으로 확정했습니다.
- handoff projection의 실제 저장 경로 이름과 migration 방식은 후속 구현 라운드 과제로 남지만, 이는 `P2-1`의 설계 결정 완료를 막는 항목이 아니라 `P2-2 ~ P2-5` 구현 범위로 분리합니다.

#### P2-2) stage inference 활성화 `[완료]`
현재 disabled인 `planningLinkage.stageInference`를 활성화합니다.

예시 stage:
- DEFICIT
- DEBT
- EMERGENCY
- INVEST

완료 메모 (2026-03-16):
- `UserRecommendProfile`에 optional `planning` handoff 1차를 추가해 `planning.runId`, `planning.summary.stage`, optional `planning.summary.overallStatus`를 request/schema/store에서 읽을 수 있게 맞췄습니다.
- `/api/recommend`는 `planning.summary.stage`가 있으면 이를 우선 사용하고, 없을 때만 legacy `planningContext` 4개 숫자로 stage를 추론하도록 바꿨습니다.
- response `meta.planningLinkage`는 `readiness`, `metricsCount`, `stageInference`, `inferenceSource`를 함께 내려 planning summary 기반 활성 상태를 표현합니다.
- `ReportRecommendationsSection`의 `전체 추천 보기` 링크가 `/recommend`로 갈 때 `planning.runId`, `planning.summary.stage`, optional `planning.summary.overallStatus`를 query에 실어 보내는 첫 producer path를 열었습니다.
- `/recommend`는 해당 query를 profile로 흡수해 실제 `/api/recommend` request와 saved run profile까지 전달하도록 맞췄습니다.
- `/recommend` 결과 grid 위에는 planning handoff가 있을 때만 보이는 작은 context strip을 추가해, 현재 플래닝 결과 기준인지, summary 기반인지 legacy planningContext 기반인지, 어떤 실행 ID에서 왔는지를 읽을 수 있게 했습니다.
- planning run handoff projection 저장, 추가 producer surface, explanation 확장은 `P2-3 ~ P2-5` 후속 범위로 남기고, `P2-2`의 최소 완료 기준인 consumer 활성화 + producer 경로 1건 + 결과 context 노출은 충족한 것으로 정리합니다.

#### P2-3) 액션 기반 CTA 도입 `[완료]`
planning 결과의 action 카드에서 아래로 직접 이동시킵니다.

- “비상자금 보강” → 적금/예금 추천 with short-term liquidity preset
- “부채부담 관리” → 관련 대출/상환 가이드 또는 비교 화면
- “목표자금 최적화” → 기간/금리/보호 정책 preset된 추천 화면

진행 메모 (2026-03-16):
- `ReportDashboard`의 top action 카드에서 `action.code === "BUILD_EMERGENCY_FUND"`일 때만 첫 action-based CTA를 노출했습니다.
- CTA는 `src/lib/planner/compute.ts`에 이미 있던 emergency recommend preset을 재사용하고, `planning.runId`, `planning.summary.stage`, optional `planning.summary.overallStatus` handoff query를 함께 유지합니다.
- 후속 배치에서 `action.code === "COVER_LUMP_SUM_GOAL"`일 때만 saving recommend preset을 재사용하는 두 번째 CTA 경로를 추가했습니다.
- 후속 배치에서 `action.code === "REDUCE_DEBT_SERVICE"`일 때만 기존 public route인 `/products/credit-loan`으로 이동하는 세 번째 CTA 경로를 추가했습니다.
- 현재 열린 action code는 `BUILD_EMERGENCY_FUND`, `COVER_LUMP_SUM_GOAL`, `REDUCE_DEBT_SERVICE` 3건이며, 이 항목에 예시로 정의한 CTA 경로 3종은 모두 현재 커밋 기준으로 충족했습니다.
- `IMPROVE_RETIREMENT_PLAN` 같은 추가 action code 확장은 별도 후속 개선 범위로 남기고, `P2-3` 자체는 닫습니다.

#### P2-4) 추천 결과 설명 강화 `[완료]`
현재 점수/가중치 중심 UI에 아래를 추가합니다.

- 왜 이 상품이 추천되었는지
- 내 planning 상태에서 어떤 역할을 하는지
- 데이터 최신성은 어떤지
- 예금자 보호/조건 불확실성은 무엇인지

완료 메모 (2026-03-16):
- `/planning/reports`에서 이미 열린 두 action CTA(`BUILD_EMERGENCY_FUND`, `COVER_LUMP_SUM_GOAL`)는 `/recommend`로 이동할 때 view-only `planning.actionCode` query를 함께 넘깁니다.
- `/recommend` 결과 화면은 기존 planning context strip을 확장해, 비상금 보강 액션에서 연 추천인지 목표자금 점검 액션에서 연 추천인지 먼저 읽을 수 있게 했습니다.
- 후속 배치에서 추천 카드의 `추천 사유` 영역 앞에도 action context helper를 추가해, 상단 strip 설명과 카드 why를 더 자연스럽게 이어 읽을 수 있게 했습니다.
- 후속 배치에서 추천 카드 근처에 예금자 보호 신호, 금리 조건 확인 필요 여부, 데이터 최신성 읽기 힌트를 짧은 trust cue로 붙여 현재 데이터 기준의 신뢰 읽기 포인트를 같이 보이게 했습니다.
- 따라서 이 항목에 정의한 4축인 planning context strip, action context 설명, 카드 why 연결, trust cue 노출은 현재 커밋 기준으로 모두 충족한 것으로 보고 `P2-4`를 닫습니다.

#### P2-5) history/report 통합 `[완료]`
recommend history와 planning runs/report의 연결성을 강화합니다.

- planning run에서 파생된 recommend result 링크
- recommend result에서 근거 planning run 링크
- report export에서 source freshness / assumptions / trace 포함

완료 메모 (2026-03-16):
- recommend local history의 owner id는 `SavedRecommendRun.runId`로 유지하고, planning run 참조는 이미 저장되는 `profile.planning.runId`를 canonical planning ref로 쓰는 원칙을 먼저 고정했습니다.
- recommend history에서 planning report로 돌아가는 first path는 `profile.planning.runId`가 있을 때만 `/planning/reports?runId=...`로 연결하는 경로를 1순위로 둡니다.
- 후속 배치에서 `RecommendHistoryClient`의 기존 잘못된 `/planning/reports?runId=${run.runId}` 링크를 제거하고, `profile.planning.runId`가 있을 때만 planning report 링크를 노출하도록 바꿨습니다.
- active run 상세 영역에는 recommend local history id와 planning run id를 분리 표기하고, planning run id가 있을 때만 `플래닝 리포트로 이동` 버튼을 보여 줍니다.
- planning report/export 쪽 reverse link는 `SavedRecommendRun.runId`를 명시적으로 잡아두는 시점 전까지 자동 latest-match를 하지 않고 보류합니다.
- reverse link용 explicit ref는 planning canonical owner를 건드리지 않는 얇은 report-side metadata에서만 먼저 다루고, canonical field name은 `[권장안] recommendRunId`로 고정합니다.
- reverse link canonical href는 `/recommend/history?open=<recommendRunId>`로 두고, report UI에서 explicit ref가 있을 때만 read-only로 노출하는 경로를 1순위로 둡니다.
- export summary는 reverse link UI가 안정된 뒤 같은 `recommendRunId`를 요약 메모 수준으로만 붙이는 후속 순서로 남깁니다.
- `PlanningRunRecord.id`, `SavedRecommendRun.runId`, `profile.planning.runId`를 서로 대체하거나 시간대/최신 실행 heuristic으로 묶는 방식은 금지 규칙으로 더 명확히 적어 둡니다.
- 후속 구현에서 recommend history → planning report 링크는 `runId=<planningRunId>&recommendRunId=<savedRecommendRunId>`를 함께 넘기고, planning report UI는 현재 선택된 report가 그 query의 `runId`와 일치할 때만 `/recommend/history?open=<recommendRunId>` 역링크를 read-only로 노출하도록 맞췄습니다.
- `recommendRunId`가 없거나 현재 보고 있는 report가 처음 열린 report와 다르면 역링크를 숨기고, planning run id나 최신 실행 추정으로 fallback하지 않습니다.
- 후속 배치에서 `PlanningReportMeta`와 `PlanningReportListItem`에 optional `recommendRunId`를 추가하고, `/api/planning/v2/reports` POST가 explicit `recommendRunId`를 받아 stored report meta에 저장하도록 맞춥니다.
- 저장된 report list/detail UI는 stored `recommendRunId`가 있을 때만 `/recommend/history?open=<recommendRunId>` 역링크를 read-only로 노출하고, report id / planning run id / recommend run id를 구분해서 보여 줍니다.
- 후속 구현에서 `PlanningReportsDashboardClient`의 saved report 생성 버튼은 현재 선택 run으로 `/api/planning/v2/reports` POST를 호출하고, query에 explicit `recommendRunId`가 있을 때만 이를 함께 저장합니다.
- 생성 성공 후에는 현재 `/planning/reports` query에 `selected=<createdReportId>`를 붙여 embedded saved report detail이 바로 열리게 하고, 기존 `runId`, `baseRunId`, `recommendRunId` query는 그대로 유지합니다.
- source freshness / assumptions / trace는 planning report/export가 이미 가진 `snapshot`, `assumptionsLines`, `reproducibility`, interpretation evidence 요약까지만 owner로 삼고, raw trace 복제는 후속 범위로 남깁니다.
- 따라서 `P2-5`에 정의한 4축인 history → report canonical path, report → history explicit reverse link, stored report explicit ref owner, explicit ref를 저장하는 producer path는 현재 커밋 기준으로 모두 충족한 것으로 보고 닫습니다.

### 완료 기준
- planning 실행 후 1-click recommend 전환 가능
- recommend 결과에 planning context explanation 표시
- save/history/report 연결률 확보
- 새 contract 기준 API/QA/화면 정의서 동기화

---

## Phase 3. 데이터 신뢰와 성장 기능 제품화 (3~6주)

### 목표
이 프로젝트의 강점인 data source 운영 역량을 실제 사용자 신뢰 가치로 승화합니다.

### 해야 할 일

#### P3-1) Data Trust Layer 신설 `[진행중]`
`/settings/data-sources`를 운영 화면이 아니라 사용자 신뢰 허브로 재해석합니다.

구성:
- 데이터 최신성 배지
- 추천/탐색 화면별 사용 중인 데이터 출처
- 마지막 동기화 시점
- stale/fallback 안내 문구
- 소스별 영향 범위

진행 메모 (2026-03-16):
- `/settings/data-sources` 상단을 사용자 질문 중심 trust summary로 다시 열고, 이 페이지에서 먼저 봐야 할 내용과 읽는 순서를 한 화면에서 정리했습니다.
- `DataSourceImpactCardsClient`를 상단 trust summary 바로 아래에 두어, 어떤 데이터가 어떤 사용자 질문과 화면에 도움을 주는지 먼저 읽게 정리했습니다.
- `DataSourceStatusCard`는 production 기준으로 raw 상태 코드, env key, API 경로보다 사용자에게 보이는 영향과 현재 읽는 기준을 먼저 보여 주도록 톤을 바꿨습니다.
- `OpenDartStatusCard`도 공시 데이터 연결 상태와 현재 읽는 기준 중심으로 문구를 바꾸고, 개발용 인덱스 관리와 파일 경로는 dev 환경 설명으로만 뒤로 내렸습니다.
- `DataSourceHealthTable`과 detailed diagnostics는 페이지 하단의 `상세 운영 진단` 섹션으로 내려, 사용자용 trust 정보보다 뒤에서 참고용으로만 읽히게 했습니다.

#### P3-2) source freshness contract 표준화 `[진행중]`
모든 public 결과 카드에 최소 아래 메타를 붙입니다.

- `sourceId`
- `kind`
- `lastSyncedAt`
- `freshnessStatus`
- `fallbackMode`
- `assumptionNotes`

진행 메모 (2026-03-16):
- `P3-2`는 기존 `DataFreshnessBanner`를 public 화면에 재도입하는 배치가 아니라, 결과 카드 단위의 얇은 freshness 메타 contract를 먼저 고정하는 단계로 정의합니다.
- card 메타의 freshness 사실 owner는 `SourceStatusRow`와 현재 surface payload가 이미 가진 snapshot / fallback / assumption 값을 우선 재사용하고, 운영 진단 상세는 계속 `/settings/data-sources` owner로 둡니다.
- `freshnessStatus`는 banner severity(`ok / info / warn / error`)가 아니라 현재 `FreshnessItemStatus` 기반의 card-level 상태(`ok / stale / error / empty`)를 재사용하는 쪽으로 고정합니다.
- `fallbackMode`는 stale 상태만 보고 추론하지 않고, 현재 payload meta가 explicit하게 주는 `fallback.mode`, `fallbackUsed`, `mode === "mock"` 같은 값이 있을 때만 붙입니다.
- `sourceId` / `kind` namespace는 아직 모든 public surface에서 단일 enum으로 고정되지 않았으므로, first rollout은 이미 `item.sourceId`, `item.kind`를 가진 `/recommend` 결과 카드로 제한하고 다른 surface 확장은 후속으로 둡니다.
- public 결과 카드에는 짧은 freshness 메타와 assumption note만 남기고, raw source 상태·TTL·last error·env·ping·수동 재확인은 `/settings/data-sources`에서만 계속 보여 주는 원칙을 명시합니다.
- second rollout으로 `/products/deposit`, `/products/saving`의 product row / option row / grouped option header에 `finlife` 기준 `lastSyncedAt`, optional `freshnessStatus`, explicit `fallbackMode`, 짧은 assumption note를 같은 contract로 연결했습니다.
- `/products`는 `payload.meta.snapshot.generatedAt`를 `lastSyncedAt` owner로 우선 쓰고, `finlife` source status row가 있을 때만 `freshnessStatus`를 보강합니다. status row가 없어도 snapshot/generatedAt, explicit fallback, 짧은 note는 계속 읽을 수 있게 둡니다.
- `/recommend` 결과 카드에 `결과 기준` 블록을 추가해 `lastSyncedAt`, `freshnessStatus`, explicit `fallbackMode`, assumption note를 배너 없이 작은 메타로 first rollout 했습니다.
- third rollout으로 `ExchangeSummaryCard`에 `exchange` surface-local owner 기준 `결과 기준` helper를 추가해 `data.asOf`, optional `fallbackDays`, `assumptions.note`만 작은 chip/helper 수준으로 묶어 노출했습니다.
- `exchange` surface는 explicit source status row가 아직 없으므로 `freshnessStatus`를 억지 계산하지 않고 생략했고, 상단 날짜 badge와 하단 fallback 문구를 하나의 helper 블록으로 정리했습니다.
- `(sourceId, kind)` 기준 source status row 매칭이 안 되거나 `/api/sources/status` 조회가 실패하면 카드 freshness 메타는 숨기고, 결과 카드와 기존 error/empty 흐름은 그대로 유지합니다.

#### P3-3) 확장 후보의 제품화 기준 수립 `[미착수]`
현재 data-sources 화면에 있는 expansion candidate를 실제 제품 backlog로 전환합니다.

우선순위 기준:
- 사용자 효용
- 최신성/안정성
- 설명 가능성
- 운영 비용
- 공공 API 장애 내성

#### P3-4) DART/혜택/주거/환율의 역할 분리 `[미착수]`
이 기능들은 보조 기능이 아니라 “행동 근거 강화 레이어”로 배치합니다.

예시:
- 추천 상품 탐색 중 환율/시장/공시 맥락 제공
- 혜택/주거 정보는 life-event decision 보조 기능으로 연결

### 완료 기준
- 추천/상품/공공 정보 화면 모두 freshness 표시
- stale/fallback UX 공통 규칙 적용
- daily refresh 장애 시 사용자 안내 정책 명문화

---

## 6. v3 방향 제안

### 원칙
`planning/v3`는 곧바로 public stable로 올리지 말고,
**영속 모델과 계약이 먼저 고정된 뒤 점진 공개**해야 합니다.

### 권장 순서

#### 1) 먼저 고정할 것
- Account
- BalanceSnapshot
- Transaction
- TransactionBatch
- CategoryRule
- ProfileDraft
- ScenarioDraft
- NewsAlertRule

#### 2) 그다음 고정할 것
- API contract
- import/export 규칙
- rollback/repair 정책
- permission/visibility 정책
- QA golden dataset

#### 3) 마지막에 공개할 것
- v3 start / profile draft / transactions / news settings를 beta entry로 공개

### 이유
지금은 route와 화면이 풍부하지만, canonical storage contract가 충분히 드러나지 않습니다.
이 상태에서 public exposure를 넓히면 변경 비용이 더 커집니다.

---

## 7. 실행 관점 우선순위

### P0 (반드시 먼저)
1. Public IA / route policy 고정
2. planning-to-recommend DTO 정의
3. 추천 결과 explanation + freshness 표시
4. v3와 ops/dev 노출 정책 분리

### P1 (바로 다음)
1. Dashboard 재설계
2. history/report cross-link
3. data trust layer 제품화
4. common fallback/stale UX

### P2 (그다음)
1. v3 canonical entity 설계
2. account/transaction import 정규화
3. beta onboarding
4. 개인화 지표 및 funnel 측정

---

## 8. KPI 제안

### 제품 KPI
- dashboard 진입 후 planning/recommend 진입률
- planning 완료율
- planning → recommend 전환율
- recommend 결과 저장률
- history 재방문율

### 신뢰 KPI
- 결과 카드 freshness 표시율
- stale data 노출 건수
- fallback 발생 시 사용자 이탈률
- data refresh 실패 탐지 시간

### 품질 KPI
- `planning:ssot:check` 통과율
- `planning:v2:complete` 통과율
- `e2e:rc` 통과율
- regression issue lead time

---

## 9. 조직/문서 산출물

다음 단계에 실제로 필요한 산출물은 아래 6개입니다.

1. **제품 IA 문서**
   - stable/beta/ops/dev route map
2. **Planning → Recommend 연동 PRD**
   - 사용자 시나리오, preset, explanation, CTA 규칙
3. **DTO/API 명세서 v2**
   - planning context, source freshness, explanation contract
4. **데이터 신뢰 정책서**
   - freshness/fallback/stale wording 정책
5. **v3 도메인 모델 설계서**
   - account/transaction/profile draft/news alert canonical model
6. **QA gate 재정의서**
   - public stable, beta, ops/dev 테스트 분리

---

## 10. 최종 제안

이 프로젝트는 “무엇을 더 만들까”보다 **“이미 있는 것을 어떤 제품 경험으로 묶을까”**가 더 중요합니다.

가장 좋은 다음 단계는 아래 한 문장으로 요약됩니다.

> **Planning을 진단 엔진으로, Recommend를 실행 엔진으로, Data Sources를 신뢰 엔진으로 재정의하고,
> 이 셋을 Dashboard와 History 중심의 단일 루프로 묶는다.**

이 방향이면 현재 저장소의 강점인
- 풍부한 route 자산
- planning v2 운영 성숙도
- 추천 엔진/상품 데이터 구조
- 데이터 소스 상태 관리
- E2E/guard 습관

을 버리지 않고, 오히려 제품 완성도로 전환할 수 있습니다.

---

## 부록 A. 이번 분석에서 특히 중요하게 본 근거

- README의 제품 정의, 핵심 경로, 주요 명령, 운영 보안 정책
- `docs/current-screens.md`의 public / legacy / v3 / ops / dev route 분류
- `docs/planning-v2-onepage.md`의 planning v2 역할 정의와 운영 흐름
- `/src/app/planning/page.tsx`의 planning workspace 진입 구조
- `/src/app/recommend/page.tsx`의 추천 요청/저장/history 흐름
- `/src/app/api/recommend/route.ts`의 profile validation, planningContext, candidateSources, depositProtection, assumption/fallback metadata
- `/src/app/settings/data-sources/page.tsx`의 read-only health, dev-only ping, expansion candidates
- `middleware.ts`의 local-only 보호 정책
- `prisma/schema.prisma`의 현재 공개 영속 모델 구조
- Playwright E2E의 data-sources, news-settings, DART 흐름
