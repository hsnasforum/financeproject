# 11. post-Phase-3 vNext backlog 정의

작성 기준: `P1 ~ P3` 13개 항목 closeout 완료 상태, 2026-03-17(KST)
범위: 다음 공식 구현 사이클의 backlog 정의

---

## 1. 목적

이 문서는 기존 `P1 ~ P3` 완료 로드맵 이후의 다음 사이클을
기능 추가가 아니라 `planning/v3`와 운영 규칙의 제품화 준비 단계로 다시 정의하기 위한 backlog 문서입니다.

이번 문서의 목적은 아래 4가지입니다.

1. 다음 사이클의 공식 backlog를 3~5개 항목으로 고정한다.
2. `planning/v3` 관련 작업을 `contract-first` 원칙으로 다시 정렬한다.
3. `product UX polish`, `beta exposure`, `ops/QA gate`를 독립 backlog로 어디까지 분리할지 정한다.
4. 기존 완료 로드맵과 섞지 않고, 새 사이클의 우선순위와 선행 조건을 문서로 남긴다.

---

## 2. backlog 분류 틀

다음 사이클 backlog는 아래 4개 분류로만 관리합니다.

### 2.1 contract-first

- canonical entity
- storage ownership
- API/DTO/input-output contract
- import/export/rollback/repair rule

원칙:
- public beta 노출보다 먼저 닫아야 한다.
- 코드보다 문서와 contract가 먼저다.

### 2.2 product UX polish

- 기존 stable surface의 copy, helper, 위계, CTA polish
- 기존 규칙을 깨지 않는 작은 개선만 다룬다.

원칙:
- 독립 대형 축으로 먼저 열지 않는다.
- contract-first backlog를 막는 blocker가 아닐 때만 후순위로 둔다.

### 2.3 beta exposure

- 어떤 route를 public beta로 보일지
- 어떤 조건에서 stable/beta/internal로 분리할지
- visibility / onboarding / guard 정책

원칙:
- `planning/v3` canonical contract와 QA gate가 먼저 있어야 한다.

### 2.4 ops/QA gate

- public stable / public beta / ops-dev 검증 분리
- golden dataset
- release gate / regression gate 재정의

원칙:
- 단순 테스트 추가가 아니라 제품 경계에 맞는 통과 기준을 다시 세우는 작업으로 본다.
- `planning/v3` 계약이 어느 정도 닫힌 뒤 독립 항목으로 다룬다.

---

## 3. 다음 사이클 공식 backlog

## N1. planning/v3 canonical entity model 정의

- 분류: `contract-first`
- 목적:
  `planning/v3`의 계좌/잔액/거래/배치/카테고리 규칙/프로필 draft/시나리오 draft/news alert를 어떤 canonical entity 집합으로 소유할지 고정한다.
- 왜 지금 필요한가:
  current route inventory는 넓지만 공개 schema와 정합한 owner 모델이 아직 명확히 드러나지 않는다. 이 상태에서 화면이나 beta exposure를 먼저 늘리면 변경 비용이 급격히 커진다.
- 선행 조건:
  없음. 다음 사이클의 가장 첫 항목이다.
- 구현 전에 먼저 필요한 문서/계약:
  - canonical entity list
  - entity별 owner / key / lifecycle / relation
  - stable route와 beta route가 어떤 entity를 읽고 쓰는지 mapping
- 완료 기준:
  - `planning/v3` 핵심 엔티티 목록이 문서로 고정됨
  - 공개 schema와 route inventory 사이의 불일치/미확인 구간이 정리됨
  - 후속 API/DTO 설계가 이 문서를 기준으로만 진행될 수 있음

연결 메모 (2026-03-17):
- canonical entity inventory와 owner 경계는 `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`를 기준으로 잠급니다.
- `PlannerSnapshot`와 `planning/v3` file/local owner는 같은 canonical set으로 합치지 않습니다.
- `N2`의 API/import-export/rollback 논의는 이 문서의 entity name, owner, key, lifecycle을 그대로 재사용합니다.

## N2. planning/v3 API / import-export / rollback contract 정의

- 분류: `contract-first`
- 목적:
  v3의 input/output contract와 import/export, rollback/repair, permission/visibility rule을 canonical entity 위에서 다시 고정한다.
- 왜 지금 필요한가:
  storage owner가 고정되지 않으면 API와 import/export가 화면 단위로 흩어지고, rollback/repair 정책도 route마다 달라질 위험이 크다.
- 선행 조건:
  - `N1` canonical entity model
- 구현 전에 먼저 필요한 문서/계약:
  - route별 request/response contract 초안
  - import batch / draft / apply / preview 흐름 구분
  - rollback / repair / trash / restore ownership 규칙
- 완료 기준:
  - v3 주요 route의 contract 초안이 문서로 고정됨
  - import-export와 rollback/repair rule이 화면이 아니라 owner 기준으로 정리됨
  - permission/visibility rule이 stable/beta/internal 분류와 연결됨

## N3. QA gate 재정의와 golden dataset 기준 정리

- 분류: `ops/QA gate`
- 목적:
  `public stable`, `public beta`, `ops/dev`를 같은 검증 세트로 보지 않고, 다음 사이클용 release gate와 regression gate를 다시 정의한다.
