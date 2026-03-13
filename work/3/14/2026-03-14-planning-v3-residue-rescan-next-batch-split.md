# 2026-03-14 planning-v3 residue-rescan-next-batch-split

## 변경 파일
- 코드 수정 없음
- `work/3/14/2026-03-14-planning-v3-residue-rescan-next-batch-split.md`

## 사용 skill
- `planning-gate-selector`: residue 후보별 최소 검증 세트를 `정적 스캔`, `targeted vitest`, `eslint`, `build`, `narrow e2e`까지 어디서 끊을지 다시 분해하는 데 사용
- `work-log-closeout`: 구현 없이 이번 라운드의 residue 분류, freshness 판단, 다음 우선순위를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest note `work/3/14/2026-03-14-planning-v3-transactions-batches-import-user-facing-contract.md`가 다음 우선순위를 `[가정] planning-v3 residue re-scan and next-batch split`로 남겼다.
- current worktree에는 planning-v3 dirty가 여전히 넓게 남아 있어, 바로 다음 구현으로 들어가면 이미 닫힌 배치와 실제 미완료 축이 다시 섞일 위험이 있었다.
- 이번 라운드는 구현이 아니라 residue 재분해만 수행하고, `/planning/v3/news/explore`의 freshness 기대와 실제 구현 경로가 어긋나는지도 함께 분리하는 것이 목적이다.

## current residue 현황
- `planning/v3/news`, `src/app/api/planning/v3/news`, `src/app/planning/v3/news`, `tests/planning-v3-news-*` 기준 status entry는 현재 `49`개다. 이 중 대부분은 이미 닫힌 `news read-only surface`, `news write/settings surface`, `news refresh/recovery/internal tail`, `news notes/weekly-plan write contract`의 잔여 diff로 재매핑된다.
- 다만 `src/app/planning/v3/news/_components/NewsExploreClient.tsx`, `src/app/api/planning/v3/news/search/route.ts`, `src/app/api/planning/v3/news/refresh/route.ts`, `src/app/planning/v3/news/_components/NewsTodayClient.tsx`, `src/app/planning/v3/news/_components/NewsDigestClient.tsx`, `tests/planning-v3-news-api.test.ts`, `tests/planning-v3-news-search-api.test.ts`의 `7 files`는 `news/explore freshness`라는 실제 미완료 축으로 따로 떼는 편이 맞다.
- `planning/v3/alerts/{rootDir.ts,store.ts,store.test.ts}` `3 files`는 `alerts store/root contract` closeout 잔여 diff다. 이번 라운드 기준 새 미완료 축으로 보이지 않았다.
- `planning/v3/indicators/**`와 `tests/planning-v3-indicators-specs-import-api.test.ts`를 포함한 `12 status entries`는 earlier `indicators connector harness`, `indicators specs import/root contract` closeout 잔여 diff로 분류했다.
- `accounts/profile remote-host contract`가 잠갔던 route/test subset은 현재 diff 기준 `13 files`가 남아 있지만, direct guard contract 자체는 이미 닫혔다. 이 중 일부는 더 큰 `draft-profile` 또는 `txn-accounts-batches` user-facing surface에 포함될 뿐, remote-host batch 자체가 다시 열린 것은 아니다.
- `transactions/batches/import user-facing contract`가 잠갔던 subset은 현재 diff 기준 `10 files`가 남아 있지만, import route/UI/flow contract 자체는 이미 닫혔다. 남은 거래/배치 dirty는 더 큰 `txn-accounts-batches surface`로 보는 편이 맞다.

## 다시 나눈 후보 배치
- `planning-v3 news-explore freshness contract` (`7 current dirty files`, [가정] 실제 fix 시 `src/lib/news/searchIndex.ts`까지 `6~8 files`)
  - 변경 이유: `NewsExploreClient`는 `/api/planning/v3/news/search`만 읽고 `refresh`를 직접 호출하지 않는데, `search` route는 existing search index가 있으면 재생성하지 않는다.
  - 사용자 영향 여부: 있음. today/digest는 수동 갱신 후 새 데이터를 보여줄 수 있는데 explore는 stale index를 계속 보여줄 수 있다.
  - 최소 검증 세트: `tests/planning-v3-news-search-api.test.ts` + `tests/planning-v3-news-api.test.ts` targeted `vitest`, touched file `eslint`, `pnpm build`
  - 다른 축과 섞이면 위험한 이유: read-only 탐색 UX와 refresh/recovery internal pipeline을 한 배치로 크게 열면, stale data 원인과 UI copy 원인을 분리하기 어려워진다.
