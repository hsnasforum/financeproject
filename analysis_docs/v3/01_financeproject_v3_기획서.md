# 01. financeproject v3 다음 단계 기획서

작성 기준

- 대상 저장소: `hsnasforum/financeproject`
- 분석 시점: 2026-03-25 (KST)
- 분석 범위: `README.md`, `package.json`, `docs/current-screens.md`, `docs/planning-v3-kickoff.md`, `RELEASE_CHECKLIST_V3.md`, `prisma/schema.prisma`, `middleware.ts`, `analysis_docs/v1/*`, `analysis_docs/v2/*`
- 분석 방식: 공개 저장소 정적 분석 기반

문서 성격

- `[현행 확인]`: 저장소 파일에서 직접 확인한 내용
- `[해석]`: 확인된 사실을 바탕으로 한 구조 해석
- `[권장]`: 다음 단계 실행을 위한 제안
- `[검증 필요]`: 런타임, 배포 환경, 실제 사용자 데이터 없이 단정할 수 없는 항목

---

## 0. 실행 요약

### 0.1 핵심 판단

[현행 확인]

- 이 저장소는 이미 `Dashboard → Planning → Recommend → Public Info/DART → Data Trust`로 이어지는 안정 영역(v2/Stable)을 갖고 있습니다.
- 동시에 `planning/v3`는 다수의 베타 경로, 전용 운영 명령, 별도 체크리스트까지 갖춘 상태입니다.
- 그러나 현재 공개 Prisma schema의 중심은 여전히 stable/public product와 `PlannerSnapshot` 쪽이며, `planning/v3`는 문서상 file/local store 경계가 중심입니다.
- `middleware.ts` 기준 state-changing `api/planning/*` 요청은 local-only 정책 아래 있습니다.

[해석]

- 지금 필요한 것은 **기능을 더 넓게 여는 것**이 아니라, `planning/v3`를 **하나의 검증 가능한 사용자 흐름**으로 좁혀 제품화하는 일입니다.
- 특히 현재 구조는 **공개 SaaS 확장**보다 **로컬-퍼스트 베타**에 더 잘 맞습니다.
- v3의 첫 승부처는 `뉴스`, `저널`, `노출도`, `시나리오`를 동시에 여는 것이 아니라, **거래내역 가져오기 → 자동 초안 생성 → stable planning 연결** 흐름입니다.

[권장]

- v3의 다음 단계는 아래 한 문장으로 정의하는 것이 가장 적절합니다.

> **Finance Project v3 Beta = 거래내역을 가져오면 자동으로 재무 진단 초안을 만들고, 이를 기존 Planning/Recommend 흐름에 안전하게 연결하는 로컬-퍼스트 개인 재무 코파일럿**

---

## 1. 현재 프로젝트 진단

### 1.1 강점

[현행 확인]

1. Stable 제품 루프가 이미 존재합니다.
   - Public IA는 `홈/대시보드`, `재무진단`, `상품추천`, `금융탐색`, `내 설정` 5축으로 정리되어 있습니다.
2. 운영/품질 자산이 강합니다.
   - `verify`, `planning:v2:complete`, `planning:ssot:check`, `planning:current-screens:guard`, `release:verify`, `e2e:rc` 등 명령과 가드가 풍부합니다.
3. 데이터 신뢰 레이어가 이미 자산화되어 있습니다.
   - `settings/data-sources`와 freshness/fallback contract가 stable surface와 연결되어 있습니다.
4. v3는 “아이디어” 수준이 아니라 이미 운영 가능한 실험 트랙입니다.
   - `v3:doctor`, `v3:export`, `v3:restore`, `v3:migrate`, `planning:v3:import:csv` 같은 명령이 존재합니다.
5. stable/beta/ops/dev를 구분하는 문서 습관이 좋습니다.
   - `docs/current-screens.md`, `analysis_docs/v2/14`, `analysis_docs/v2/15`가 이를 뒷받침합니다.

### 1.2 병목

[현행 확인]

1. `planning/v3`는 경로 수가 많지만, 공식 진입 흐름은 아직 좁혀져 있지 않습니다.
2. canonical owner / export / rollback / visibility 정책이 문서화되어 있으나, 구현 승격은 신중하게 보류된 항목이 많습니다.
3. v3의 owner는 문서상 file/local store 경계가 중심이며, stable Prisma 모델과 자동으로 합쳐져 있지 않습니다.
4. write route와 planning mutation은 local-only 보안 정책 아래 있습니다.

