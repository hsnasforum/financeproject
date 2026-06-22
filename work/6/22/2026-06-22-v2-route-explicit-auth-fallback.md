# 2026-06-22 v2 route 테스트 auth fallback 명시화

## 변경 파일
- `tests/planning/auth/testPlanningAuthEnv.ts`
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
- `tests/planning-v2-api/debt-strategy-route.test.ts`
- `tests/planning-v2-api/format.test.ts`
- `tests/planning-v2-api/monte-carlo-route.test.ts`
- `tests/planning-v2-api/optimize-route.test.ts`
- `tests/planning-v2-api/scenarios-route.test.ts`
- `tests/planning-v2-api/simulate-route.test.ts`
- `work/6/22/2026-06-22-v2-route-explicit-auth-fallback.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록에서 전역 `PLANNING_AUTH_REQUIRED=false` fallback 의존 표면을 다음 우선순위로 확인했습니다.
- `finance-skill-routing`: Auth/User Scope 테스트 하네스 정리 라운드에 필요한 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: 테스트 하네스 및 auth 계약 변경에 맞는 최소 검증 세트를 선정했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- `vitest.config.ts`의 전역 planning auth fallback을 당장 제거하기 전, 실제 route handler 테스트가 파일 단위로 local fallback opt-in을 명시하도록 전환하기 위해서입니다.
- 이전 라운드 allowlist는 runtime route import와 static route source reference가 함께 섞여 있어, 이번 라운드에서 두 범주를 분리했습니다.

## 핵심 변경
- 테스트 전용 `installPlanningAuthRequiredFalseForTest()` helper를 추가해 `PLANNING_AUTH_REQUIRED=0` 설정과 복원을 한 곳으로 모았습니다.
- v2 계산 route 테스트 6개가 전역 Vitest env 대신 helper를 통해 local fallback을 명시하도록 변경했습니다.
- `vitestPlanningAuthFallbackContract`를 runtime route import allowlist와 static source reference allowlist로 분리했습니다.
- runtime route import의 암묵 fallback allowlist는 52개에서 46개로 줄었고, static source reference 3개는 별도 allowlist로 고정했습니다.
- AGENTS.md의 Spark 조건부 지침에 따라 `gpt-5.3-codex-spark` explorer 조사를 시도했지만, `agent thread limit reached`로 생성되지 않아 메인에서 정적 분류를 수행했습니다.

## 검증
- PASS: `git diff --check`
- PASS: `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts tests/planning-v2-api/debt-strategy-route.test.ts tests/planning-v2-api/format.test.ts tests/planning-v2-api/monte-carlo-route.test.ts tests/planning-v2-api/optimize-route.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2-api/simulate-route.test.ts`
  - 7 files, 27 tests passed.
- PASS: `corepack pnpm planning:auth:check`
  - 13 files, 111 tests passed.
- FAIL 후 수정: `corepack pnpm lint`
  - 첫 실행에서 `usePlanningAuthRequiredFalseForTest` 이름이 React hook 규칙에 걸려 실패했습니다.
  - helper 이름을 `installPlanningAuthRequiredFalseForTest`로 변경했습니다.
- PASS: `corepack pnpm lint`

## 남은 리스크
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` 주입은 아직 유지됩니다.
- runtime route import allowlist 46개가 남아 있습니다. 다음 라운드는 v2 persistence/report 계열 또는 v3 draft/profile 계열처럼 셋업이 비슷한 묶음부터 추가 이관하는 것이 안전합니다.
- static route source reference 3개는 runtime auth fallback 의존과 성격이 다르므로, 이후 전역 fallback 제거 전 별도 정책으로 유지하거나 테스트명/검사 기준을 더 명확히 나눠야 합니다.
- runtime 소스 변경은 없어 `pnpm build`와 `pnpm e2e:rc`는 이번 검증 범위에서 제외했습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
