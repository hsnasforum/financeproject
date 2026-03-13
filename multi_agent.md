# 2026-03-09 Finance Project CLI 멀티 에이전트 지침서

## 목적

- 이 문서는 `Finance Project`를 CLI 멀티 에이전트 방식으로 운영할 때 필요한 역할 기준과 작업 절차를 정의한다.
- 이 프로젝트는 `개인 재무설계`, `금융상품 추천`, `공공데이터 연동`, `DART 공시 모니터링`을 함께 다루므로, 에이전트는 단일 기능만 보지 말고 사용자 흐름과 데이터 정합성을 함께 봐야 한다.
- 모든 에이전트는 `정확성`, `안정성`, `설명 가능성`, `운영 보안`, `공식 경로 일관성`을 공통 기준으로 삼는다.

## 반복 실행 기본 루프

- 시작 신호: 사용자가 실행형 작업을 요청하거나, 같은 이슈를 한 라운드 더 진행하라고 요청하면 `manager` 에이전트부터 호출한다.
- 1단계 분해: `manager` 는 현재 범위를 3~5단계로 자르고 각 단계의 목적과 추천 에이전트 타입을 적는다.
- 2단계 배치: 메인 에이전트는 즉시 막는 핵심 경로를 로컬에서 처리하고, 병렬 가능한 조사/검증/문서화만 다른 에이전트에 배정한다.
- 2-1단계 소유권: `pnpm build`, `pnpm e2e:rc`, production smoke, release gate처럼 공유 상태를 쓰는 최종 검증은 메인 에이전트만 실행한다.
- 2-2단계 런타임 위생: 최종 build/e2e/prod smoke 전에는 `.next/lock`, `.next-e2e*`, `.next-host*`, standalone shadow처럼 공유 Next 산출물 상태를 먼저 확인하고, 필요하면 `pnpm cleanup:next-artifacts` 같은 저장소 helper를 우선 사용한다.
- 3단계 구현: 가장 작은 안전한 수정만 적용하고, 관련 없는 리팩터링은 하지 않는다.
- 4단계 검증: 가까운 검증부터 시작해 필요 시 `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e:rc`, 반복 분류 러너 순으로 넓히되, 최종 build/e2e는 보조 에이전트를 정리한 뒤 메인이 단독 실행한다.
- 5단계 기록: 각 라운드가 끝날 때 `/work/YYYY-MM-DD-*.md` 에 `무엇을 바꿨는지 / 사용 skill / 실행한 검증 / 미실행 검증 / 남은 리스크 / 다음 라운드 우선순위`를 남긴다.
- 반복 조건: 후속 라운드에서는 이전 `/work` 기록을 먼저 읽고, 남은 리스크 중 가장 높은 우선순위 하나를 다시 `manager` 에이전트로 분해해서 같은 루프를 반복한다.

## 프로젝트 기준 요약

- 메인 진입 경로는 `/dashboard`다.
- 핵심 기능 경로는 `/planning`, `/recommend`, `/public/dart`, `/settings/data-sources`, `/products/catalog`이다.
- 프로젝트는 비전문가 사용자도 이해할 수 있는 재무 결과와 안내를 제공해야 한다.
- 외부 데이터와 내부 계산 결과는 서로 충돌하지 않아야 하며, 데이터가 비어 있거나 불완전할 때도 화면은 최대한 안전하게 유지되어야 한다.
- 운영 보안상 `production`에서는 `/api/dev/*`, `/dashboard/artifacts`, `/dev/*`, `/debug/unified`가 기본 비노출 대상이다.
- API 키는 서버 환경변수로만 관리하며 `NEXT_PUBLIC_*`로 민감정보를 노출하지 않는다.

## planning v2 관련 기준

- `planning v2`는 여전히 핵심 검증 축이다.
- 완료 판정 기준은 `pnpm planning:v2:complete` 통과다.
- 관련 작업 시 참고할 대표 문서는 아래와 같다:
  - `CONTRIBUTING_PLANNING.md`
  - `docs/planning-v2-onepage.md`
  - `docs/planning-v2-quickstart.md`
  - `docs/planning-v2-user.md`
  - `docs/planning-v2-ops.md`
  - `docs/planning-v2-scheduler.md`
  - `docs/planning-v2-maintenance.md`
  - `docs/planning-v2-bug-report-template.md`
  - `docs/planning-v2-release-checklist.md`
  - `docs/releases/planning-v2-final-report-{version}.md`
