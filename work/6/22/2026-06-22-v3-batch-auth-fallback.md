# 2026-06-22 v3 batch auth fallback 정리

## 요약
- v3 batch/transactions/balances 계열 route 테스트 8개에 `installPlanningAuthRequiredFalseForTest()`를 명시 적용했습니다.
- `vitestPlanningAuthFallbackContract`의 runtime route import allowlist에서 해당 8개 파일을 제거했습니다.
- runtime implicit local auth fallback allowlist는 29개에서 21개로 줄었습니다.
- runtime 코드는 변경하지 않았고 public API 응답 계약도 변경하지 않았습니다.
- Spark 병렬 탐색은 `agent thread limit reached`로 실행하지 못해 메인 에이전트가 직접 범위를 확인했습니다.

## 수정 파일
- `tests/planning-v3-account-overrides-api.test.ts`
- `tests/planning-v3-transfer-overrides-api.test.ts`
- `tests/planning-v3-overrides-api.test.ts`
- `tests/planning-v3-balances-api.test.ts`
- `tests/planning-v3-transfers-api.test.ts`
- `tests/planning-v3-categorized-api.test.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `tests/planning-v3-batch-center-api.test.ts`
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록과 잔여 리스크 확인
- `finance-skill-routing`: Finance Project 작업에 필요한 조건부 skill 선택
- `planning-gate-selector`: 변경 범위에 맞는 최소 검증 세트 선택
- `planning-v3-batch-contract-narrowing`: v3 batch/cashflow/categorized/balances 테스트 변경 계약 확인
- `work-log-closeout`: 라운드 종료 기록 작성

## 검증
- PASS `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts tests/planning-v3-account-overrides-api.test.ts tests/planning-v3-transfer-overrides-api.test.ts tests/planning-v3-overrides-api.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-transfers-api.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-batch-center-api.test.ts`
  - 9 files, 45 tests passed
- PASS `corepack pnpm planning:auth:check`
  - 13 files, 111 tests passed
- PASS `corepack pnpm lint`
- PASS `git diff --check`

## 남은 리스크
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` bridge는 아직 남아 있습니다.
- runtime route import allowlist 21개가 남아 있어 다음 라운드에서 news/security/draft/import/remote-host v3 테스트를 이어서 정리해야 합니다.
- runtime source 변경이 없어 `pnpm build`와 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 우선순위
1. `tests/news-exposure-api.test.ts`, `tests/planning-security-csrf.test.ts`의 auth fallback 의도를 분리합니다.
2. `planning-v3` draft/import/remote-host/write guard 계열 테스트의 local fallback을 명시화합니다.
3. allowlist가 0이 되면 `vitest.config.ts` 전역 bridge 제거를 별도 커밋으로 검증합니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
