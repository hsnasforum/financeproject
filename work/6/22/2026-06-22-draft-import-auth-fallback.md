# 2026-06-22 draft/import auth fallback 정리

## 변경 파일
- `tests/planning-v3/api-drafts-create-from-import.test.ts`
- `tests/planning-v3/csv-import.test.ts`
- `tests/planning-v3-batches-import-csv-api.test.ts`
- `tests/planning-v3-draft-create-profile-api.test.ts`
- `tests/planning-v3-draft-preview-api.test.ts`
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
- `work/6/22/2026-06-22-draft-import-auth-fallback.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록과 clean 기준선을 확인했습니다.
- `finance-skill-routing`: auth fallback 테스트 정리와 v3 draft/import 접점을 기준으로 skill 조합을 좁혔습니다.
- `planning-gate-selector`: 테스트 파일 중심 변경에 맞춰 targeted test, `planning:auth:check`, `lint`를 선택했습니다.
- `planning-v3-batch-contract-narrowing`: draft/profile 및 batch import 테스트 변경이 runtime reader/writer 계약을 건드리지 않는지 확인했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 잔여 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` bridge 의존을 줄이기 위해 draft/import 성격이 뚜렷한 v3 route 테스트를 명시 fallback으로 전환했습니다.
- runtime route나 payload shape는 바꾸지 않고 테스트 실행 환경 의도만 파일 단위로 드러냈습니다.

## 핵심 변경
- draft create-from-import, CSV import, batch CSV import, draft create-profile, draft preview 테스트에 `installPlanningAuthRequiredFalseForTest()`를 적용했습니다.
- 하위 `tests/planning-v3/*` 테스트는 `../planning/auth/testPlanningAuthEnv` 경로를 사용했습니다.
- 루트 `tests/planning-v3-*.test.ts` 테스트는 `./planning/auth/testPlanningAuthEnv` 경로를 사용했습니다.
- `vitestPlanningAuthFallbackContract` runtime allowlist에서 위 5개 파일을 제거했습니다.
- runtime implicit local auth fallback allowlist는 19개에서 14개로 줄었습니다.
- Spark explorer는 남은 allowlist의 helper 적용 가능성만 정적으로 조사했고 파일 수정은 하지 않았습니다.

## 검증
- PASS `corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts tests/planning-v3/api-drafts-create-from-import.test.ts tests/planning-v3/csv-import.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-batches-import-csv-api.test.ts`
  - 6 files, 29 tests passed
- PASS `corepack pnpm planning:auth:check`
  - 13 files, 111 tests passed
- PASS `corepack pnpm lint`

## 남은 리스크
- `vitest.config.ts`의 전역 `PLANNING_AUTH_REQUIRED=false` bridge는 아직 남아 있습니다.
- runtime route import allowlist 14개가 남아 있어 remote-host, news, opening balances, categories/batches, write guard 계열 테스트를 다음 라운드에서 이어서 정리해야 합니다.
- runtime source 변경이 없어 `pnpm build`와 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