- `planning` 관련 변경이 사용자 결과, 계산, 리포트, 호환성에 영향을 주면 `planning:v2:complete`를 우선 검토 대상으로 둔다.

## 역할 체계 매핑

- Codex native 멀티 에이전트 설정은 `.codex/config.toml`, `.codex/agents/*.toml` 기준이며 역할 이름은 `manager / analyzer / planner / developer / reviewer / tester / documenter / researcher`다.
- CLI tmux 러너는 `scripts/run_codex_multi_agent.sh`, `scripts/prompts/multi-agent/*.md` 기준이며 역할 이름은 `lead / planner / researcher / implementer / reviewer / validator / documenter`다.
- 역할 대응은 기본적으로 `manager ↔ lead`, `developer ↔ implementer`, `tester ↔ validator`, `planner ↔ planner`, `researcher ↔ researcher`, `reviewer ↔ reviewer`, `documenter ↔ documenter`로 본다.
- `analyzer`는 현재 Codex native 쪽 전용 역할이다. CLI 러너에서는 `lead`가 분해를 맡고, 필요 시 `planner / researcher / reviewer`가 분석 책임을 나눠 가진다.
- 새 규칙을 추가할 때는 어느 체계에 적용하는지 먼저 밝히고, 공통 규칙이면 native TOML과 CLI 프롬프트 양쪽에 같이 반영한다.

## 검증 게이트 단일 기준

- 이 섹션은 `multi_agent.md` 기준의 검증 게이트 SSOT다. `tester.toml`, `validator.md`, `planning-gate-selector`, 메인 handoff가 충돌하면 이 섹션을 우선 기준으로 삼는다.
- 순수 로직/계산 변경:
  - `pnpm test`
- 타입, 훅, 정적 규칙 영향:
  - `pnpm lint`
  - 범위가 넓으면 `pnpm verify`
- App Router 경로, 페이지, API route 영향:
  - `pnpm build`
  - 범위가 넓으면 `pnpm verify`
- planning v2 핵심 영향:
  - `pnpm planning:v2:complete`
  - 호환성, 마이그레이션, 구버전 경계 영향이 있으면 `pnpm planning:v2:compat`
  - 정적 가드나 회귀 추적이면 `pnpm planning:v2:guard`, `pnpm planning:v2:regress`
- 사용자 흐름, 셀렉터, 페이지 연결 영향:
  - `pnpm e2e:rc`
  - 범위가 넓거나 회귀 위험이 크면 `pnpm e2e`
- build/dev/prod launcher 또는 cleanup helper 영향:
  - `node --check`
  - 관련 CLI 또는 entrypoint 직접 검증
- 운영, 릴리즈, production runtime 영향:
  - `pnpm verify`
  - `pnpm build`
  - 필요 시 production smoke
- 멀티 에이전트 역할/프롬프트/handoff 드리프트 점검:
  - `pnpm multi-agent:guard`
- 최종 `pnpm build`, `pnpm e2e:rc`, production smoke, release gate는 메인 에이전트 단일 소유다. 보조 역할은 실행 세트 제안, 로그 수집, 작은 단위 재현까지만 맡는다.
- shared Next 런타임이 얽힌 최종 검증은 `.next/lock`, `.next-e2e*`, `.next-host*`, standalone shadow를 먼저 확인하고, raw `next build/start`보다 `pnpm build`, `pnpm start`, `pnpm cleanup:next-artifacts` 같은 저장소 진입점을 우선한다.

## 1. 역할 지침서

### 공통 원칙

- 모든 에이전트는 "사용자가 지금 보는 화면과 결과가 안전하고 이해 가능한가"를 최우선으로 판단한다.
- 한 영역만 맞고 다른 영역이 깨지는 수정은 허용하지 않는다.
- `planning`, `recommend`, `report`, `data-sources`, `dart`는 연결된 흐름으로 보고 판단한다.
- 사용자에게 보이는 문구는 숫자만 나열하지 말고 의미와 상태를 설명할 수 있어야 한다.
- 공식 경로는 문서 기준을 따르며 임의의 우회 경로나 실험 경로를 기본 진입으로 만들지 않는다.
- 외부 데이터 의존 작업은 실패 시 fallback과 상태 노출 방식을 함께 설계한다.
- 민감정보, API 키, 개인 자산 데이터는 로그, 클라이언트, 문서 예시에 노출하지 않는다.

### 1) 총괄 에이전트

- 사용자 요청을 기능 단위로 분류한다:
  - planning
  - recommend
  - dart
  - data-sources
  - products
  - ops/docs
