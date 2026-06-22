# 2026-06-22 remaining route auth fallback 정리

## 변경 파일
- `tests/planning-v2-api/run-route.test.ts`
- `tests/planning-v3-*.test.ts` route import 테스트 33개
- `tests/planning-v3/api-drafts-route.test.ts`
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
- `work/6/22/2026-06-22-remaining-route-auth-fallback.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록과 남은 runtime allowlist 기준선을 확인했습니다.
- `finance-skill-routing`: auth fallback 테스트 정리와 v3 batch/profile/news 접점을 기준으로 필요한 skill을 좁혔습니다.
- `planning-gate-selector`: 테스트 파일 중심 변경에 맞춰 targeted test, `planning:auth:check`, `lint`를 선택했습니다.
- `planning-v3-batch-contract-narrowing`: batch/profile/transactions 테스트 변경이 runtime reader/writer 계약을 건드리지 않는지 확인했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 잔여 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` bridge 제거 준비를 끝내기 위해 남은 runtime planning route import 테스트에 파일 단위 명시 fallback을 적용했습니다.
- route/runtime 코드는 바꾸지 않고 테스트 실행 환경 의도만 드러냈습니다.

## 핵심 변경
- 남은 route import 테스트 14개에 `installPlanningAuthRequiredFalseForTest()`를 적용했습니다.
- 계약 테스트가 allowlist 0을 기대하게 바꿨습니다.
- allowlist를 0으로 바꾸자 추가로 드러난 route import 테스트 21개에도 같은 helper를 적용했습니다.
- 존재하지 않는 static reference baseline 2개를 제거하고 현재 존재하는 static reference 1개만 남겼습니다.
- runtime implicit local auth fallback allowlist는 14개에서 0개가 되었습니다.

## 검증
- FAIL 후 수정 `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batches-merge-api.test.ts tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-internal-route-contract.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/planning-v3-opening-balances-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - 계약 테스트가 추가 미명시 route import 21개와 stale static baseline 2개를 드러냈습니다.
- PASS `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
  - 1 file, 3 tests passed
- PASS `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts tests/planning-v2-api/run-route.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batches-merge-api.test.ts tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-draft-scenario-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-exposure-api.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/planning-v3-internal-route-contract.test.ts tests/planning-v3-journal-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/planning-v3-opening-balances-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-v2-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profiles-api.test.ts tests/planning-v3-routines-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3/api-drafts-route.test.ts`
  - 36 files, 136 tests passed
- PASS `corepack pnpm planning:auth:check`
  - 13 files, 109 tests passed
- PASS `corepack pnpm lint`

## 남은 리스크
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` bridge는 아직 남아 있습니다.
- 다음 라운드는 bridge 제거와 계약 테스트 문구 갱신을 별도 커밋으로 진행해야 합니다.
- runtime source 변경이 없어 `pnpm build`와 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
