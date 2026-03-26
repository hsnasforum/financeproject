# 02. financeproject v3 실행 제안서

작성 기준

- 대상 저장소: `hsnasforum/financeproject`
- 분석 시점: 2026-03-25 (KST)
- 분석 범위: 공개 저장소 정적 분석 + `analysis_docs/v1`, `analysis_docs/v2` 흐름 계승
- 제안 목적: 다음 사이클을 실제로 시작할 수 있도록 실행 방식, 우선순위, 리스크, 역할, 게이트를 제안

문서 성격

- `[현행 확인]`: 저장소에서 확인한 내용
- `[해석]`: 현재 구조에 대한 판단
- `[권장]`: 실행안 제안
- `[검증 필요]`: 실제 팀/예산/배포 목표에 따라 달라질 수 있는 가정

---

## 0. 제안 요약

[권장]

### 추천안
**Option B. 로컬-퍼스트 `Import-to-Planning Beta` 추진**

### 추천 이유
- 현재 `planning/v3`는 local/file-store + local-only write guard 구조와 더 잘 맞습니다.
- 이미 import, batch, balances, draft, apply, doctor, export/restore 자산이 있어 “작지만 보여 줄 수 있는 베타”를 만들 수 있습니다.
- 반대로 지금 바로 cloud/multi-user 방향으로 점프하면 auth, tenant, encryption, persistence, compliance를 동시에 다시 열게 됩니다.

### 권장 결과물
1. v3 공식 제품 문장 확정
2. 공식 beta entry 4개 route 고정
3. `CSV import → draft → apply → stable report` 베타 흐름 완성
4. beta 전용 게이트/운영 루틴 정착
5. 이후 MyData/정밀 계산/멀티유저로 가는 후속 아키텍처 의사결정 준비

### 권장 일정
- **1차 베타 기준 8~10주 내외**의 3단계 실행
- 단, 이는 제안 일정이며 실제 인력 구성에 따라 조정 필요

---

## 1. 왜 지금 이 제안이 필요한가

### 1.1 현재 상태

[현행 확인]

- stable/public 제품 영역은 이미 강합니다.
- v2 로드맵 상 P1~P3는 closeout 상태입니다.
- 다음 공식 축은 `N1 canonical entity model → N2 API/import-export/rollback → N3 QA gate/golden dataset → N4 beta exposure → N5 stable polish` 흐름으로 좁혀져 있습니다.
- `planning/v3`는 route와 ops script가 풍부하지만, 전체를 제품 전면으로 올리기에는 아직 경계가 넓습니다.

### 1.2 지금 그대로 가면 생기는 문제

[해석]

1. **문서만 많고 제품 메시지는 흐려질 수 있습니다.**
2. **v3 전체를 한꺼번에 보여 주면 사용자는 무엇을 먼저 해야 하는지 이해하기 어렵습니다.**
3. **stable gate와 beta gate를 섞으면 릴리즈 속도도 느려지고 책임 경계도 흐려집니다.**
4. **현재 local-first 구조를 무시하고 public cloud처럼 열면 보안/저장/권한 문제를 한 번에 떠안게 됩니다.**

### 1.3 따라서 필요한 제안

[권장]

- 다음 사이클은 broad rewrite가 아니라 **작은 베타 제품 하나를 완성하는 실행안**이어야 합니다.
- 그 베타 제품은 `planning/v3` 전체가 아니라, **import-to-planning handoff**에 집중해야 합니다.

---

## 2. 대안 비교

## Option A. 계약/문서 정리만 계속 진행

### 설명
- N1~N4 문서를 계속 다듬고, 사용자에게 보여 줄 제품 흐름은 후순위로 둡니다.

### 장점
- 구현 리스크가 낮습니다.
- owner/contract 정리는 더 정교해집니다.

### 단점
- 사용자가 체감할 변화가 거의 없습니다.
- 팀 내부에서도 “그래서 무엇을 출시하는가”가 약해집니다.
- v3의 존재 이유가 계속 문서 중심으로만 남을 수 있습니다.

### 판단
[해석]
- 안전하지만, 다음 단계의 추진력을 만들기에는 부족합니다.

---

## Option B. 로컬-퍼스트 `Import-to-Planning Beta` 추진

### 설명
- `transactions/batches → balances → profile/drafts → preflight/apply → stable report`를 하나의 베타 흐름으로 만듭니다.