- 어떤 사용자 경로와 어떤 데이터 흐름이 영향을 받는지 먼저 정리한다.
- 에이전트별 작업 범위를 나누고 파일 충돌을 방지한다.
- 최종 결과가 `README.md`의 핵심 경로, 검증 기준, 운영 보안 정책과 충돌하지 않는지 확인한다.
- 사용자 보고 시 변경 내용, 영향 경로, 검증 결과, 남은 리스크를 단일 메시지로 정리한다.

### 2) 분석 에이전트

- 현재 동작, 관련 문서, 영향 경로, 테스트 범위를 먼저 조사한다.
- 아래 항목을 우선 확인한다:
  - 메인 진입 또는 핵심 경로에 영향이 있는가
  - `planning v2` 검증 축에 영향이 있는가
  - 외부 데이터 의존성 또는 공공데이터/DART 흐름과 연결되는가
  - 데이터 누락 시 화면이 깨질 가능성이 있는가
  - 설명 문구가 계산 또는 실제 상태와 어긋날 가능성이 있는가
- 조사 결과는 `현상 / 원인 후보 / 영향 범위 / 권장 수정 방향 / 필요한 검증` 형식으로 전달한다.
- 확인되지 않은 내용은 사실처럼 단정하지 않고 가정 또는 미확인 항목으로 표시한다.

### 3) 구현 에이전트

- 승인된 범위 안에서만 수정하며, 무관한 리팩터링은 하지 않는다.
- 기존 사용자 흐름을 깨지 않으면서 문제를 고치는 방식을 우선한다.
- 데이터 누락, 레거시 상태, 외부 응답 실패가 있어도 전체 화면이 무너지지 않게 처리한다.
- UI는 기존 계산 결과와 상태를 잘 전달하는 쪽으로 유지하고, 중복 계산이나 임의 해석을 최소화한다.
- 공개 경로와 dev/debug 경로를 혼동하지 않는다.
- 환경변수, 데이터 소스 설정, DART/API 연동은 보안과 실패 처리까지 포함해 수정한다.

### 4) 검증 에이전트

- 변경 유형을 먼저 분류한다:
  - 순수 로직/계산
  - App Router 경로/페이지
  - 추천/리포트/플래닝 연동
  - 외부 데이터/DART/데이터 소스
  - 운영 문서/설정
- 분류에 맞는 검증을 선택한다:
  - 관련 테스트: `pnpm test`
  - 규칙/훅 영향: `pnpm lint`
  - 앱 경로/빌드 영향: `pnpm build`
  - 전체 기본 검증: `pnpm verify`
  - planning 핵심 영향: `pnpm planning:v2:complete`
  - 호환성 영향: `pnpm planning:v2:compat`
  - 사용자 흐름 영향: `pnpm e2e` 또는 `pnpm e2e:rc`
- Next build/dev/prod wrapper 또는 cleanup helper 영향: `node --check` 와 관련 entrypoint 직접 검증
- 단, `pnpm build`, `pnpm e2e:rc`, production smoke 같은 공유 상태 최종 게이트는 검증 에이전트가 병렬로 확정하지 않고 메인 에이전트에게 넘긴다.
- 정상 케이스뿐 아니라 다음을 꼭 본다:
  - 데이터 없음
  - 외부 응답 실패
  - 권한 또는 설정 누락
  - 공식 경로 접근
  - 문구와 실제 결과 불일치
- 미실행 검증은 숨기지 말고 남은 리스크로 기록한다.

### 5) 문서화 에이전트

- 변경 내용을 기술자 중심이 아니라 사용자와 운영자 기준으로 요약한다.
- 핵심 경로, 검증 명령, 운영 보안 규칙이 바뀌면 문서를 같이 갱신한다.
- 재무설계 결과나 추천 흐름 관련 문구는 비전문가도 이해할 수 있게 다듬는다.
- `/work` 문서는 날짜와 작업명 기준으로 남기고, 다음 작업자가 바로 이어받을 수 있게 작성한다.
- 실제로 사용한 skill이 있으면 `/work`에 이름과 용도를 남겨 다음 작업자가 어떤 지침을 참조했는지 알 수 있게 한다.
- 문서에는 "무엇을 고쳤는가"뿐 아니라 "왜 이 수정이 안전한가"를 포함한다.

## 2. 작업 지침서

### 공통사항

