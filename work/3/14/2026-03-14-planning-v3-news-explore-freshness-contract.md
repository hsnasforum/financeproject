# 2026-03-14 planning-v3 news-explore freshness contract

## 변경 파일
- `src/app/api/planning/v3/news/search/route.ts`
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `tests/planning-v3-news-search-api.test.ts`
- `work/3/14/2026-03-14-planning-v3-news-explore-freshness-contract.md`

## 사용 skill
- `planning-gate-selector`: search route + user-facing copy + direct API test 조합에 맞춰 `targeted vitest`, touched-file `eslint`, `pnpm build`만 실행하도록 검증 범위를 잠그는 데 사용
- `work-log-closeout`: 이번 라운드의 실제 변경, 검증, 잔여 blocker, 다음 우선순위를 `/work` 형식으로 정리하는 데 사용

## 변경 이유
- latest note `work/3/14/2026-03-14-planning-v3-residue-rescan-next-batch-split.md`가 이번 배치를 다음 구현 1순위로 남겼다.
- `/planning/v3/news/explore`는 `GET /api/planning/v3/news/search`만 읽는데, 이 route는 SQLite 기반 `index.json`을 사용한다.
- 반면 `POST /api/planning/v3/news/refresh`는 `planning/v3/news/store`의 JSON item/cache/state만 갱신하고 search index를 갱신하지 않는다.
- 그래서 사용자는 수동 갱신 직후에도 explore가 그대로여서 "뉴스가 업데이트되지 않는다"로 느낄 수 있었다.

## 핵심 변경
- `search` route 응답에 `freshness` 메타데이터를 추가했다. 계약은 `search_index` 기준이며, `indexGeneratedAt`과 `lastRefreshedAt`을 함께 내려 주도록 고정했다.
- `search` route가 `readState().lastRunAt`과 search index 생성 시각을 비교해 `current | stale` 상태를 계산하도록 했다.
- `NewsExploreClient`가 이 freshness 메타데이터를 읽어, 탐색 화면이 `검색 인덱스 기준 조회`라는 점과 `최근 수동 갱신이 더 최신일 때 바로 안 바뀌는 이유`를 화면에 직접 안내하도록 했다.
- direct API test에 freshness 메타데이터 기본값과 stale 판정 케이스를 추가해 route 계약을 고정했다.
- 이번 라운드에서는 `refresh` route나 search index persistence 자체를 다시 열지 않았다. 실제 주원인은 `refresh pipeline`과 `explore search surface`가 다른 저장 계약을 본다는 점이고, 최소 수정은 이를 route/UI 계약에서 드러내는 쪽으로 제한했다.

## 검증
- 실행한 검증
  - `pnpm exec vitest run tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-api.test.ts`
  - `pnpm exec eslint src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/refresh/route.ts src/lib/planning/v3/news/search.ts src/lib/news/searchIndex.ts planning/v3/news/cli/newsRefresh.ts tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-api.test.ts`
  - `pnpm build`
- 미실행 검증
  - `pnpm e2e:rc`

## 남은 리스크
- [blocked] `runNewsRefresh()`는 여전히 JSON store/cache만 갱신하고, explore search surface는 별도 SQLite/index 계약을 읽는다. 이번 라운드는 stale 상태를 감지하고 설명하도록만 고쳤고, refresh 직후 explore가 실제로 즉시 최신 데이터로 바뀌는 연결은 아직 없다.
- 현재 stale 안내는 `lastRunAt > indexGeneratedAt` 비교에 의존한다. search index 재생성 경로가 별도로 돌면 상태는 해소되지만, 그 재생성 트리거는 이번 배치에서 추가하지 않았다.
- `NewsExploreClient`에는 여전히 직접 refresh trigger가 없다. 이번 라운드는 안내 문구만 추가했고, 수동 갱신 CTA를 explore에 넣는 확장은 의도적으로 제외했다.

## 다음 라운드 우선순위
1. `planning-v3 ops-migrate-golden-pipeline contract`
2. `planning-v3 draft-profile user-facing surface`
3. `[가정] planning-v3 news search-refresh storage join point`
