# PR-A Checklist — Remove legacy top-level planning response fields

## 목적

planning API 응답에서 legacy top-level 필드:

- `stage`
- `financialStatus`
- `stageDecision`

를 제거하고, 공식 응답 계약을 `engine` + `engineSchemaVersion` 중심으로 정리한다.

## 범위

대상 라우트:

- [ ] `simulate`
- [ ] `optimize`
- [ ] `scenarios`
- [ ] `actions`
- [ ] `debt-strategy`

## 비범위

이번 PR에서 하지 않는 것:

- [ ] `getEngineEnvelope()`의 legacy fallback 제거
- [ ] `normalizePlanningResponse()` fallback 제거
- [ ] report legacy run fallback 제거
- [ ] `engineSchemaVersion` 변경
- [ ] `legacyPlanModel` 제거

## 서버 변경 체크리스트

- [ ] 각 planning API 응답에서 top-level `stage` 제거
- [ ] 각 planning API 응답에서 top-level `financialStatus` 제거
- [ ] 각 planning API 응답에서 top-level `stageDecision` 제거
- [ ] `engine` 필드는 기존대로 유지
- [ ] `engineSchemaVersion` 필드는 기존대로 유지
- [ ] 캐시 hit 응답도 동일 shape로 유지
- [ ] 캐시 miss 응답도 동일 shape로 유지
- [ ] route별 응답 타입 alias / DTO 업데이트

## 테스트/fixture 체크리스트

- [ ] route test 기대값에서 top-level legacy 필드 제거
- [ ] fixture/mock 응답을 `engine` 기준으로 정리
- [ ] exact match 테스트가 있으면 `engine` 기준으로 수정
- [ ] `engineSchemaVersion` 존재 검증 유지
- [ ] `planning:v2:engine:guard` 통과
- [ ] `planner:deprecated:guard` 통과
- [ ] `typecheck:planning` 통과
- [ ] 관련 vitest 통과
- [ ] 관련 eslint 통과

## 클라이언트 호환성 체크리스트

- [ ] 프론트가 `engine.*`만 사용 중인지 재확인
- [ ] `getEngineEnvelope()` helper는 아직 유지
- [ ] stale cache / 오래된 mock 응답 흡수 가능한지 확인
- [ ] report 경로 영향 없음 확인

## 운영 게이트 확인

PR merge 전 아래를 확인한다.

- [ ] staging 3일 조건 충족
- [ ] production 7일 조건 충족
- [ ] `engineEnvelopeFallbackCount` 증가 0
- [ ] `reportContractFallbackCount` 증가 0 또는 legacy run 한정
- [ ] `lastEventAt` 최근 fallback 없음
- [ ] `/ops/metrics` 카드 상태 정상

## 배포 후 모니터링

배포 후 확인 항목:

- [ ] `/ops/metrics`에서 fallback 급증 없는지 확인
- [ ] planning 주요 화면(stage/action/debt/report) 이상 없는지 확인
- [ ] report export.html / report.pdf / run report 경로 정상 확인
- [ ] API 소비 화면에서 engine 기반 표시 정상 확인

## 롤백 조건

아래 발생 시 롤백 또는 hotfix 검토:

- [ ] fallback 카운터 급증
- [ ] planning 주요 화면에서 stage/decision 표시 누락
- [ ] report 생성 실패 증가
- [ ] route 테스트/운영 로그에서 응답 shape mismatch 발생

## PR 완료 기준

- [ ] 서버 응답에서 top-level `stage/financialStatus/stageDecision` 제거 완료
- [ ] 모든 planning API가 `engine` + `engineSchemaVersion`만 공식 응답으로 사용
- [ ] 테스트/fixture 정리 완료
- [ ] 운영 모니터링 이상 없음
- [ ] PR-B(클라이언트 fallback 제거) 착수 가능 상태

## PR 메타 텍스트

### PR 제목

`refactor(planning): remove legacy top-level response fields from planning v2 APIs`

### PR 설명 첫 문단

This PR removes legacy top-level planning response fields (`stage`, `financialStatus`, `stageDecision`) from planning v2 API responses. The official contract remains `engine` + `engineSchemaVersion`. Client-side fallback handling is intentionally kept in place for this phase to absorb stale cache and legacy fixtures during rollout.

## 실행 순서 요약

1. 지금: runbook 추가
2. 관찰 기간 충족 후: PR-A 실행
3. PR-A 안정화 후: PR-B에서 helper fallback 제거

다음 단계로 PR-B 체크리스트를 같은 형식으로 이어서 작성한다.

## 검증 실행 기록

PR-A/PR-B 공통으로 아래 실행 기록을 남긴다.

- 실행 시각(타임존 포함)
- 실행자
- 실행 브랜치/커밋 SHA
- 실행 명령
- 결과(성공/실패)
- 실패 시 조치 및 재실행 결과

권장 명령:

- `pnpm typecheck:planning`
- `pnpm planning:v2:engine:guard`
- `pnpm planner:deprecated:guard`
- 변경 범위 vitest
- 변경 범위 eslint
