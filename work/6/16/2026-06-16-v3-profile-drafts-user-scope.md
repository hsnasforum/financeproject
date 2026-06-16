# 2026-06-16 v3 profile drafts user scope

## 변경 파일
- `src/app/api/planning/v3/batches/import/csv/route.ts`
- `src/app/api/planning/v3/profile/draft/route.ts`
- `src/app/api/planning/v3/profile/drafts/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
- `src/lib/planning/api/routeAuth.ts`
- `src/lib/planning/v3/store/draftStore.ts`
- `tests/planning-v3-profile-draft-v2-api.test.ts`
- `tests/planning-v3-profile-drafts-api.test.ts`
- `tests/planning-v3-profile-draft-user-scope.test.ts`
- `tests/planning-v3-profile-drafts-user-scope.test.ts`
- `work/6/16/2026-06-16-v3-profile-drafts-user-scope.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록과 PR #34 이후 남은 v3 route family를 확인했습니다.
- `planning-gate-selector`: profile draft API route 변경에 맞춰 관련 vitest, lint, build 검증을 선택했습니다.
- `planning-v3-batch-contract-narrowing`: draft/profile read 경로가 batch-family surface에 닿는지 확인하고 store/service 정리 범위를 제외했습니다.
- `verification-failure-followthrough`: 실패한 user-scope 테스트와 build 타임아웃을 좁은 원인으로 분리했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 리스크를 이번 기록으로 정리했습니다.

## 변경 이유
- profile draft preview, draft list/detail/delete, preflight, apply route가 인증 사용자 범위를 응답 meta와 저장소 경로에 일관되게 반영해야 했습니다.
- `batches/import/csv` route는 profile draft 테스트 fixture와 실제 draft 생성의 선행 batch 생성 경로라 같은 사용자 scope가 필요했습니다.
- direct route guard 패턴에서 `isPlanningRouteUser()` 호출 후 caller context에 사용자 scope를 다시 고정하지 않으면 병렬 테스트나 후속 storage helper에서 이전 scope가 섞일 수 있었습니다.

## 전달 변경
- profile draft 계열 route와 `batches/import/csv` route에 `requirePlanningRouteUser`, `planningUserMeta`를 적용했습니다.
- profile draft 오류 응답에 인증된 `meta.userId/authSource`를 포함하고, 사용자 노출 문구를 batch/profile 용어 대신 상담 자료/상담 정보 기준으로 정리했습니다.
- `draftStore` 기본/legacy v3 draft 경로를 namespace 활성화 시 `.data/planning/users/{userId}/...` 아래로 분리했습니다.
- `isPlanningRouteUser()`가 direct guard 후 사용자 scope를 caller context에 다시 입력하도록 보강했습니다.
- Alice/Bob user-scope 테스트 2개를 추가하고 기존 API 테스트의 핵심 오류 문구 기대값을 갱신했습니다.

## 검증
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- PASS: `git diff --check`
- FAIL: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-profile-draft-user-scope.test.ts tests/planning-v3-profile-drafts-user-scope.test.ts tests/planning-v3-profile-draft-v2-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` - route auth만 이식한 상태에서 profile draft user-scope 3건이 실패했습니다.
- FAIL: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-profile-draft-user-scope.test.ts tests/planning-v3-profile-drafts-user-scope.test.ts` - 과도한 service patch가 `loadBatchVisiblePipeline` 누락을 만들었습니다.
- FAIL: 같은 narrow vitest - helper를 추가한 뒤에도 direct guard scope refresh가 없어 교차 사용자 격리가 실패했습니다.
- PASS: 같은 narrow vitest - `isPlanningRouteUser()` scope refresh 후 2 files, 3 tests 통과.
- FAIL: broader vitest - 별도 preflight schema hardening 조각이 섞여 preflight 500 회귀가 발생했습니다.
- PASS: broader vitest - service/schema hardening을 이번 PR 범위에서 제외한 뒤 8 files, 29 tests 통과.
- PASS: 최신 `origin/main=2454e22` rebase 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-profile-draft-user-scope.test.ts tests/planning-v3-profile-drafts-user-scope.test.ts tests/planning-v3-profile-draft-v2-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm lint`
- INCONCLUSIVE: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build` - 184초 타임아웃 후 build 프로세스 cwd가 원본 dirty worktree로 확인되어 중단했습니다.
- PASS: `cd /home/xpdlqj/code/finance-pr-v3-profile-drafts-user-scope && DATABASE_URL="file:./prisma/dev.db" corepack pnpm build`

## 남은 리스크
- namespace 활성화 전 공용 `.data/planning-v3/drafts` 또는 `.data/v3/drafts`에 저장된 기존 draft 자동 이관은 이번 범위에 포함하지 않았습니다.
- `generateDraftPatchFromBatch`, `preflightDraftPatch`, `applyDraftPatchToProfile`의 schema/field hardening은 이번 PR에서 제외했으며 별도 batch-family contract PR로 분리해야 합니다.
- 원본 worktree에는 여전히 다수 dirty 항목이 남아 있어 다음 라운드에서도 route family 단위로 분리해야 합니다.
