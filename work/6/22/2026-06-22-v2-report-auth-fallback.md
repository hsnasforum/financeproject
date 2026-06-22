# 2026-06-22 v2 report 계열 auth fallback 명시화

## 변경 파일
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
- `tests/planning-v2-api/persistence-routes.test.ts`
- `tests/planning-v2-api/reports-export-html-route.test.ts`
- `tests/planning-v2-api/reports-route.test.ts`
- `tests/planning-v2-api/runs-export-route.test.ts`
- `tests/planning-v2-api/runs-report-pdf-route.test.ts`
- `tests/planning-v2-api/runs-report-route.test.ts`
- `tests/planning-v2-api/share-report-route.test.ts`
- `tests/planning-v2-api/trash-route.test.ts`
- `work/6/22/2026-06-22-v2-report-auth-fallback.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록에서 runtime route import allowlist 46개 잔여 리스크와 다음 우선순위를 확인했습니다.
- `finance-skill-routing`: Auth/User Scope 테스트 하네스 정리 라운드에 필요한 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: v2 route 테스트와 auth 계약 변경에 맞는 검증 세트를 선정했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- 전역 `vitest.config.ts`의 `PLANNING_AUTH_REQUIRED=false` bridge 의존을 줄이기 위해, v2 persistence/report/trash 계열 route 테스트가 파일 단위로 local fallback opt-in을 명시하도록 했습니다.
- 이전 라운드에서 만든 `installPlanningAuthRequiredFalseForTest()` helper를 같은 성격의 v2 route 테스트에 확장 적용했습니다.

## 핵심 변경
- v2 persistence/report/trash 계열 테스트 8개에 `installPlanningAuthRequiredFalseForTest()` 호출을 추가했습니다.
- `vitestPlanningAuthFallbackContract` runtime allowlist에서 해당 8개 파일을 제거했습니다.
- runtime route import의 암묵 fallback allowlist는 46개에서 38개로 줄었습니다.
- static route source reference allowlist 3개는 그대로 유지했습니다.
- AGENTS.md의 Spark 조건부 지침에 따라 `gpt-5.3-codex-spark` explorer 조사를 시도했지만, `agent thread limit reached`로 생성되지 않아 메인에서 정적 분류와 구현을 수행했습니다.

## 검증
- PASS: `git diff --check`
- PASS: `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning-v2-api/reports-route.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/planning-v2-api/runs-report-route.test.ts tests/planning-v2-api/runs-export-route.test.ts tests/planning-v2-api/runs-report-pdf-route.test.ts tests/planning-v2-api/share-report-route.test.ts tests/planning-v2-api/trash-route.test.ts`
  - 9 files, 27 tests passed.
- PASS: `corepack pnpm planning:auth:check`
  - 13 files, 111 tests passed.
- PASS: `corepack pnpm lint`

## 남은 리스크
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` 주입은 아직 유지됩니다.
- runtime route import allowlist 38개가 남아 있습니다. 다음 라운드는 v2 run/action/snapshot 계열 또는 v3 draft/profile 계열 중 셋업이 비슷한 묶음부터 추가 이관하는 것이 안전합니다.
- runtime 소스 변경은 없어 `pnpm build`와 `pnpm e2e:rc`는 이번 검증 범위에서 제외했습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
