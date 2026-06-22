# 2026-06-22 vitest auth bridge 제거

## 변경 파일
- `vitest.config.ts`
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
- `tests/planning/auth/authConfigContract.test.ts`
- `work/6/22/2026-06-22-vitest-auth-bridge-removed.md`

## 사용 skill
- `work-artifact-intake`: 직전 `/work`의 allowlist 0 완료와 남은 bridge 제거 리스크를 확인했습니다.
- `finance-skill-routing`: auth fallback 설정 정리 범위에 맞춰 필요한 skill 조합을 좁혔습니다.
- `planning-gate-selector`: vitest 설정과 auth 계약 테스트 변경에 맞춰 targeted test, `planning:auth:check`, `lint`, `build`를 선택했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 잔여 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- 모든 runtime planning route import 테스트가 파일 단위 명시 fallback을 갖게 되어 `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` bridge가 더 이상 필요하지 않습니다.
- production 기본 계약인 auth required와 local/dev fallback 명시 원칙을 테스트 설정에도 반영했습니다.

## 핵심 변경
- `vitest.config.ts`에서 전역 `PLANNING_AUTH_REQUIRED` env 주입을 제거했습니다.
- `vitestPlanningAuthFallbackContract`는 전역 bridge가 제거되어야 한다고 검증하도록 바꿨습니다.
- `authConfigContract`의 stale bridge 요구 assertion을 제거 기준으로 갱신했습니다.
- runtime implicit local auth fallback allowlist는 0개 상태를 유지합니다.

## 검증
- PASS `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
  - 1 file, 3 tests passed
- FAIL 후 수정 `corepack pnpm planning:auth:check`
  - `authConfigContract`가 stale bridge 요구 assertion을 갖고 있어 실패했고, 제거 기준 assertion으로 갱신했습니다.
- PASS `corepack pnpm planning:auth:check`
  - 13 files, 109 tests passed
- PASS `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts tests/planning-v2-api/run-route.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batches-merge-api.test.ts tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-draft-scenario-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-exposure-api.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/planning-v3-internal-route-contract.test.ts tests/planning-v3-journal-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/planning-v3-opening-balances-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-v2-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profiles-api.test.ts tests/planning-v3-routines-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3/api-drafts-route.test.ts`
  - 36 files, 136 tests passed
- PASS `corepack pnpm lint`
- PASS `corepack pnpm build`

## 남은 리스크
- 이 라운드는 test runtime 설정과 계약 테스트만 바꿨고 production route/runtime 소스는 변경하지 않았습니다.
- 전체 `pnpm test`는 실행하지 않았습니다. 대신 bridge 영향권인 route import targeted set, auth gate, lint, build를 실행했습니다.
- 다음 라운드는 `withCurrentPlanningUser` 직접 사용 route 표준화나 repository ownership boundary로 넘어갈 수 있습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
