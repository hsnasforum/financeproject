# 2026-03-14 planning-v3 post-closeout-residue-rescan-blocker-check

## 변경 파일
- `work/3/14/2026-03-14-planning-v3-post-closeout-residue-rescan-blocker-check.md`
- 코드 수정 없음

## 사용 skill
- `work-log-closeout`: post-closeout residue 재분류 결과, 실제 blocker 유무, 다음 라운드 추천 여부를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest `profile-drafts list load-failure empty/help split` note 이후에는 확정된 다음 구현 1축이 남아 있지 않았다.
- current git status에는 오늘 닫은 batch들의 미커밋 diff와 earlier `ops-migrate-golden-pipeline contract` 잔여가 함께 섞여 있어, dirty만 보고 바로 다음 구현으로 들어가면 이미 닫힌 축을 다시 열 가능성이 컸다.
- 이번 라운드는 코드 수정 없이 current dirty를 `닫힌 batch 잔여 diff`와 `실제 미완료 blocker`로 다시 분류하고, 조건부 reopen 후보만 정적으로 재확인하는 것이 목적이었다.

## 핵심 변경
- current dirty는 새 blocker보다 닫힌 batch 잔여 diff로 재매핑됐다.
- `ops-migrate-golden-pipeline contract` 잔여 diff: `planning/v3/ops/migrate.test.ts`, `planning/v3/qa/goldenPipeline.test.ts`
- `news-explore freshness contract` + `news-search-refresh-storage-join-point` 잔여 diff: `src/app/api/planning/v3/news/search/route.ts`, `src/app/planning/v3/news/_components/NewsExploreClient.tsx`, `src/lib/planning/v3/news/search.ts`, `tests/planning-v3-news-search-api.test.ts`
- `draft-profile user-facing surface` + `profile-drafts list load-failure empty/help split` 잔여 diff: `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`, `src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`, `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`, `tests/planning-v3-profile-drafts-ui.test.tsx`, `tests/e2e/v3-draft-apply.spec.ts`, `tests/planning-v3-legacy-drafts-ui.test.tsx`
- `txn-accounts-batches surface` 잔여 diff: `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx`, `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`, `tests/planning-v3-user-facing-remote-host-api.test.ts`, `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- untracked `work/3/14/*.md` 파일들은 오늘 닫은 batch closeout note들이며, 새 구현 blocker가 아니라 아직 commit되지 않은 작업 기록이다.
- 조건부 reopen 재확인 결과:
- `news follow-through/copy residue`: 현재 `search` route는 refresh 시각이 index보다 최신이면 store 기반으로 index를 다시 쓰고, `tests/planning-v3-news-search-api.test.ts`도 그 뒤 `freshness.status === "current"`를 기대한다. 즉 `NewsExploreClient`의 stale/current 안내 diff는 닫힌 batch 잔여이며, 이번 정적 재확인 기준 새 blocker로 보이지 않았다.
- `txn/accounts/batches helper 계산층`: current dirty에는 helper나 계산 route 파일이 없고, `transactions` cluster diff도 `/planning/v3/import/csv` follow-through 보정과 그 테스트 고정만 포함한다. helper 계산 mismatch는 다시 확인되지 않았다.
- `기타 새 user-facing residue`: current dirty 밖 정적 스캔에서 `/planning/v3/import` referer 흔적이 `tests/planning-v3-write-route-guards.test.ts`, `tests/planning-v3-batches-api.test.ts`, `tests/planning-v3/api-drafts-route.test.ts` 등에 남아 있지만, 이번 라운드 기준 current dirty도 아니고 user-facing reopen blocker도 아니다.
- 결론: 이번 라운드에서 바로 추천할 새 구현 batch는 없다. `commit/cleanup 우선`이 더 안전하다.

## 검증
- 실행: `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-draft-profile-user-facing-surface.md`
- 실행: `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-news-search-refresh-storage-join-point.md`
- 실행: `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-txn-accounts-batches-surface.md`
- 실행: `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-profile-drafts-list-load-failure-empty-help-split.md`
- 실행: `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-news-explore-freshness-contract.md`
- 실행: `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-ops-migrate-golden-pipeline-contract.md`
- 실행: `git status --short --untracked-files=no`
- 실행: `git status --short work/3/14`
- 실행: `git diff --stat -- planning/v3/ops/migrate.test.ts planning/v3/qa/goldenPipeline.test.ts src/app/api/planning/v3/news/search/route.ts src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx src/lib/planning/v3/news/search.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts tests/e2e/v3-draft-apply.spec.ts tests/planning-v3-legacy-drafts-ui.test.tsx tests/planning-v3-news-search-api.test.ts tests/planning-v3-profile-drafts-ui.test.tsx tests/planning-v3-user-facing-remote-host-api.test.ts`
- 실행: `git diff --unified=30 -- src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/api/planning/v3/news/search/route.ts src/lib/planning/v3/news/search.ts`
- 실행: `git diff --unified=20 -- src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx tests/planning-v3-user-facing-remote-host-api.test.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- 실행: `git diff --unified=20 -- tests/planning-v3-legacy-drafts-ui.test.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- 실행: `rg -n "planning-v3-write-route-guards.test.ts|/planning/v3/import\\b" tests src/app/planning/v3 | head -n 200`
- 실행: `rg -n "status\\)\\.toBe\\(\\\"stale\\\"|status\\?: string|lastRefreshedAt|freshness" tests/planning-v3-news-search-api.test.ts src/app/api/planning/v3/news/search/route.ts src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- 미실행: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`
- 미실행 이유: 이번 라운드는 코드 수정 없이 `git status` / `git diff` / `rg` / `sed` 기반 정적 재분류만 수행했다.

## 남은 리스크
- current worktree가 아직 dirty라서, 다음 구현 batch를 열기 전에 commit 또는 명시적 cleanup 없이 다시 subset lock을 잡으면 이미 닫힌 축을 재오픈할 가능성이 높다.
- `NewsExploreClient`에는 stale 안내 분기가 남아 있지만, 현재 route/test 계약 기준으로는 새 blocker가 아니라 closed-batch residue에 가깝다. 후속 reopen은 실제 stale user report가 다시 확인될 때만 검토하는 편이 안전하다.
- `/planning/v3/import` referer 흔적이 일부 out-of-scope 테스트에 남아 있지만, 이번 라운드 기준 user-facing blocker는 아니다. 필요하면 별도 route-guard/test cleanup batch로 분리하는 편이 낫다.

## 다음 라운드 우선순위
1. 새 구현 batch 없음. commit/cleanup 우선
2. news follow-through/copy는 실제 stale user-facing blocker가 다시 확인될 때만 reopen
3. txn/accounts/batches helper 계산층은 실제 mismatch가 다시 확인될 때만 reopen