- `planning-v3 ops-migrate-golden-pipeline contract` (`3 files`)
  - 변경 이유: `planning/v3/ops/migrate.ts`, `planning/v3/ops/migrate.test.ts`, `planning/v3/qa/goldenPipeline.test.ts`만으로 닫히는 가장 작은 internal-only cluster다.
  - 사용자 영향 여부: 낮음. 운영/검증 경로 중심이다.
  - 최소 검증 세트: `pnpm exec vitest run planning/v3/ops/migrate.test.ts planning/v3/qa/goldenPipeline.test.ts`, touched file `eslint`
  - 다른 축과 섞이면 위험한 이유: migration regression과 user-facing route regression이 한 번에 섞이면 rollback 기준이 흐려진다.
- `planning-v3 draft-profile user-facing surface` (`22 files`)
  - 변경 이유: `draft/*`, `drafts/*`, `profiles/route.ts`, drafts/profile clients, draft/profile API/UI tests가 하나의 write/read 흐름으로 크게 응집돼 있다.
  - 사용자 영향 여부: 높음. draft preview/apply/create-profile와 profile draft 목록/상세/preflight에 직접 닿는다.
  - 최소 검증 세트: 관련 `draft/profile` targeted `vitest`, touched file `eslint`, `pnpm build`, 화면/셀렉터가 바뀌면 narrow `e2e`
  - 다른 축과 섞이면 위험한 이유: draft payload, remote-host guard, user-facing empty/help copy가 한꺼번에 섞이면 실패 원인 분리가 어렵다.
- `planning-v3 txn-accounts-batches surface` (`27 files`)
  - 변경 이유: accounts/balances/batches/transactions route와 client, import/account tests, batch detail/list, redirect/e2e가 한 cluster로 남아 있다.
  - 사용자 영향 여부: 높음. 계좌/배치/거래 반영 흐름 전체에 직접 영향이 있다.
  - 최소 검증 세트: 관련 targeted `vitest`, touched file `eslint`, `pnpm build`, batch/detail 흐름이 바뀌면 narrow `e2e`
  - 다른 축과 섞이면 위험한 이유: import/save, overrides, cashflow, account assignment까지 한 번에 열리면 rollback과 원인 분리가 가장 어렵다.
- `planning-v3 auxiliary route-guard contract` (`12 files`)
  - 변경 이유: `categories/rules`, `journal/entries`, `routines/daily`, `exposure/profile`, `indicators/specs` route와 guard tests가 cross-cutting으로 묶여 있다.
  - 사용자 영향 여부: 중간. 직접 UI보다는 write/read API guard consistency 영향이 크다.
  - 최소 검증 세트: 관련 guard/API targeted `vitest`, touched file `eslint`, `pnpm build`
  - 다른 축과 섞이면 위험한 이유: business payload regression과 same-origin/remote-host guard regression이 겹쳐 실제 원인 판단이 늦어진다.

## `/planning/v3/news/explore` freshness 분류
- 현재 구현 경로
  - `NewsExploreClient`는 `GET /api/planning/v3/news/search`만 호출한다.
  - `GET /api/planning/v3/news/search`는 `readNewsSearchIndex()` 결과가 있으면 그대로 사용하고, 없을 때만 `writeNewsSearchIndex()`로 초기 index를 만든다.
  - `POST /api/planning/v3/news/refresh`는 `runNewsRefresh()`를 실행해 today/scenarios/trends cache와 runtime state를 갱신한다.
  - `runNewsRefresh()`는 `writeTodayCache`, `writeScenariosCache`, `writeTrendsCache`, `writeState`는 호출하지만 search index 재생성은 하지 않는다.
- 왜 데이터가 안 갱신돼 보일 수 있는지
  - 1차 원인: `search index freshness 문제`다. refresh가 성공해도 existing search index file은 그대로 남아 explore 결과가 stale할 수 있다.
  - 2차 원인: `사용자 기대와 UI 안내 문제`도 있다. search route는 `indexGeneratedAt`를 응답에 넣지만 `NewsExploreClient`는 이를 표시하지 않고, today/digest처럼 `수동 갱신` CTA나 `lastRefreshedAt` 안내도 없다.
  - `refresh pipeline 미연결 문제`라고 부를 수도 있지만, 더 정확히는 `refresh pipeline이 search index freshness까지 닫아 주지 않는다`가 맞다.
- 분리 결과
  - 이 이슈는 이미 닫힌 `news read-only surface` 전체를 다시 여는 문제가 아니라, `news-explore freshness contract`라는 새 follow-up batch로 따로 빼는 편이 맞다.

## 추천 다음 구현 배치
1. `planning-v3 news-explore freshness contract`

추천 이유
- 이번 재스캔에서 실제 기능 mismatch가 확인된 유일한 news 미완료 축이다.
- current dirty 기준으로도 `7 files` 정도로 작고, user-facing stale symptom을 직접 줄일 수 있다.
- `ops-migrate-golden-pipeline`보다 조금 넓지만, `draft-profile`이나 `txn-accounts-batches`보다 훨씬 작고 rollback도 쉽다.
- 이미 닫힌 news batch를 통째로 다시 여는 대신 `search index freshness + 안내` join point만 좁게 고치면 된다.

