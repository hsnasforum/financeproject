# PR-B Checklist — Remove planning client/report fallback paths

## 목적

PR-A 이후 남아있는 fallback 경로를 제거해 planning 계약을 `engine` + `engineSchemaVersion` 단일 경로로 고정한다.

대상 fallback:

- `getEngineEnvelope()` fallback
- `normalizePlanningResponse()` fallback
- report contract fallback

## 범위

대상 변경:

- [ ] planning 클라이언트 helper fallback 제거
- [ ] API 응답 정규화 fallback 제거
- [ ] report legacy fallback 제거
- [ ] 관련 테스트/fixture를 단일 계약 기준으로 정리

## 비범위

이번 PR에서 하지 않는 것:

- [ ] `engineSchemaVersion` 변경
- [ ] run storage 구조 재설계
- [ ] planning 정책/수치 로직 변경
- [ ] UI 문구/디자인 개편

## 클라이언트 변경 체크리스트

- [ ] `getEngineEnvelope()`가 fallback 없이 `data.engine`만 사용
- [ ] `normalizePlanningResponse()`에서 legacy shape 흡수 제거
- [ ] stale cache 처리 분기에서 legacy 필드 의존 제거
- [ ] 화면(stage/action/debt/report)에서 `engine.*`만 참조

## report 변경 체크리스트

- [ ] report route가 `ReportInputContract`를 기본 경로로 사용
- [ ] report builder/viewModel이 contract 입력만 소비
- [ ] legacy run fallback 제거 또는 명시적 차단 처리
- [ ] planning/simulate/report 동일 run 결과 일치 확인

## 테스트/fixture 체크리스트

- [ ] fallback 관련 테스트를 제거 또는 단일 계약 검증으로 전환
- [ ] exact match 테스트는 새 계약 기준으로 정리
- [ ] `planning:v2:engine:guard` 통과
- [ ] `planner:deprecated:guard` 통과
- [ ] `typecheck:planning` 통과
- [ ] 관련 vitest 통과
- [ ] 관련 eslint 통과

## 운영 게이트 확인

공통 운영 게이트는 PR-A와 동일한 문구/기준을 사용한다.

- [ ] 공통 게이트 확인: `docs/planning-pr-a-checklist.md`
- [ ] fallback 관찰 규칙 확인: `docs/runbook.md`의 `planning fallback 관찰 (P4)`

## 배포 후 모니터링

- [ ] `/ops/metrics`에서 fallback 카운터 재증가 없는지 확인
- [ ] planning 주요 화면(stage/action/debt/report) 정상 확인
- [ ] report export.html / report.pdf / run report 경로 정상 확인

## 롤백 조건

- [ ] fallback 카운터 재증가
- [ ] 화면에서 stage/decision 표기 누락
- [ ] report 생성 실패 증가
- [ ] 응답/계약 mismatch 재발

## PR 완료 기준

- [ ] planning 클라이언트/리포트에서 fallback 경로 제거 완료
- [ ] 단일 계약(`engine` + `engineSchemaVersion`)만 사용
- [ ] 테스트/fixture 정리 완료
- [ ] 운영 모니터링 이상 없음

## PR 메타 텍스트

### PR 제목

`refactor(planning): remove client and report fallback paths after engine contract rollout`

### PR 설명 첫 문단

This PR removes client-side and report fallback paths that were temporarily kept for rollout safety. After PR-A stabilized the API shape, planning now consumes only the official `engine` + `engineSchemaVersion` contract across client and report flows.

## 실행 순서 요약

1. PR-A 운영 게이트 충족 여부 확인 (문구/기준은 PR-A와 동일)
2. PR-B에서 client/report fallback 제거 및 테스트/fixture 동시 정리
3. 배포 후 fallback 카운터/화면/리포트 경로 모니터링

## 검증 실행 기록

- [ ] 코드 변경 포함: `pnpm test`, `pnpm lint`, 필요 시 `pnpm build` 실행
- [ ] 문서 변경만 포함: 테스트/빌드 미실행 사유를 PR 본문에 명시
  - 예시 문구: `Docs-only change. Runtime code paths are unchanged, so test/build were not re-run.`
