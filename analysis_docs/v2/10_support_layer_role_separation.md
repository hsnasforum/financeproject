# 10. support layer 역할 분리 결정

작성 기준: 저장소 코드 정적 분석, 2026-03-17(KST)
범위: `P3-4 support-layer role separation definition`

---

## 1. 목적

이 문서는 `DART / 혜택 / 주거 / 환율` 기능을
독립 기능 축으로 계속 늘리는 대신, 어떤 host surface 안에서 어떤 역할로만 보여야 하는지 먼저 고정하기 위한 결정 문서입니다.

이번 라운드의 목표는 아래 4가지입니다.

1. 각 기능의 `primary host surface`와 `secondary host surface`를 고정한다.
2. standalone route를 유지할지, 유지하더라도 어떤 의미로만 남길지 정한다.
3. public helper로만 붙일 수 있는 범위와 trust hub owner 범위를 분리한다.
4. `P3-3`에서 정한 후보(`macro / retirement / insurance`)와 충돌하지 않는 host 기준을 만든다.

---

## 2. 공통 역할 분리 규칙

## 2.1 host surface 정의

- `primary host surface`
  사용자가 해당 질문을 직접 해결하기 위해 들어가는 공식 문맥
- `secondary host surface`
  독립 탐색 대신 행동 근거를 보강하는 helper/CTA/참고 블록으로만 붙는 문맥
- `standalone 유지`
  이미 존재하는 stable route가 있고, 그 route 자체가 하나의 질문에 답하는 탐색/검색/모니터링 흐름을 갖는 경우에만 허용

## 2.2 public surface와 trust hub의 경계

- public surface:
  행동 근거, 비교 맥락, 재확인 필요, 기준 시점 같은 얇은 helper만 노출
- trust hub:
  raw source 상태, fallback diagnostics, sync 기준, env/config, 운영 점검 정보 owner

즉, public surface는 `왜 지금 이 정보를 같이 봐야 하는가`까지만 말하고,
`source가 왜 늦었는가`, `운영자가 무엇을 다시 눌러야 하는가` 같은 정보는 trust hub로 보냅니다.

## 2.3 금지 규칙

- 기존 stable route가 있다고 해서 새 상위 제품 축으로 취급하지 않습니다.
- host surface 밖에서 같은 기능을 독립 카드/메뉴로 중복 확장하지 않습니다.
- public helper에 raw 운영 문구, env, API 경로, 수동 sync, fallback 사유 원문을 넣지 않습니다.
- 투자 권유, 정책 확정, 주거 판단 확정, 보장 판단 확정처럼 읽히는 문구를 쓰지 않습니다.
- `planning / recommend / public info / trust hub`의 역할을 한 surface에서 동시에 섞지 않습니다.

## 2.4 standalone 유지 기준

standalone route는 아래 3가지를 모두 만족할 때만 유지합니다.

1. 기존 stable route가 이미 존재한다.
2. route 자체가 하나의 직접 질문에 답한다.
3. standalone으로 남겨도 상위 IA가 새 제품 축처럼 오해되지 않는다.

즉, standalone 유지와 독립 제품 축 승격은 같은 의미가 아닙니다.

---

## 3. 기능별 role matrix

| 기능 | primary host surface | secondary host surface | standalone 유지 | 사용자 역할 한 줄 |
| --- | --- | --- | --- | --- |
| DART | `public info` (`/public/dart`, `/public/dart/company`) | `recommend` | 유지 | 관심 기업의 공시를 직접 확인하는 근거 레이어 |
| 혜택 | `public info` (`/benefits`) | `planning` | 유지 | life-event 판단에 필요한 정책/지원 제도 탐색 레이어 |
| 주거 | `public info` (`/housing/afford`, `/housing/subscription`) | `planning` | 유지 | 주거비 판단과 공고 일정 확인을 돕는 public info 레이어 |
| 환율 | `public info` (`/tools/fx`) | `planning` | 유지 | 환전·해외결제 비용을 가늠하는 참고 지표 레이어 |

---

## 4. 기능별 상세 기준

## 4.1 DART

- primary host surface:
  `public info`
  `DART 모니터`, 기업 검색, 기업 개황, 모니터 이동 흐름은 그대로 유지
- secondary host surface:
  `recommend`
  추천이나 비교 문맥에서는 기업 공시를 직접 해석하는 게 아니라 `공시 확인 근거` helper로만 연결
- standalone 유지 여부:
  유지
  관심 기업을 직접 찾고 모니터링하는 질문은 독립 흐름이 성립함
- public helper 범위:
  공시 확인 CTA, 최근 공시 확인 필요, 기업 개황 확인 정도