## 명시적 제외 범위
- 이번 라운드에서 다시 구현으로 열지 않는 closed residual
  - `news write/settings surface`
  - `news refresh/recovery/internal tail` 전체
  - `news notes/weekly-plan write contract`
  - `alerts store/root contract`
  - `accounts/profile remote-host contract`
  - `draft/profile-drafts route contract`
  - `transactions/batches/import user-facing contract`
  - `indicators connector harness`
  - `indicators specs import/root contract`
- 단, 추천 다음 배치가 `news-explore freshness contract`일 경우에는 `search`와 `refresh`의 좁은 join point만 다시 열고, 위 closed batch 전체를 재구현하지 않는다.
- runtime 축, build/e2e/release gate 재오픈, planning-v2/reports-ui, docs/scripts 전체는 계속 제외한다.

## 검증
- 기준선 / closeout 확인
  - `sed -n '1,240p' work/3/14/2026-03-14-planning-v3-transactions-batches-import-user-facing-contract.md`
  - `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-draft-profile-drafts-route-contract.md`
  - `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-accounts-profile-remote-host-contract.md`
  - `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-alerts-store-root-contract.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-post-news-residue-rescan-next-batch-split.md`
  - `ls -1t work/3/14 | head -n 6`
- residue 정적 스캔
  - `git status --short | rg '^( M|M |MM|A |AM| D|D |R |C |\?\?) (src/app/api/planning/v3|src/app/planning/v3|planning/v3|tests/planning-v3|tests/e2e|work/)'`
  - `git diff --stat -- planning/v3/ops/migrate.ts planning/v3/ops/migrate.test.ts planning/v3/qa/goldenPipeline.test.ts ...`
  - `git diff --name-only -- planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news tests/planning-v3-news-*.test.ts`
  - `git diff --name-only -- src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/refresh/route.ts src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsDigestClient.tsx tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts`
  - `git status --short -- planning/v3/alerts/rootDir.ts planning/v3/indicators/rootDir.ts planning/v3/news/rootDir.ts`
  - `git status --short -- planning/v3/alerts planning/v3/indicators planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news tests/planning-v3-news-*.test.ts tests/planning-v3-indicators-specs-import-api.test.ts`
- `news/explore` freshness 경로 확인
  - `nl -ba src/app/planning/v3/news/_components/NewsExploreClient.tsx | sed -n '1,320p'`
  - `nl -ba src/app/api/planning/v3/news/search/route.ts | sed -n '1,260p'`
  - `nl -ba src/app/api/planning/v3/news/refresh/route.ts | sed -n '1,240p'`
  - `nl -ba src/app/planning/v3/news/_components/NewsTodayClient.tsx | sed -n '1,260p'`
  - `nl -ba src/app/planning/v3/news/_components/NewsDigestClient.tsx | sed -n '1,260p'`
  - `nl -ba src/lib/planning/v3/news/search.ts | sed -n '1,340p'`
  - `nl -ba src/lib/news/searchIndex.ts | sed -n '1,340p'`
  - `nl -ba planning/v3/news/cli/newsRefresh.ts | sed -n '1,360p'`
  - `nl -ba src/app/api/planning/v3/news/today/route.ts | sed -n '1,260p'`
  - `rg -n "news/refresh|lastRefreshedAt|writeNewsSearchIndex|readNewsSearchIndex|generatedAt|indexGeneratedAt" src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/refresh/route.ts src/lib/news/searchIndex.ts planning/v3/news/cli/newsRefresh.ts`
  - `nl -ba tests/planning-v3-news-search-api.test.ts | sed -n '1,260p'`
- 실행한 검증
  - `git diff --check -- work/3/14/2026-03-14-planning-v3-residue-rescan-next-batch-split.md`
- 미실행 검증
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`
  - `pnpm release:verify`

## 남은 리스크
- 이번 라운드는 정적 스캔만 수행했으므로, 추천 batch를 실제로 열기 전에는 포함 파일을 다시 `subset lock` 해야 한다.
- `news-explore freshness contract`는 current dirty `7 files`로 보이지만, 실제 수정은 [가정] `src/lib/news/searchIndex.ts`나 search index 재생성 helper까지 닿을 수 있다.
- `draft-profile user-facing surface`와 `txn-accounts-batches surface`는 서로 API/test를 일부 공유하므로, 다음 라운드에서 둘을 동시에 열면 원인 분리가 다시 어려워진다.

## 다음 라운드 우선순위
1. `planning-v3 news-explore freshness contract`
2. `planning-v3 ops-migrate-golden-pipeline contract`
3. `planning-v3 draft-profile user-facing surface`