### 장점
- 현재 구조와 가장 잘 맞습니다.
- 사용자에게 설명 가능한 가치가 즉시 생깁니다.
- stable product를 깨지 않고 v3의 역할을 분명히 할 수 있습니다.
- 이후 MyData/정밀 계산/추천 연동으로 확장하기 쉽습니다.

### 단점
- cloud/public SaaS처럼 보이기엔 제한이 있습니다.
- 베타 범위를 강하게 통제해야 합니다.
- route 수가 많아도 실제 노출 경로를 과감히 줄여야 합니다.

### 판단
[권장]
- **가장 현실적이고, 가장 빠르게 다음 단계 성과를 만들 수 있는 선택지**입니다.

---

## Option C. 곧바로 cloud/multi-user 방향으로 전환

### 설명
- v3를 public web product 또는 SaaS 전제로 재정의하고 auth, tenant, encryption, server persistence를 함께 엽니다.

### 장점
- 장기적으로는 큰 시장/운영 구조로 갈 수 있습니다.
- “제품 비전”만 보면 더 공격적입니다.

### 단점
- 현재 구조와 맞지 않는 범위가 많습니다.
- `middleware`, persistence boundary, ownership, 복구 단위, 개인정보 정책을 동시에 다시 열어야 합니다.
- 베타 검증보다 플랫폼 재설계가 먼저 됩니다.

### 판단
[해석]
- 지금 당장 고르기엔 범위가 너무 큽니다.
- future architecture track으로 따로 분리하는 것이 적절합니다.

---

## 3. 최종 추천안

[권장]

### 선택
**Option B. 로컬-퍼스트 `Import-to-Planning Beta`**

### 선택 근거
1. 현재 저장소의 local-only write 정책과 file/local owner 구조를 존중합니다.
2. 이미 존재하는 v3 자산을 가장 효율적으로 재사용합니다.
3. stable product와 beta product의 경계를 유지할 수 있습니다.
4. 베타 성공 여부를 실제 사용자 흐름으로 검증할 수 있습니다.
5. 실패하더라도 stable product 전체를 크게 흔들지 않습니다.

---

## 4. 제안 범위

### 4.1 1차 릴리즈 범위

[권장]

#### 포함
- `/planning/v3/transactions`
- `/planning/v3/transactions/batches`
- `/planning/v3/transactions/batches/[id]`
- `/planning/v3/balances`
- `/planning/v3/profile/drafts`
- `/planning/v3/profile/drafts/[id]`
- `/planning/v3/profile/drafts/[id]/preflight`
- stable `/planning/reports` 연결

#### 제한적 포함
- `/planning/v3/accounts`
- Recommend handoff 1차 연결
- 피드백 수집/에러 리포트/support bundle

#### 제외
- `/planning/v3/news*`
- `/planning/v3/journal`
- `/planning/v3/exposure`
- `/planning/v3/scenarios`
- raw `/planning/v3/import/csv`
- raw `/planning/v3/batches*`
- raw `/planning/v3/drafts*`
- cloud auth / multi-user / encryption 본구현

### 4.2 배포 형태

[권장]

우선순위는 아래 순서가 좋습니다.

1. **내부 dogfood / 로컬 실행**
2. **packaged runtime 또는 제한 배포**
3. **후속 cloud feasibility review**

---

## 5. 실행 구조 제안

## 5.1 워크스트림

### Stream A. Product Flow
- import 진입
- batch detail correction
- balances 확인
- draft review / preflight / apply
- stable report 연결
- recommend 연결 여부 판단

### Stream B. Contract & QA
- owner map 최신화
- beta entry/deep-link/internal 문서 동기화
- targeted beta gate 정리
- golden fixture 및 support runbook 유지

### Stream C. Ops & Readiness
- `v3:doctor`
- `v3:export`
- `v3:restore`
- support bundle
- 베타 피드백/triage 운영

## 5.2 의사결정 방식

[권장]

- 제품 판단은 “사용자에게 보여 줄 한 흐름이 더 선명해지는가” 기준으로 합니다.
- 아키텍처 판단은 “owner/rollback 단위가 더 명확해지는가” 기준으로 합니다.
- 베타 노출 판단은 “entry/deep-link/internal이 더 단순해지는가” 기준으로 합니다.

---

## 6. 일정 제안

## Phase 1. 2주 — 계약 고정과 entry 정렬

### 목표
- 무엇을 보여 줄지 먼저 결정합니다.