- 왜 지금 필요한가:
  현재 검증 자산은 풍부하지만, 다음 사이클에서는 `planning/v3`의 beta exposure와 stable surface를 다른 기준으로 다뤄야 한다.
- 선행 조건:
  - `N1` canonical entity model
  - `N2` API / import-export / rollback contract 초안
- 구현 전에 먼저 필요한 문서/계약:
  - route policy별 검증 레벨
  - golden dataset 범위
  - stable/beta release check 분리 원칙
- 완료 기준:
  - `public stable / beta / ops-dev`별 최소 gate가 문서로 고정됨
  - golden dataset이 어떤 contract를 검증하는지 연결됨
  - release 전에 어떤 세트를 반드시 통과해야 하는지 정의됨

## N4. planning/v3 beta exposure / visibility policy

- 분류: `beta exposure`
- 목적:
  `planning/v3`를 어떤 순서로 public beta에 노출할지, 어떤 route는 계속 internal/experimental로 둘지 결정한다.
- 왜 지금 필요한가:
  canonical model과 QA gate가 정리되지 않은 상태에서 route만 먼저 보이면, 제품 정의보다 실험이 먼저 노출된다.
- 선행 조건:
  - `N1` canonical entity model
  - `N2` API / import-export / rollback contract
  - `N3` QA gate 재정의
- 구현 전에 먼저 필요한 문서/계약:
  - beta entry criteria
  - visibility / onboarding / fallback policy
  - route별 stable/beta/internal classification
- 완료 기준:
  - v3 route를 stable/beta/internal로 다시 나눈 노출 정책이 문서로 고정됨
  - beta 사용자에게 보여줄 진입 경로와 숨길 경로가 명확해짐
  - visibility policy가 current-screens 및 release gate와 충돌하지 않음

## N5. public/stable UX polish backlog

- 분류: `product UX polish`
- 목적:
  기존 stable surface의 trust/helper/copy polish를 작은 유지보수 backlog로 묶어, contract-first 작업을 방해하지 않으면서 후순위 개선을 관리한다.
- 왜 지금 필요한가:
  P3 closeout 이후 polish 여지는 남아 있지만, 이를 다음 사이클의 1순위 대형 축으로 올리면 `planning/v3` contract 정리가 다시 밀린다.
- 선행 조건:
  없음
- 구현 전에 먼저 필요한 문서/계약:
  - 개선 대상 surface list
  - blocker가 아닌 small-batch 기준
  - trust hub / public helper / support-layer 원칙 유지 규칙
- 완료 기준:
  - polish 항목이 contract-first backlog와 분리된 작은 개선 queue로 정리됨
  - next cycle의 1순위 작업을 막지 않는 보조 backlog로 유지됨

---

## 4. 권장 우선순위

다음 사이클 공식 우선순위는 아래 순서로 고정합니다.

1. `N1` planning/v3 canonical entity model 정의
2. `N2` planning/v3 API / import-export / rollback contract 정의
3. `N3` QA gate 재정의와 golden dataset 기준 정리
4. `N4` planning/v3 beta exposure / visibility policy
5. `N5` public/stable UX polish backlog

정리:
- `planning/v3`는 public beta 노출 확대보다 canonical model과 contract를 먼저 닫습니다.
- `QA gate 재정의`는 v3 계약 정의에 종속되지만, release policy와 stable/beta/ops-dev 경계를 다시 세우는 별도 backlog이므로 독립 항목으로 둡니다.
- 사용자 문구 polish는 독립 대형 축이 아니라 후순위의 작은 보조 backlog로 둡니다.

---

## 5. 선행 조건과 연결 규칙

- `N1`이 닫히기 전:
  새 v3 stable route, broad beta exposure, public-facing copy 확장 금지
- `N2`가 닫히기 전:
  import/export/rollback behavior를 화면별 예외로 늘리지 않음
- `N3`가 닫히기 전:
  stable/beta/ops-dev를 같은 release gate로 다루지 않음
- `N4`가 닫히기 전:
  v3 route를 public stable처럼 문서/헤더/홈에 노출하지 않음
- `N5`는 항상:
  contract-first backlog를 막지 않는 small-batch 보조 개선으로만 연다

---

## 6. 현재 로드맵과의 연결

- `financeproject_next_stage_plan.md`는 `P1 ~ P3` 완료 로드맵으로 유지합니다.
- 다음 구현 사이클의 공식 backlog는 이 문서(`11_post_phase3_vnext_backlog.md`)를 기준으로 시작합니다.
- 기존 완료 항목은 reopen하지 않고, 필요하면 `N1 ~ N5` backlog 아래의 후속 계약/정책/노출 작업으로만 이어집니다.

---

## 7. 이번 단계 결론

- post-Phase-3의 공식 backlog는 `N1 ~ N5` 다섯 항목으로 제한합니다.
- 다음 사이클의 1순위는 `planning/v3 canonical entity model 정의`입니다.
- public beta 노출 확대보다 canonical contract와 QA gate를 먼저 고정합니다.
- UX polish는 별도 대형 축이 아니라 보조 backlog로 내립니다.
