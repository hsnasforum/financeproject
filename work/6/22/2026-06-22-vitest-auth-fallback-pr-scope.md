# 2026-06-22 vitest planning auth fallback 범위 고정

## 변경 파일
- `vitest.config.ts`
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
- `work/6/22/2026-06-22-vitest-auth-fallback-pr-scope.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록에서 `vitest.config.ts` 전역 fallback 의존성 정리 우선순위를 확인했습니다.
- `finance-skill-routing`: Auth/User Scope 라운드에 필요한 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: 테스트 하네스와 auth 계약 변경에 맞는 최소 검증 세트를 선정했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- production 런타임은 이미 `PLANNING_AUTH_REQUIRED=false`를 무시하고 인증을 강제하지만, `vitest.config.ts`는 테스트 전체에 `PLANNING_AUTH_REQUIRED=false`를 주입하고 있습니다.
- 전역 fallback을 즉시 제거하면 영향 범위가 큰 55개 route source reference 테스트가 한 번에 흔들릴 수 있어, 이번 라운드에서는 기존 암묵 표면을 allowlist로 고정하고 새 의존이 늘지 않게 했습니다.

## 핵심 변경
- `vitest.config.ts`의 전역 planning auth fallback에 임시 bridge 주석을 추가했습니다.
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`를 추가해 fallback 계약과 allowlist 위치를 고정했습니다.
- planning API route source를 참조하면서 `PLANNING_AUTH_REQUIRED`를 명시하지 않는 기존 테스트 55개를 allowlist로 기록했습니다.
- 새 route/source reference 테스트가 auth fallback을 명시하지 않으면 allowlist 변경 없이 통과하지 못하도록 했습니다.
- AGENTS.md의 Spark 조건부 지침에 따라 `gpt-5.3-codex-spark` explorer 조사를 시도했지만, `agent thread limit reached`로 생성되지 않아 메인에서 정적 조사를 수행했습니다.

## 검증
- PASS: `git diff --check`
- PASS: `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
  - 1 file, 2 tests passed.
- PASS: `corepack pnpm planning:auth:check`
  - 13 files, 110 tests passed.
- PASS: `corepack pnpm lint`

## 남은 리스크
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` 주입은 아직 유지됩니다. 이번 라운드는 제거가 아니라 의존 표면 고정입니다.
- allowlist는 route runtime import와 static source reference를 함께 포함합니다. 다음 라운드에서는 두 범주를 나누고, 실제 runtime route 테스트부터 per-file explicit fallback으로 이동하는 편이 안전합니다.
- runtime 소스 변경은 없어 `pnpm build`와 `pnpm e2e:rc`는 이번 검증 범위에서 제외했습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