[해석]

1. **문제는 기능 부족이 아니라 경계 과다**입니다.
   - “할 수 있는 것”은 많지만, “사용자에게 먼저 보여 줄 하나의 흐름”이 아직 강하게 고정되지 않았습니다.
2. **v3는 아직 공개 웹 SaaS로 크게 열기보다, 로컬-퍼스트 실험 제품으로 좁혀야 안전합니다.**
3. **UI/route 확장 속도에 비해 canonical ownership과 복구 단위 정의가 더 중요해졌습니다.**
4. **뉴스/저널/노출도/시나리오를 동시에 전면에 올리면 제품 메시지가 다시 분산될 위험**이 큽니다.

### 1.3 가장 큰 기회

[해석]

현재 stable `Planning`의 가장 큰 마찰은 사용자가 직접 수치를 입력해야 한다는 점입니다.  
반대로 v3에는 이미 CSV import, batch, balances, draft, apply, preflight 흐름의 뼈대가 있습니다.

[권장]

- 다음 단계의 핵심 기회는 아래입니다.

> **“수동 입력형 플래너”를 “거래내역 기반 자동 초안 생성형 플래너”로 전환한다.**

이 전환은 다음 네 가지를 동시에 해결합니다.

1. 사용자 입력 부담 감소
2. v3의 존재 이유를 한 문장으로 설명 가능
3. stable Planning과 충돌하지 않고 보완 가능
4. 이후 MyData/계좌연동/정밀 계산 엔진으로 확장할 명확한 출발점 확보

---

## 2. v3 제품 정의

### 2.1 권장 제품 문장

[권장]

> **Finance Project v3 Beta는 사용자의 거래내역을 가져와 월별 현금흐름과 계좌 구조를 정리하고, 자동 생성된 재무 초안을 stable Planning에 연결해 더 빠른 진단과 실행 제안을 돕는 로컬-퍼스트 베타 기능입니다.**

### 2.2 포지셔닝

[권장]

- v2/stable: **현재 사용 가능한 공식 제품층**
- v3 beta: **데이터 수집 기반 자동화 레이어**
- ops/dev: **운영 및 검증 레이어**
- future expansion: **MyData, 정밀 세금/연금, optimizer, multi-user**

### 2.3 먼저 풀어야 할 JTBD

[권장]

1. “내 거래내역을 넣으면 지금 내 돈 흐름이 어떻게 보이는지 빨리 보고 싶다.”
2. “직접 월수입/월지출을 다 입력하지 않고도 플래닝 초안을 만들고 싶다.”
3. “자동 분류 결과가 이상하면 내가 쉽게 수정하고 다시 계산하고 싶다.”
4. “이 초안이 기존 Planning/Recommend에 안전하게 연결되는지 확인하고 싶다.”

---

## 3. 목표 사용자와 사용 시나리오

### 3.1 핵심 사용자

[권장]

#### A. 실무형 개인 사용자
- 직접 재무표를 만드는 것은 번거롭지만, CSV 정도는 가져올 수 있는 사용자
- 원하는 것: 자동 초안, 빠른 진단, 실행 가능한 다음 행동

#### B. 검증형 사용자
- 자동 분류를 그대로 믿지 않고 근거와 보정 가능성을 확인하려는 사용자
- 원하는 것: 배치 상세, 계좌 매핑 수정, preflight 검토, trust cue

#### C. 내부 운영/도메인 검토자
- v3 흐름이 데이터 손실 없이 재현되는지 보려는 사용자
- 원하는 것: doctor, export/restore, support bundle, targeted beta gate

### 3.2 대표 사용자 흐름

[권장]

1. 사용자가 `/planning/v3/transactions` 또는 `/planning/v3/transactions/batches`로 진입합니다.
2. CSV를 업로드하고 Import Batch를 생성합니다.
3. 배치 상세에서 계좌/카테고리/이체 여부를 보정합니다.
4. `/planning/v3/balances`에서 월별 흐름과 잔액 맥락을 확인합니다.
5. `/planning/v3/profile/drafts`에서 자동 생성된 프로필 초안을 검토합니다.
6. `/planning/v3/profile/drafts/[id]/preflight`로 적용 전 영향 범위를 확인합니다.
7. stable Planning에 apply한 뒤 `/planning/reports`로 이동합니다.
8. 필요 시 `/recommend`로 넘어가 stable 추천 흐름과 연결합니다.

