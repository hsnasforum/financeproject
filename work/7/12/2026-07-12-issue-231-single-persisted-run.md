# 2026-07-12 Issue #231 실행 1회당 persisted run 1개 보장

## 대상

- Issue: https://github.com/hsnasforum/financeproject/issues/231
- Draft PR: https://github.com/hsnasforum/financeproject/pull/256
- 기준 main: 5c831932634556cc3b807ca69e4e8bb31b626e6d
- 작업 브랜치: codex/231-single-persisted-run
- 실제 사용자 데이터에는 restore/apply 또는 저장 검증을 실행하지 않았습니다. 모든 저장·실패·브라우저 검증은 임시 데이터 디렉터리, fixture와 테스트 격리 환경에서 수행했습니다.

## 변경 전 정리

### 수정 대상

- Planning 실행 UI와 Quick Start 상태: src/components/planning/workspace/**, src/components/planning/PlanningQuickStartGate.tsx, src/app/planning/_lib/**
- run 생성 API와 저장 경계: src/lib/planning/server/runs/**, src/lib/planning/store/**, src/lib/planning/api/runResponseSanitizer.ts
- RSC/report 조회 경계: src/lib/planning/server/pages/planningRscLoaders.ts, src/lib/planning/reports/reportRunScopeLoader.ts
- API·store·UI·E2E 회귀 테스트: tests/planning-v2-api/**, tests/planning/**, tests/e2e/**

### 변경 이유

- 실행 버튼 한 번이 run 생성과 저장을 한 요청으로 끝내지 않고, UI에서 별도 저장 상태와 후속 동작을 관리해 중복 persisted run과 실행 결과/기록 ID 불일치 위험이 있었습니다.
- 네트워크 응답 유실이나 재시도 시 동일 논리 요청을 식별하는 계약이 없어, 클라이언트가 결과를 받지 못해도 서버에는 run이 여러 개 저장될 수 있었습니다.
- idempotency 내부 메타데이터가 raw/RSC 응답에 노출되면 서버 저장 구현이 public 계약으로 굳어질 위험이 있었습니다.

### 계획한 검증

- focused Vitest와 Playwright로 단일 실행·중복 클릭·네트워크 재시도·충돌·rollback·sanitizer를 먼저 검증
- lint, typecheck, planning SSOT/user-scope/v2 complete·compat·regress
- 전체 test, RC E2E, production build
- multi-agent guard와 git diff 검사

## 사용 skill 및 역할

- finance-skill-routing: 이번 범위에 필요한 최소 Finance Project skill 조합 선택
- planning-gate-selector: route/API/UI·저장 경계 변경에 맞는 focused 및 전체 gate 선정
- route-ssot-check: canonical run route와 기존 alias, 화면 링크가 route SSOT를 위반하지 않는지 확인
- work-log-closeout: 변경 계약, 검증, 잔여 위험과 rollback 기준 기록
- github:github, github:yeet, github:gh-fix-ci: 기존 Issue/PR 중복 확인, PR 게시와 CI 상태 확인
- manager 및 독립 reviewer: 범위 분해 후 서버 저장·idempotency와 UI 실행 흐름을 분리 검토

## 핵심 변경

1. UI 실행 1회는 canonical POST /api/planning/v2/runs 한 번으로 계산과 persisted run 생성을 함께 완료합니다.
2. 동기 중복 클릭은 같은 Promise로 합치고, 네트워크 오류·5xx·429·응답 파싱 실패·후속 polling 실패 시 같은 Idempotency-Key로 한 번 자동 재시도하거나 다음 사용자 재시도를 이어갑니다.
3. 동일 사용자·동일 key·동일 요청은 같은 run을 201로 replay하고, 동일 key의 다른 요청은 409로 거부합니다. key가 없으면 기존 생성 동작을 유지합니다.
4. deterministic run ID가 active·legacy·trash 영역에 이미 있거나 대상이 손상·불일치 상태이면 덮어쓰지 않고 fail-closed 처리합니다.
5. 내부 idempotency 메타데이터는 저장 레코드에만 선택적으로 유지하고 create/list/detail/raw blob/RSC/report 응답에서는 제거합니다.
6. 실행 중 프로필 전체 편집 영역을 비활성화해 요청 중 profile context가 바뀌지 않게 했습니다.
7. Quick Start를 프로필 저장 → 첫 실행·기록 저장 → 리포트 3단계로 단순화하고 별도 저장 UI와 상태를 제거했습니다.
8. 기록·리포트 링크는 UI의 임의 현재 선택값이 아니라 실제로 저장된 run ID와 profile ID를 사용합니다.

## 계약 영향

| 구분 | 영향 |
| --- | --- |
| Public API URL | canonical POST /api/planning/v2/runs와 기존 alias를 유지합니다. alias도 같은 adapter를 사용합니다. |
| 요청 계약 | 선택적 Idempotency-Key header를 추가했습니다. 8~128자의 제한된 문자 형식이며 raw key는 저장하지 않습니다. |
| 응답 shape | 성공 payload shape는 유지합니다. 잘못된 key는 400, 동일 key의 다른 요청 또는 안전하게 replay할 수 없는 예약 상태는 409입니다. |
| Stored data | run meta에 서버 내부용 idempotency fingerprint/response meta가 선택적으로 추가됩니다. public 응답과 raw blob에서는 제거합니다. |
| DB query/schema | 변경 없음. Prisma schema와 DB query를 추가하지 않았습니다. |
| Cache/revalidation | 변경 없음. 새 cache key나 revalidation 동작이 없습니다. |
| Migration | 없음. 기존 run을 변환하거나 중복 데이터를 정리하지 않습니다. |
| Route/링크 | 새 사용자 route는 없습니다. 저장 기록과 리포트 링크가 실제 saved run/profile을 가리키도록 보정했습니다. |

## 검증

- focused Vitest 12 files / 54 tests: PASS
  - create-run idempotency, persistence routes, store rollback/보존, raw blob sanitizer, report scope, UI retry·pending key, Quick Start/controller/presenter
- sanitizer/RSC fallback 추가 회귀 3 files / 11 tests: PASS
- focused Playwright Quick Start 3 tests: PASS
  - run 수 +1, 중복 클릭 POST 1회, 동일 ID의 기록·리포트, 실행 중 profile 조작 차단, 중복 저장 UI 부재
- corepack pnpm lint: PASS
- 최종 sanitizer 및 fallback 파일 대상 ESLint: PASS
- corepack pnpm typecheck: PASS
- corepack pnpm planning:ssot:check: PASS, 5 files / 9 tests
- corepack pnpm planning:user-scope:check: PASS, 15 files / 88 tests
- corepack pnpm planning:v2:complete: PASS, fast E2E 8 tests 포함
- corepack pnpm planning:v2:compat: PASS, fixture 8 tests와 fast E2E 8 tests 포함
- corepack pnpm planning:v2:regress: PASS, golden case 9건과 full E2E 10 tests 포함
- DATABASE_URL=file:./prisma/dev.db corepack pnpm test: PASS
- DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc: PASS, 26 passed / 1 skipped
- DATABASE_URL=file:./prisma/dev.db corepack pnpm build: PASS, TypeScript 검사와 250 static pages 생성
- corepack pnpm multi-agent:guard: PASS
- git diff --check: PASS
- GitHub Actions initial head 153a5a371b2d529b9bdcf30fde70fe2d677ea7a7: CI와 E2E Smoke가 코드 step 시작 전 실패
  - CI verify와 E2E Smoke 3개 job 모두 steps가 비어 있어 저장소 코드를 실행한 흔적이 없습니다.
  - job log 조회도 GitHub 로그 저장소의 404 BlobNotFound를 반환했습니다.
  - 따라서 이 원격 실패는 코드 검증 실패로 판정하지 않았고, 로컬 전체 gate 결과와 분리해 PR에 기록합니다.

### 검증 중 발견하고 해소한 회귀

- 기존 일부 legacy/partial fixture가 meta 또는 outputs를 생략해 sanitizer에서 실패했습니다. 누락 필드를 빈 객체로 안전하게 취급하도록 호환성을 보완한 뒤 전체 test와 build를 다시 통과했습니다.
- reports fallback 테스트의 이전 저장 문구가 새 단일 실행·기록 저장 문구와 달라 실패했습니다. 실제 사용자 문구 계약에 맞춰 테스트를 갱신했습니다.
- 독립 UI 검토에서 polling 실패 전에 pending key가 해제되는 문제, 실행 중 profile select 외 편집 기능이 남는 문제, 경고 단계 요약 문구 불일치를 찾았습니다. key 수명, profile fieldset, 실제 nextStepLabel 사용으로 수정하고 focused/전체 gate를 재검증했습니다.

## 완료 조건 확인

- [x] 실행 1회 성공 시 새 persisted run이 정확히 1개 증가
- [x] 동기 중복 클릭은 POST 1회로 합쳐짐
- [x] 모호한 네트워크 실패 재시도는 동일 key와 동일 run ID를 사용
- [x] 동일 key의 다른 body는 409이며 기존 run을 덮어쓰지 않음
- [x] 저장 실패 시 임시 대상/기존 대상 보존과 rollback을 fixture로 검증
- [x] 내부 idempotency 메타가 public API·RSC·raw blob에 노출되지 않음
- [x] 실행 중 profile context 변경 차단
- [x] 실행 결과·기록·리포트가 동일 run ID를 사용
- [x] 별도 중복 저장 UI 제거 및 Quick Start 3단계 정리
- [x] 전체 test·RC E2E·build 통과

## 남은 리스크와 중단 조건

- [P1][중단 조건] single-flight와 deterministic target 예약은 현재 프로세스 로컬·파일 저장소의 single-writer 전제입니다. 여러 Node 프로세스/인스턴스가 같은 저장소에 동시에 쓰는 배포는 Issue #234의 원자적 multi-writer 예약과 rollback이 완료되기 전까지 진행하면 안 됩니다.
- [P2] hard delete 또는 trash purge로 deterministic target 흔적이 완전히 사라지면 같은 key를 다시 사용할 수 있습니다. 현재 idempotency 보장은 run 보존 기간에 한정되며 durable tombstone registry는 없습니다.
- [P2] process 재시작 후 in-flight Promise 공유는 사라지지만, 저장이 완료된 요청은 deterministic ID와 저장 메타로 replay합니다. 저장 완료 전 프로세스가 종료되는 경계는 파일 저장 원자성과 #234 범위에 의존합니다.
- 기존 데이터의 과거 중복 run을 탐지·병합·삭제하지 않습니다. 별도 migration 또는 cleanup은 제품·운영 결정 없이 수행하면 안 됩니다.
- 내부 idempotency 메타를 저장하는 형식은 public 계약이 아니지만, 오래된 reader가 meta를 부분적으로 가정하는 경우를 전체 테스트 범위 밖에서 모두 확인했다고 단정할 수 없습니다.

## 롤백 기준

- 실행 후 run 수 증가, 같은 key replay, 기록/리포트 ID 연결 중 하나라도 회귀하거나 기존 run 조회가 깨지면 배포를 중단합니다.
- 롤백은 client 단일 실행 흐름과 server idempotency 처리 전체를 같은 단위로 되돌립니다. 한쪽만 되돌리면 중복 생성 또는 재시도 불일치가 다시 생길 수 있습니다.
- fail-closed reservation과 public sanitizer를 독립적으로 제거하면 기존 대상 덮어쓰기 또는 내부 메타 노출 위험이 있으므로 데이터 안전성 검토 없이 부분 revert하지 않습니다.
- 이미 생성된 run의 내부 meta는 optional이므로 코드 롤백을 위한 DB migration은 없지만, 롤백 전에 실제 저장본을 백업하고 신규 key 재사용 여부를 확인해야 합니다.

## 다음 라운드

1. [v2-core-change] 표기와 Closes #231을 포함한 draft PR을 게시하고 GitHub Actions 상태를 확인합니다.
2. 다중 writer 배포는 #234 완료 전까지 차단합니다.
3. #231 PR을 독립적으로 유지한 채 다음 우선순위 Issue #232를 최신 main 기반 별도 worktree에서 조사·수정합니다.