### 해야 할 일
- 공식 beta entry 4개 경로 확정
- import/draft/apply owner boundary 문서 최신화
- 베타 톤앤매너(초안/검토/적용 전 확인) 확정
- beta gate 기본 세트 명시

### 종료 기준
- 한 문장 제품 정의 확정
- entry/deep-link/internal 설명 확정
- 구현팀/QA가 같은 대상 경로를 보고 일할 수 있음

---

## Phase 2. 3~4주 — 베타 핵심 흐름 완성

### 목표
- 실제로 사용 가능한 beta funnel을 닫습니다.

### 해야 할 일
- import 시작 경로 정리
- batch correction 흐름 정리
- balances projection 점검
- profile draft list/detail/preflight/apply 완성
- stable report follow-through 연결
- 필요 시 recommend handoff 1차 적용

### 종료 기준
- import-to-report 대표 시나리오 재현 가능
- apply 후 stable report 열림
- blocker급 데이터 손실/중복 문제 0건

---

## Phase 3. 3~4주 — 베타 readiness와 운영화

### 목표
- 운영 가능한 베타 상태로 만듭니다.

### 해야 할 일
- targeted beta e2e/fixture 루틴 정착
- `v3:doctor`, export/restore drill
- support bundle 운영화
- 피드백 수집과 issue triage 체계 정착
- 배포 형태(local/package/internal beta) 최종 결정

### 종료 기준
- 베타 운영 체크리스트 통과
- stable gate와 beta gate 혼동 없음
- 베타 사용자의 첫 진입/실패/수정/적용 로그를 읽을 수 있음

---

## 7. 산출물 제안

[권장]

### 문서
1. v3 다음 단계 기획서
2. v3 실행 제안서
3. beta entry map
4. import/draft/apply owner map
5. beta gate runbook
6. support/restore 운영 메모

### 구현/운영 산출물
1. import-to-report 대표 시나리오
2. targeted beta test evidence
3. doctor/export/restore 실행 로그
4. 피드백 triage 보드
5. go/no-go 체크리스트

---

## 8. 인력 구성 제안

## 8.1 최소안

[권장]

- Full-stack 1
- Product/QA 0.5
- 장점: 비용 최소
- 단점: 문서/구현/테스트가 한 사람에게 과도하게 집중됨

## 8.2 권장안

[권장]

- Full-stack 2
- Product/QA 0.5~1
- Design 0.2~0.3
- 장점: contract/flow/QA를 병렬 처리 가능
- 단점: 최소안보다 조율 비용 증가

## 8.3 확장안

[권장]

- Full-stack 2~3
- Product 1
- QA 1
- Design 0.5
- Domain advisor 0.2
- 장점: beta와 후속 MyData/정밀 계산 연구를 병행 가능
- 단점: 이번 단계의 본질보다 조직이 커질 수 있음

### 최종 권장
- **권장안**이 가장 균형이 좋습니다.

---

## 9. 게이트 제안

### 9.1 beta 기본 게이트

[권장]

- `pnpm build`
- `pnpm lint`
- `pnpm test`
- targeted beta e2e
- `pnpm v3:doctor`

### 9.2 조건부 게이트

[권장]

- route/href/current-screens 변경 시  
  - `pnpm planning:current-screens:guard`
- route policy와 planning static guard를 같이 건드릴 때  
  - `pnpm planning:ssot:check`
- stable owner bridge를 함께 건드릴 때  
  - `pnpm planning:v2:complete`
  - 필요 시 `pnpm planning:v2:compat`

### 9.3 기본적으로 beta에 강제하지 않을 것

[현행 확인]

- 문서상 `release:verify`와 `e2e:rc`는 stable RC 중심입니다.

[권장]

- beta 변경의 기본 required gate로 `release:verify`를 두지 않습니다.
- stable flow에 직접 영향이 있을 때만 advisory/conditional로 붙입니다.

---

## 10. 리스크와 대응

## R1. v3 범위가 다시 넓어질 위험

- 위험: news/journal/exposure/scenarios까지 동시에 다시 열 수 있음
- 대응:
  - 공식 entry 4개 경로만 사용
  - 제품 소개문에서 비핵심 경로 제외
  - internal route는 링크 승격 금지

## R2. local-first와 public product 기대가 충돌할 위험

- 위험: 사용자나 팀이 “왜 웹에서 바로 안 되나”를 묻기 시작할 수 있음
- 대응:
  - 베타 정의를 로컬-퍼스트로 명시
  - cloud/public은 후속 architecture track으로 분리
  - auth/tenant 결정 없이는 승격 금지