---

## 4. 다음 단계 목표

### 4.1 제품 목표

[권장]

#### G1. v3를 “보여 줄 수 있는 하나의 베타 흐름”으로 축소한다.
- 경로가 많더라도 실제 제품 메시지는 하나로 유지합니다.
- 첫 공개 문장은 “거래내역 기반 자동 초안”으로 고정합니다.

#### G2. stable Planning을 깨지 않는 안전한 handoff를 만든다.
- v3는 stable planning을 대체하지 않고 공급하는 역할로 둡니다.
- `apply` 이후 stable report에서 결과를 보게 만듭니다.

#### G3. owner-first 계약과 복구 단위를 문서/코드 기준으로 닫는다.
- broad rewrite 대신, 현재 있는 owner family를 기반으로 stop line을 명확히 합니다.

#### G4. beta gate를 stable gate와 분리한다.
- beta 기본 검증은 `build/lint/test + targeted beta tests + v3:doctor`로 운용합니다.
- stable owner를 건드릴 때만 `planning:v2:complete`나 `release:verify`를 붙입니다.

#### G5. local-first에서 검증하고, 이후 cloud/public 여부를 별도 의사결정으로 넘긴다.
- auth/tenant/encryption/persistence 재설계 없이 SaaS처럼 넓게 열지 않습니다.

### 4.2 비목표

[권장]

이번 단계에서 하지 않을 것:

1. `planning/v3` 전체를 public stable로 승격
2. MyData/은행 API 본연동의 프로덕션 운영
3. 멀티유저/권한/암호화의 본구현
4. 세금/연금 엔진의 완전한 제품화
5. 뉴스/노출도/저널/시나리오를 v3의 메인 진입 축으로 승격
6. 직접적인 투자·대출 의사결정 단정 표현

---

## 5. 범위 정의

### 5.1 In Scope

[권장]

#### 제품 흐름
- `transactions/batches` 기반 CSV import 진입
- batch 상세 보정
- balances projection 확인
- profile draft list/detail/preflight/apply
- stable Planning report 연결
- 필요 시 Recommend handoff 1차 연결

#### 문서/계약
- canonical owner map의 실제 구현 사용처 재동기화
- beta entry/deep-link/internal 분류를 제품 문구에 반영
- v3 beta QA gate와 운영 runbook 정리

#### 운영/품질
- `pnpm build`
- `pnpm lint`
- `pnpm test`
- targeted beta e2e
- `pnpm v3:doctor`
- 필요 시 `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`

### 5.2 Out of Scope

[권장]

- `/planning/v3/news*`, `/planning/v3/journal`, `/planning/v3/exposure`, `/planning/v3/scenarios`를 기본 entry로 승격
- raw `/planning/v3/import/csv`, `/planning/v3/batches*`, `/planning/v3/drafts*`, `/planning/v3/categories/rules`를 일반 사용자 진입점으로 공개
- cloud 저장, 멀티테넌시, 회원계정 기반 운영
- stable Planning v2 핵심 계산식을 v3 때문에 재설계
- stable IA/nav 전면 개편

---

## 6. v3 노출 정책 제안

### 6.1 Public Beta Entry로 유지할 경로

[현행 확인]

문서상 overlay 기준으로 다음 축이 entry 후보입니다.

- `/planning/v3/profile/drafts`
- `/planning/v3/transactions`
- `/planning/v3/transactions/batches`
- `/planning/v3/balances`

[권장]

- 실제 베타 문서/온보딩/초대 링크에서도 이 4개 축만 공식 entry로 사용합니다.
- 이 중 가장 설명력이 높은 시작점은 `/planning/v3/transactions`입니다.

### 6.2 Deep-link Only로 유지할 경로

[현행 확인]

- `/planning/v3/accounts`
- `/planning/v3/profile/draft`
- `/planning/v3/profile/drafts/[id]`
- `/planning/v3/profile/drafts/[id]/preflight`
- `/planning/v3/transactions/batches/[id]`

[권장]

- 이 경로들은 “목록/이전 단계 뒤에서 열리는 상세 검토 화면”으로만 취급합니다.
- 헤더, 홈, 공개 소개문에서는 직접 진입점처럼 설명하지 않습니다.

### 6.3 Internal/Experimental Only로 유지할 경로

[현행 확인]

- `start`, `batches*`, `drafts*`, `categories/rules`, `import/csv`, `exposure`, `journal`, `news*`, `scenarios` 다수는 overlay 기준 internal/experimental only입니다.

