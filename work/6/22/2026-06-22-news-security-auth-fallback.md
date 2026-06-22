# 2026-06-22 news/security auth fallback 정리

## 변경 파일
- `tests/news-exposure-api.test.ts`
- `tests/planning-security-csrf.test.ts`
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
- `work/6/22/2026-06-22-news-security-auth-fallback.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록과 현재 git 상태를 확인해 이전 라운드의 잔여 allowlist를 기준으로 잡았습니다.
- `finance-skill-routing`: 이번 라운드가 auth fallback 테스트 정리임을 기준으로 필요한 skill 조합을 좁혔습니다.
- `planning-gate-selector`: 테스트 파일 중심 변경에 맞춰 targeted test, `planning:auth:check`, `lint`를 선택했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 잔여 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` bridge 의존을 줄이기 위해 남은 runtime route import 테스트 중 단건으로 분리 가능한 news exposure와 CSRF 테스트를 명시 fallback으로 전환했습니다.
- route/runtime 코드는 바꾸지 않고 테스트 실행 환경의 의도를 파일 단위로 드러내는 것이 이번 라운드의 범위입니다.

## 핵심 변경
- `tests/news-exposure-api.test.ts`에 `installPlanningAuthRequiredFalseForTest()`를 적용했습니다.
- `tests/planning-security-csrf.test.ts`에 `installPlanningAuthRequiredFalseForTest()`를 적용했습니다.
- `vitestPlanningAuthFallbackContract` runtime allowlist에서 위 2개 파일을 제거했습니다.
- runtime implicit local auth fallback allowlist는 21개에서 19개로 줄었습니다.
- Spark 병렬 정적 조사는 이번 단건 범위에서는 쓰지 않았고, manager 분해 결과에 따라 메인 에이전트가 직접 수정·검증했습니다.

## 검증
- PASS `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts tests/news-exposure-api.test.ts tests/planning-security-csrf.test.ts`
  - 3 files, 10 tests passed
- PASS `corepack pnpm planning:auth:check`
  - 13 files, 111 tests passed
- PASS `corepack pnpm lint`

## 남은 리스크
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` bridge는 아직 남아 있습니다.
- runtime route import allowlist 19개가 남아 있어 draft/import/remote-host/write guard 계열 테스트를 다음 라운드에서 이어서 정리해야 합니다.
- runtime source 변경이 없어 `pnpm build`와 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
