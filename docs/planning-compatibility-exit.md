# Planning Compatibility Exit

## 목적

planning v2 엔진 계약(`engine`, `engineSchemaVersion`)이 시스템 표준이 된 상태에서,
하위호환용 legacy top-level 응답 필드(`stage`, `financialStatus`, `stageDecision`)를
안전하게 제거하기 위한 운영 게이트와 실행 기준을 정의한다.

## 제거 대상

다음 top-level 응답 필드를 제거 대상으로 본다.

- `stage`
- `financialStatus`
- `stageDecision`

공식 소비 경로는 아래만 허용한다.

- `engine.stage`
- `engine.financialStatus`
- `engine.stageDecision`

## 현재 전제

다음 조건은 이미 충족되었다.

- API 응답은 `engine envelope`를 반환한다.
- 프론트 소비는 `normalizePlanningResponse()` / `getEngineEnvelope()`를 통해 정규화된다.
- 공식 planning report 경로(`/planning/reports`, `/planning/reports/[id]`)는 `ReportInputContract` 기반으로 동작한다.
- legacy `/report` 경로는 현재 `/planning/reports`로 `permanentRedirect` 된다.
- lint / CI / rg guard로 legacy top-level 직접 참조는 차단된다.
- fallback 발생은 `/ops/metrics`에서 관측 가능하다.

## 운영 지표

관찰 지표는 아래 4개를 사용한다.

- `engineEnvelopeFallbackCount`
- `reportContractFallbackCount`
- `runEngineMigrationCount`
- `lastEventAt`

### 지표 해석

#### engineEnvelopeFallbackCount
- 의미: API/프론트 경계에서 legacy top-level fallback이 사용된 횟수
- 기대 상태: 제거 직전 관찰 기간 동안 증가 0

#### reportContractFallbackCount
- 의미: report 계약 생성 시 legacy run 복원 fallback이 사용된 횟수
- 기대 상태: 제거 직전 관찰 기간 동안 증가 0 또는 legacy run에만 한정

#### runEngineMigrationCount
- 의미: legacy run을 lazy migration 하면서 `engine`/`engineSchemaVersion`을 보강한 횟수
- 기대 상태:
  - 초기에 증가 가능
  - 이후 안정화/정체되면 정상
  - 급증 시 오래된 run 접근 또는 legacy 유입 경로 점검 필요

#### lastEventAt
- 의미: 마지막 fallback 또는 migration 이벤트 시각
- 기대 상태: 제거 직전 최근 시각에 fallback 이벤트가 없어야 함

## 제거 게이트

### Staging 게이트
아래 조건을 3일 연속 만족해야 한다.

- `engineEnvelopeFallbackCount` 증가 0
- `reportContractFallbackCount` 증가 0 또는 legacy run 한정
- 프론트/테스트에서 legacy top-level 직접 참조 0
- 새 run 저장 시 `engine` 누락 0

### Production 게이트
아래 조건을 7일 연속 만족해야 한다.

- `engineEnvelopeFallbackCount` 증가 0
- `reportContractFallbackCount` 증가 0 또는 legacy run 한정
- `lastEventAt` 기준 최근 24시간 내 신규 fallback 없음
- 새 run 저장 시 `engine` 누락 0
- `/ops/metrics` 상 fallback 추세 안정

## Go / No-Go 기준

### Go
아래를 모두 만족하면 legacy top-level 제거 PR-A를 진행한다.

- staging 3일 조건 충족
- production 7일 조건 충족
- 신규 코드에서 legacy top-level 직접 참조 0
- report fallback이 legacy run 외 경로에서 발생하지 않음
- 운영/QA 확인 완료

### No-Go
아래 중 하나라도 해당하면 제거를 보류한다.

- `engineEnvelopeFallbackCount`가 계속 증가
- `reportContractFallbackCount`가 새 run에서도 발생
- `lastEventAt`가 최근 24시간 내 갱신
- stale cache / 오래된 fixture / 외부 소비자 이슈가 확인됨
- legacy top-level 직접 참조가 source/test에서 재발생

## 일일 운영 체크리스트

### Staging
- [ ] `engineEnvelopeFallbackCount` 증가 0 확인
- [ ] `reportContractFallbackCount` 증가 0 또는 legacy run 한정 확인
- [ ] `runEngineMigrationCount` 추세 확인
- [ ] `lastEventAt` 최근 이벤트 확인
- [ ] 경고/점검 필요 상태 카드 여부 확인

### Production
- [ ] `engineEnvelopeFallbackCount` 증가 0 확인
- [ ] `reportContractFallbackCount` 증가 0 또는 legacy run 한정 확인
- [ ] `runEngineMigrationCount` 급증 여부 확인
- [ ] `lastEventAt` 최근 24시간 내 fallback 여부 확인
- [ ] 사용자 리포트/플래닝 화면 이상 징후 확인

## 실행 순서

### PR-A
서버 응답에서 legacy top-level 필드를 제거한다.
클라이언트 fallback helper는 잠시 유지한다.

### 안정화 관찰
PR-A 배포 후 fallback 추이를 다시 관찰한다.

### PR-B
클라이언트 fallback helper와 legacy response field 타입을 제거한다.

## 롤백 기준

아래 중 하나라도 발생하면 PR-A 또는 PR-B를 롤백 또는 보류한다.

- 배포 직후 fallback 카운터 급증
- report 렌더 실패 또는 run 복원 실패 증가
- planning v2 핵심 화면에서 stage/decision 표시 이상
- 외부 소비자 또는 내부 테스트 fixture 호환성 문제 확인

## 비고

- `legacyPlanModel`은 전이층이며 새 엔진 정책 확장 지점이 아니다.
- `engineSchemaVersion` 운영 규칙은 `planning-engine-versioning.md`를 따른다.
- run migration 정책은 `planning-engine-run-migration.md`를 따른다.