- 시스템 안전 최우선:
  - 파괴적 git 명령, 대량 파일 삭제, 권한 변경, 외부 서버 대량 호출은 기본적으로 금지하고 필요 시 사용자 판단을 받는다.
- 컨텍스트 최적화:
  - 에이전트 간 전달은 전체 로그 대신 `현재 상태`, `핵심 변경`, `실패 원인`, `다음 조치`만 남긴다.
- 실패 임계점 준수:
  - 같은 오류가 3회 이상 반복되면 반복 시도를 멈추고 총괄 에이전트 또는 사용자에게 개입을 요청한다.
- 제품 기준 우선:
  - `README.md`, `docs/current-screens.md`, 운영 보안 정책, planning 관련 검증 게이트를 우선 기준으로 삼는다.
- 반복형 멀티 에이전트 작업은 항상 `manager` 분해 결과를 기준으로 다음 라운드를 잇는다.

### 작업 시작 전

- 요청을 한 줄로 다시 정의한다.
- 이번 작업이 어느 기능 축에 속하는지 먼저 정한다:
  - planning
  - recommend
  - dart
  - data-sources
  - products
  - ops/docs
- 완료 조건은 3개 이내로 정한다.
- 영향 받을 파일, 사용자 경로, 데이터 흐름, 검증 명령을 먼저 적는다.
- 변경이 메인 진입 `/dashboard` 또는 핵심 경로에 영향을 주는지 먼저 확인한다.

### 작업 분배 규칙

- 하나의 파일은 한 시점에 한 구현 에이전트만 수정한다.
- 조사, 구현, 검증은 분리할 수 있지만 인수인계는 반드시 남긴다.
- 최종 build/e2e 직전에는 보조 검증 에이전트를 정리하고, 메인 에이전트만 단일 소유자로 결과를 확정한다.
- `planning`과 `recommend/report`가 동시에 얽히는 작업은 분석 에이전트가 먼저 경계를 나눈다.
- 외부 데이터 연동과 UI 수정이 함께 일어나면 검증 에이전트를 초반부터 붙인다.
- 우선순위는 아래 순서를 따른다:
  - 사용자 화면 장애 방지
  - 결과 정합성 확보
  - 운영 보안 유지
  - 공식 경로 일관성 유지
  - 신규 확장 또는 편의 개선

### 작업 수행 규칙

- 조사 없이 바로 구현하지 않는다.
- 핵심 경로를 바꾸는 수정은 항상 문서 기준과 함께 확인한다.
- 데이터가 없거나 오래되었거나 외부 응답이 실패해도 조용히 깨지지 않게 한다.
- 설명 문구는 실제 계산 결과, 상태, 제한사항과 맞아야 한다.
- 외부 의존성 추가, 데이터 스키마 변경, 공개 API 변경, 경로 정책 변경은 별도 위험 항목으로 표시한다.
- `production` 비노출 대상 경로를 실수로 노출하지 않게 주의한다.
- 수정 후에는 가능한 가장 가까운 범위에서 먼저 검증하고, 필요 시 전체 검증으로 넓힌다.
- shared Next 런타임 이슈가 섞이면 raw `next build/start`보다 `pnpm build`, `pnpm start`, `pnpm cleanup:next-artifacts` 같은 저장소 진입점을 우선한다. raw 명령은 wrapper 문제를 분리 진단할 때만 예외로 사용한다.

### 커뮤니케이션 규칙

- 보고는 짧지만 의사결정에 필요한 정보는 빠지지 않아야 한다.
- 기본 형식은 `현재 상태 / 수행 내용 / 사용 skill / 실행한 검증 / 미실행 검증 / 다음 작업 / 리스크`를 따른다.
- 불확실한 내용은 확정 문장처럼 쓰지 않는다.
- 실패 보고 시에는 `어디서`, `왜`, `사용자 영향이 무엇인지`를 함께 적는다.
- 외부 데이터나 스케줄 기반 결과를 다룰 때는 가능하면 날짜 기준도 함께 적는다.

### 완료 기준

- 요구사항에 해당하는 변경이 실제 코드 또는 문서에 반영되었다.
- 메인 진입과 관련 핵심 경로가 의도치 않게 깨지지 않았다.
- 계산 결과, 설명 문구, 데이터 상태 표시가 서로 모순되지 않는다.
- 최소 1개 이상의 검증이 수행되었거나, 미수행 사유가 분명히 기록되었다.
- `/work` 또는 관련 문서에 다음 작업자가 이해할 수 있는 기록이 남아 있다.

## 3. Finance Project용 운영 템플릿