## R3. stable regression 위험

- 위험: apply/handoff 과정이 stable planning을 흔들 수 있음
- 대응:
  - bridge-only 원칙 유지
  - stable owner 변경 시 conditional stable gate 실행
  - apply 이후 결과 검증은 stable report에서 수행

## R4. 자동 초안 신뢰 부족 위험

- 위험: 사용자가 분류 결과를 믿지 않거나 수정이 많을 수 있음
- 대응:
  - preflight와 수정 가능성 강조
  - “초안/검토/적용 전 확인” 톤 유지
  - correction rate 자체를 KPI로 측정

## R5. 운영 복구 준비 부족 위험

- 위험: local/file-store 기반이면 export/restore 준비가 미흡할 수 있음
- 대응:
  - `v3:doctor`, `v3:export`, `v3:restore`를 베타 readiness 기준에 포함
  - support bundle을 증빙 루틴으로 운영

---

## 11. 성공 기준 제안

[권장]

### 제품 성공 기준
- import-to-report 대표 흐름이 끊김 없이 재현된다
- 사용자가 draft 생성과 apply 의미를 이해한다
- 베타 첫 진입 경로가 한 문장으로 설명된다

### 품질 성공 기준
- beta 기본 게이트 통과
- blocker급 데이터 손실 0건
- stable regression 0건 또는 즉시 복구 가능 상태

### 운영 성공 기준
- doctor/export/restore 실행 증빙 확보
- 피드백과 장애를 triage할 채널이 있다
- internal/manual beta 운영 절차가 문서화된다

### 사업적 성공 기준
- “이제 v3로 무엇을 보여 줄 것인가”가 팀 내부에서 합의된다
- 이후 MyData/정밀 계산/멀티유저로 가는 우선순위를 데이터 기반으로 정할 수 있다

---

## 12. 승인 요청 항목

[권장]

다음 6가지를 승인하면 바로 실행에 들어갈 수 있습니다.

1. **추천안 채택**
   - Option B 로컬-퍼스트 `Import-to-Planning Beta`
2. **공식 진입 범위 승인**
   - transactions / transactions-batches / balances / profile-drafts
3. **비노출 범위 승인**
   - news/journal/exposure/scenarios/raw import/raw batches/raw drafts
4. **배포 형태 승인**
   - internal/local/package 우선
5. **게이트 정책 승인**
   - beta 기본 게이트와 stable 조건부 게이트 분리
6. **후속 architecture track 분리 승인**
   - cloud/multi-user는 이번 단계와 분리

---

## 13. 바로 시작할 첫 액션

[권장]

1. `v3` 공식 제품 문장을 1문장으로 lock
2. beta entry 4개와 deep-link/internal 목록을 팀 기준으로 확정
3. import-to-report 대표 시나리오 1건을 기준 사용자 흐름으로 선정
4. owner map / gate runbook / feedback channel 동기화
5. Phase 1 종료 시점에 “베타로 보여 줄 수 있는가”만 판단

---

## 14. 최종 제안

[권장]

financeproject의 다음 단계는  
**“v3를 얼마나 많이 만들 것인가”가 아니라,  
“v3를 어떤 작은 제품으로 먼저 증명할 것인가”**의 문제입니다.

가장 좋은 선택은 아래입니다.

> **`planning/v3`를 로컬-퍼스트 Import-to-Planning Beta로 좁히고,  
> 계약·게이트·노출 범위를 함께 잠근 뒤,  
> stable Planning/Recommend로 이어지는 한 개의 검증 가능한 루프를 출시한다.**

이렇게 가면 지금까지 쌓은

- stable product maturity
- data trust 설계
- QA/runbook 자산
- v3 import/draft/apply 뼈대
- route policy 문서화 습관

을 그대로 살리면서, 다음 단계의 실행력도 확보할 수 있습니다.

---

## 부록 A. 실무 체크리스트

### 시작 전
- [ ] 제품 문장 합의
- [ ] entry/deep-link/internal 분류 합의
- [ ] beta 배포 형태 합의

### 구현 중
- [ ] import-to-report 대표 시나리오 유지
- [ ] stable bridge 범위 통제
- [ ] beta gate evidence 누적

### 종료 전
- [ ] doctor/export/restore 증빙
- [ ] feedback/triage 채널 운영
- [ ] go/no-go 기준 합의