[권장]

- 이 축은 이번 단계에서 제품 설명에서 빼는 것이 맞습니다.
- 존재를 부정하지 않되, “다음에 보여 줄 것”이 아니라 “지금은 숨겨 둘 것”으로 다룹니다.

---

## 7. 데이터/아키텍처 원칙

### 7.1 owner-first

[현행 확인]

- v2 문서는 path가 아니라 owner 기준으로 export/rollback/visibility를 읽도록 정리되어 있습니다.

[권장]

- 다음 단계 구현과 문서 갱신은 **화면 단위가 아니라 owner family 단위**로 합니다.
- 화면 요구가 생겨도 owner 정의가 먼저 닫히지 않으면 기능 승격을 보류합니다.

### 7.2 stable-v2 / beta-v3 분리

[현행 확인]

- stable planning canonical owner는 `PlannerSnapshot` 중심이고, v3 owner는 file/local store 중심으로 구분되어 있습니다.

[권장]

- `apply` 이전까지 v3는 stable owner를 대체하지 않습니다.
- `apply` 이후 결과를 stable Planning이 받더라도, v3 owner와 stable owner를 하나의 aggregate로 섞지 않습니다.

### 7.3 local-first

[현행 확인]

- state-changing `api/planning/*`는 local-only 정책입니다.

[해석]

- 현재 구조에서 v3를 곧바로 인터넷 공개 SaaS처럼 운영하는 것은 제품/보안/저장 경계를 한 번에 다시 열게 만듭니다.

[권장]

- 다음 단계는 **로컬-퍼스트 베타**로 고정합니다.
- packaged runtime 또는 내부 초대형 베타가 더 적합합니다.

### 7.4 trust-first copy

[현행 확인]

- stable 영역은 source freshness/fallback/trust hub 문법을 이미 갖고 있습니다.

[권장]

- v3에서도 “정답/확정”이 아니라 “초안/검토/적용 전 확인” 톤을 유지합니다.
- 자동 생성 결과에는 항상 수정 가능성과 적용 전 검토 문구를 함께 둡니다.

---

## 8. 권장 로드맵

## Phase 1. Contract Freeze + Entry Alignment

### 목표
- import/draft/balance/apply 축의 owner/entry/gate를 한 장으로 정리합니다.

### 핵심 산출물
- v3 Beta Entry Map
- import/draft/apply owner matrix
- handoff boundary memo
- beta gate checklist
- error/fallback/trust copy 초안

### 완료 기준
- 공식 entry가 1문장으로 설명된다.
- stable/beta/internal 경계가 문서/실제 링크에서 어긋나지 않는다.
- broad `planning/v3` 소개 대신 import-to-draft funnel 설명으로 수렴한다.

---

## Phase 2. Local-First Beta Funnel

### 목표
- 사용자가 실제로 `CSV import → draft → preflight → apply → planning report`를 끝까지 수행할 수 있게 합니다.

### 핵심 산출물
- batch list/detail UX 정리
- balances 확인 흐름 정리
- profile draft list/detail/preflight/apply 흐름 정리
- stable Planning report follow-through
- 필요 시 Recommend handoff 1차 연결

### 완료 기준
- golden/fixture 기준 import-to-report 재현 가능
- apply 이후 stable report까지 one-flow로 확인 가능
- 데이터 손실/중복/적용 오류가 blocker 0건 상태로 관리된다

---

## Phase 3. Beta Readiness + Limited Exposure

### 목표
- 운영/QA/feedback 기준을 붙여 “보여 줄 수 있는 베타” 상태로 만듭니다.

### 핵심 산출물
- beta gate matrix 실사용판
- `v3:doctor`/`export`/`restore` 운영 루틴
- support bundle runbook
- 베타 사용자 안내문
- 피드백 수집/이슈 triage 규칙

### 완료 기준
- targeted beta gate가 실행 루틴으로 굳어진다
- stable gate와 beta gate를 혼동하지 않는다
- 베타 범위 밖 경로가 다시 제품 소개문에 섞이지 않는다

---

## 9. 세부 백로그 제안

### 9.1 P0 — 반드시 먼저

1. **v3 공식 제품 문장 고정**
   - “거래내역 기반 자동 재무초안 베타”로 문구 통일
2. **공식 beta entry 4개 경로 고정**
   - transactions / transactions-batches / balances / profile-drafts
