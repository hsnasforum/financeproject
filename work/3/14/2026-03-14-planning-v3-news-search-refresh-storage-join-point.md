# 2026-03-14 planning-v3 news-search-refresh-storage-join-point

## 변경 파일
- `src/lib/planning/v3/news/search.ts`
- `src/app/api/planning/v3/news/search/route.ts`
- `tests/planning-v3-news-search-api.test.ts`

## 사용 skill
- `planning-gate-selector`: 이번 배치가 `direct API test + eslint + build + diff check`로 닫히는지 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: `/work` closeout note 섹션과 기록 기준을 맞추는 데 사용

## 변경 이유
- latest note 기준 다음 우선순위 1번이 `[가정] planning-v3 news search-refresh storage join point`였고, 이번 라운드는 stale 안내 copy가 아니라 실제 `refresh -> search storage` 연결을 닫는 reopen으로 잡았다.
- 실제 원인은 `runNewsRefresh()`가 V3 JSON store/state만 갱신하는 반면, `/planning/v3/news/explore`의 search route는 별도 `index.json`을 읽고 있었기 때문이다.
- 기존 `writeNewsSearchIndex()`의 재생성 입력은 SQLite `news_items`라서, refresh 직후에도 explore가 새 store를 바로 따라가지 못했다.

## 핵심 변경
- `src/lib/planning/v3/news/search.ts`에 V3 JSON store를 읽어 `index.json`을 다시 쓰는 `writeNewsSearchIndexFromStore()` helper를 추가했다.
- helper는 `loadEffectiveNewsConfig()`와 `readAllItems()`를 함께 사용해 source 이름, topic 태깅, score/rationale을 search index 형식으로 다시 맞춘다.
- `src/app/api/planning/v3/news/search/route.ts`는 `state.lastRunAt > index.generatedAt` 또는 index 부재 시 SQLite 재생성이 아니라 store-backed helper를 우선 사용하도록 바꿨다.
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`는 audit만 했고, 직전 라운드 stale/current 안내 문구는 그대로 유지했다.
- `tests/planning-v3-news-search-api.test.ts`에는 refresh 이후 V3 store에만 있는 새 아이템이 search 응답과 persisted index에 바로 반영되는지 고정하는 케이스를 추가했다.

## 검증
- 실행: `pnpm exec vitest run tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-api.test.ts`
- 실행: `pnpm exec eslint src/app/api/planning/v3/news/search/route.ts src/app/planning/v3/news/_components/NewsExploreClient.tsx src/lib/planning/v3/news/search.ts tests/planning-v3-news-search-api.test.ts`
- 실행: `pnpm build`
- 미실행: `pnpm exec eslint src/app/api/planning/v3/news/refresh/route.ts planning/v3/news/cli/newsRefresh.ts src/lib/news/searchIndex.ts`
- 미실행 이유: 이번 라운드에서는 `refresh route`, CLI, legacy SQLite builder를 직접 수정하지 않았다.
- 미실행: narrow e2e
- 미실행 이유: 사용자 셀렉터나 follow-through 문구를 새로 바꾸지 않았고, direct API test로 join point를 고정했다.

## 남은 리스크
- `search` 기본 필터가 쿼리 파라미터 없이 호출될 때 `days=1`, `limit=1`로 수렴하는 기존 동작은 이번 배치 범위 밖이라 그대로 남겼다.
- refresh 이후 JSON store 기반 search index는 닫았지만, SQLite 기반 legacy index builder와의 장기적인 중복 정리는 별도 배치가 필요하다.
- `NewsExploreClient`의 stale 안내 문구는 이제 실제 join point와 맞아졌지만, success follow-through copy를 더 줄일지 여부는 이번 라운드에서 reopen하지 않았다.

## 다음 라운드 우선순위
1. `planning-v3 txn-accounts-batches surface`
2. `[가정] planning-v3 profile-drafts list load-failure empty/help split`
3. [가정] news 쪽에서만 남는 follow-through/copy residue가 실제 blocker로 다시 확인될 때만 후속 reopen