### 역할 지침서 템플릿

```md
# 역할 지침서

## 역할명
- 총괄 에이전트 / 분석 에이전트 / 구현 에이전트 / 검증 에이전트 / 문서화 에이전트

## 담당 기능 축
- planning / recommend / dart / data-sources / products / ops-docs

## 책임
- 반드시 담당해야 하는 일

## 확인할 프로젝트 기준
- README.md의 핵심 경로와 명령어
- docs/current-screens.md 경로 기준
- 운영 보안 비노출 경로
- planning 관련 검증 게이트 영향 여부

## 하지 말아야 할 일
- 승인 없는 파괴적 수정
- 민감정보 노출
- 공식 경로 우회 기본화
- 무관한 대규모 리팩터링

## 입력
- 관련 파일
- 현재 동작 요약
- 선행 조사 결과

## 출력
- 다음 에이전트가 바로 사용할 수 있는 결과 요약

## 완료 기준
- 역할 산출물과 남은 리스크가 명확히 정리됨
```

### 작업 지침서 템플릿

```md
# 작업 지침서

## 작업명
- 한 줄 목표

## 기능 축
- planning / recommend / dart / data-sources / products / ops-docs

## 영향 범위
- 수정 허용 파일
- 영향 받는 사용자 경로
- 영향 받는 데이터 흐름

## 절차
1. 현재 상태와 문서 기준 조사
2. 핵심 경로 및 데이터 흐름 영향 확인
3. 구현 또는 수정
4. 가까운 범위부터 검증
5. 사용자 영향과 리스크 정리

## 필수 확인
- `/dashboard` 또는 핵심 경로를 깨지 않는가
- 설명 문구가 실제 결과와 맞는가
- 운영 보안 정책과 충돌하지 않는가
- planning 영향 시 필요한 게이트를 검토했는가

## 검증 항목
- pnpm test
- pnpm lint
- pnpm build
- pnpm verify
- pnpm planning:v2:complete
- pnpm planning:v2:compat
- pnpm e2e / pnpm e2e:rc

## 보고 항목
- 무엇을 변경했는가
- 왜 필요한가
- 무엇을 검증했는가
- 남은 리스크는 무엇인가
```

## 4. 바로 사용 가능한 짧은 문안

### 역할 지침서 짧은 문안

```md
당신은 Finance Project의 CLI 멀티 에이전트 환경에서 할당된 역할만 수행한다.
이 프로젝트는 개인 재무설계, 추천, 공공데이터, DART 연동을 함께 다루므로 정확성, 안정성, 설명 가능성을 우선한다.
항상 현재 목표, 담당 기능 축, 영향 경로, 완료 기준을 먼저 확인한다.
메인 진입 `/dashboard`와 핵심 경로를 임의로 깨지 말고, production 비노출 경로와 보안 정책을 지킨다.
데이터 누락이나 외부 응답 실패 시에도 화면은 최대한 안전하게 유지한다.
결과 보고에는 변경 내용, 영향 경로, 검증 결과, 남은 리스크를 포함한다.
```

### 작업 지침서 짧은 문안

```md
작업 시작 전 요청을 한 줄로 요약하고 planning, recommend, dart, data-sources, products, ops-docs 중 어느 축인지 먼저 분류한다.
현재 코드, README.md, docs/current-screens.md, 관련 문서를 조사한 뒤 영향 범위와 검증 범위를 정리한다.
조사 없이 바로 구현하지 않고, 승인된 범위 안에서만 수정한다.
데이터가 비어 있거나 외부 응답이 실패해도 화면은 깨지지 않고 상태를 설명할 수 있어야 한다.
수정 후에는 test, lint, build, verify, planning:v2 게이트, e2e 중 필요한 검증을 수행한다.
최종 보고에는 변경 사항, 사용자 영향, 검증 결과, 미해결 리스크를 반드시 포함한다.
```

## 5. 권장 운용 방식

- 소규모 작업은 `총괄 + 구현 + 검증` 3역할이면 충분하다.
- 여러 기능 축이 동시에 얽히면 `분석` 역할을 먼저 두는 편이 안전하다.
- planning 계산 결과가 recommend 또는 report와 연결되면 정합성 검토를 먼저 한다.
- 외부 데이터 소스나 DART 연동을 건드리는 작업은 실패 fallback과 운영 검증을 함께 설계한다.
- 최종 사용자 응답은 반드시 총괄 에이전트가 취합해 단일 메시지로 정리한다.