3. **stable handoff 정책 문서화**
   - apply 이후 stable owner로 연결되는 경계 명확화
4. **beta gate 기본 세트 명시**
   - build/lint/test/targeted beta e2e/v3:doctor
5. **로컬-퍼스트 배포 전략 고정**
   - public SaaS 전환은 후속 의사결정으로 분리

### 9.2 P1 — 바로 다음

1. **Import → Draft → Report funnel instrumentation**
2. **draft apply 후 stable report follow-through 개선**
3. **Recommend handoff 1차 연결**
4. **beta 전용 피드백 수집 폼/로그 규칙**
5. **support bundle / restore drill 운영화**

### 9.3 P2 — 후속 확장

1. **MyData/계좌 API adapter 연구 트랙**
2. **정밀 세금/연금 계산 엔진 설계**
3. **optimizer 정식 기능 승격 기준**
4. **multi-user/auth/encryption 아키텍처 설계**
5. **cloud/public 전환 feasibility review**

---

## 10. KPI 제안

### 10.1 North Star

[권장]

- **Import 시작 → stable planning report 도달률**

### 10.2 제품 KPI

[권장]

- CSV import 시작률
- batch 생성 성공률
- batch 수정 완료율
- profile draft 생성률
- preflight 통과율
- apply 성공률
- apply 후 planning report 열람률
- planning report에서 recommend 이동률

### 10.3 품질 KPI

[권장]

- targeted beta e2e 통과율
- `pnpm v3:doctor` 실패 건수
- 데이터 손실/중복/적용 오류 blocker 건수
- stable regression 발생 건수
- restore drill 성공률

### 10.4 신뢰 KPI

[권장]

- 사용자가 수동 보정한 비율
- preflight에서 중단된 비율
- “자동 초안 신뢰 가능” 피드백 비율
- fallback/repair 안내 노출 대비 이탈률

---

## 11. 필수 의사결정

[권장]

다음 단계 시작 전 아래 5개를 먼저 확정하는 것이 좋습니다.

1. **v3의 1차 배포 형태**
   - local runtime / packaged runtime / limited internal beta 중 무엇으로 갈지
2. **v3의 공식 entry**
   - `transactions`를 대표 entry로 둘지, `profile/drafts`를 대표 entry로 둘지
3. **Recommend handoff 포함 여부**
   - 1차 베타에 포함할지, report까지만 닫고 후속으로 넘길지
4. **베타 사용자 범위**
   - 내부 검토자 한정인지, 제한된 외부 사용자까지 포함할지
5. **Cloud/public 전환 시점**
   - 이번 단계에서 다루지 않고 후속 아키텍처 트랙으로 넘길지

---

## 12. 첫 2주 실행안

[권장]

### Week 1
- v3 공식 제품 문장 확정
- beta entry/deep-link/internal route 문구 확정
- import/draft/apply owner map 최신화
- beta gate runbook 초안 작성

### Week 2
- import-to-report 대표 시나리오 1건을 기준으로 테스트/문서/UX wording 정렬
- preflight/apply 안내문 정리
- stable report 연결부 helper 정리
- 베타 피드백 수집 방식 확정

---

## 13. 최종 제안

[권장]

이 프로젝트의 v3 다음 단계는 “무엇을 더 많이 열 것인가”가 아니라,  
**“이미 존재하는 v3 자산을 하나의 베타 사용자 경험으로 수렴시킬 것인가”**가 핵심입니다.

가장 좋은 다음 단계는 아래처럼 정리됩니다.

> **v3를 ‘모든 실험 경로의 집합’이 아니라,  
> ‘거래내역을 가져와 자동 재무초안을 만들고 stable Planning에 연결하는 로컬-퍼스트 베타’로 다시 정의한다.**

이 방향이면 현재 저장소의 강점인

- stable product loop
- route/문서 분류 습관
- QA/guard/runbook 자산
- data trust 설계
- v3 import/draft/apply 뼈대

를 버리지 않고, 다음 단계의 제품 메시지와 실행 우선순위를 동시에 좁힐 수 있습니다.

---

## 부록 A. 참고한 저장소 파일

- `README.md`
- `package.json`
- `docs/current-screens.md`
- `docs/planning-v3-kickoff.md`
- `RELEASE_CHECKLIST_V3.md`
- `prisma/schema.prisma`
- `middleware.ts`
- `analysis_docs/v1/README.md`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
- `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