- trust hub owner:
  API key, corp code 인덱스, source freshness 상세, fallback/재시도 정보
- 금지 표현:
  공시만으로 투자 판단을 확정하는 표현, 추천 결과의 정답 근거처럼 쓰는 표현

## 4.2 혜택

- primary host surface:
  `public info`
  `/benefits`의 독립 검색과 주제별 탐색은 유지
- secondary host surface:
  `planning`
  생애주기, 현금흐름, 부양가족, 주거비 같은 질문에서 `놓치기 쉬운 제도 확인` helper로만 연결
- standalone 유지 여부:
  유지
  사용자가 직접 지원 제도를 찾는 질문이 분명함
- public helper 범위:
  신청 전 원문 재확인 필요, 지역/소득 조건 차이, life-event 관련 제도 재탐색 CTA
- trust hub owner:
  source coverage, 캐시 정책, 검색 품질/partial 상태, 운영 진단
- 금지 표현:
  수급 가능 확정, 지급 확정, 자동 자격 판정처럼 읽히는 표현

## 4.3 주거

- primary host surface:
  `public info`
  `/housing/afford`, `/housing/subscription`은 독립 질문에 답하는 공식 탐색 경로로 유지
- secondary host surface:
  `planning`
  재무설계에서는 주거비 판단 보조, 청약 일정 참고, affordability 참고값으로만 연결
- standalone 유지 여부:
  유지
  주거비 계산과 청약 일정 탐색은 직접 질문이 명확함
- public helper 범위:
  주거비 참고값, 청약 공고 일정 재확인, 실거래/전월세 시세는 참고값이라는 설명
- trust hub owner:
  지역 coverage, 실거래/청약 source 주기, fallback/운영 상태
- 금지 표현:
  매수/전세/청약 당첨 가능성 확정, 계약 판단 대체처럼 읽히는 표현

## 4.4 환율

- primary host surface:
  `public info`
  `/tools/fx`는 직접 확인용 tool로 유지
- secondary host surface:
  `planning`
  환전·해외결제 비용 참고, 해외 지출 가늠 보조처럼 좁은 맥락에서만 helper로 연결
- standalone 유지 여부:
  유지
  기준 환율을 직접 확인하려는 질문이 독립적으로 존재함
- public helper 범위:
  기준일, 최근 영업일 기준, 환전·결제 비용 참고용이라는 짧은 설명
- trust hub owner:
  source freshness 상세, fallback/재생 데이터 진단, 운영 연결 상태
- 금지 표현:
  환율 전망 확정, 투자 방향 제시, 환전 타이밍 확정처럼 읽히는 표현

---

## 5. P3-3 후보와의 경계

`P3-3`에서 정한 후보와 이번 `P3-4`의 기존 기능 역할 분리는 서로 충돌하면 안 됩니다.

- `macro`
  `planning` primary host 유지
  `public info` 독립 기능으로 먼저 열지 않음
- `retirement`
  `planning` primary, `recommend` secondary 후보 유지
  standalone route를 먼저 만들지 않음
- `insurance`
  host surface를 정하기보다 policy/copy gate를 먼저 닫아야 하므로 trust hub candidate 유지

정리:
- 기존 stable route가 있는 `DART / 혜택 / 주거 / 환율`은 standalone을 유지할 수 있음
- 하지만 새 후보(`macro / retirement / insurance`)는 host surface가 먼저 정해지기 전까지 trust hub candidate를 벗어나지 않음

---

## 6. rollout 원칙

`P3-4` 이후 실제 구현이 열릴 때도 아래 순서를 지킵니다.

1. 기존 standalone route는 유지하되 의미를 `공식 탐색 경로`로 한정한다.
2. host surface 안에서는 helper/CTA/근거 블록처럼 얇은 support layer부터 연다.
3. trust hub owner 정보는 public surface로 옮기지 않는다.
4. 새 상위 메뉴나 새 독립 route는 host surface 기준이 문서로 다시 닫히기 전까지 만들지 않는다.

---

## 7. 이번 단계 결론

- `DART / 혜택 / 주거 / 환율`은 각각 standalone route를 유지할 수 있지만, 제품 전략상 새 독립 축으로 계속 확장하지 않습니다.
- 이 기능들은 `planning / recommend / public info` 안에서 행동 근거를 보강하는 support layer로 우선 읽혀야 합니다.
- 운영 진단과 raw source 정보는 계속 trust hub owner로 남겨 둡니다.
- 다음 구현 라운드는 이 matrix를 바탕으로 host surface별 helper/CTA/copy를 어느 화면에서 먼저 좁힐지 결정하는 단계가 됩니다.
