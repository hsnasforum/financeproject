# 2026-03-13 planning-v3 news-readonly-surface-followup

## 변경 파일
- 추가 코드 수정 없음
- audit/closeout 대상 dirty subset
  - `planning/v3/news/{digest.test.ts,llmAdapter.test.ts,scenario.test.ts,scenario/qualityGates.test.ts,select/score.ts,store/index.ts,store/store.test.ts}`
  - `src/app/api/planning/v3/news/{digest,exposure,items,scenarios,search,sources,today,trends}/route.ts`
  - `src/app/planning/v3/news/_components/{NewsDigestClient,NewsExploreClient,NewsTodayClient,NewsTrendsClient,NewsTrendsTableClient}.tsx`
  - `src/app/planning/v3/news/trends/page.tsx`
  - `tests/{planning-v3-news-api.test.ts,planning-v3-news-search-api.test.ts}`
- `work/3/13/2026-03-13-planning-v3-news-readonly-surface-followup.md`

## 사용 skill
- `planning-gate-selector`: read-only route/component/test 범위에 맞는 최소 검증 세트를 `vitest + eslint + build + diff check`로 잠그는 데 사용
- `work-log-closeout`: 이번 closeout 결과와 미실행 검증을 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest `indicators specs import/root contract` note가 다음 우선순위 1번으로 `news read-only surface`를 남겼다.
- 현재 dirty subset은 `read-only routes + user-facing components + direct tests`로 자연스럽게 묶이고, `settings / alerts / notes / weekly-plan / recovery / refresh / indicators / runtime`를 다시 열지 않고도 원인 분리가 가능하다.
- 이번 라운드는 write semantics를 바꾸는 것이 아니라 read-only payload, empty/error/help copy, same-origin read contract가 이미 일관되게 맞는지 검증으로 잠그는 것이 목적이다.

## 핵심 변경
- read-only route들은 `assertSameOrigin` 기반 read guard와 `@/lib/planning/v3/...` alias import 정리 방향으로 이미 맞아 있었고, direct tests가 same-origin remote host 허용과 payload shape를 그대로 고정하고 있음을 재확인했다.
- `planning/v3/news/store/index.ts`와 `planning/v3/news/store/store.test.ts`는 `resolveNewsRootDir()`와 `PLANNING_DATA_DIR` 기반 default root 계약을 read-only store fixture 쪽에서 일관되게 유지하고 있었다.
- user-facing surface 쪽은 `NewsExploreClient`, `NewsTodayClient`, `NewsTrendsTableClient`, `NewsDigestClient`가 모두 쉬운 한국어의 hero/empty/help copy와 read-only 동선으로 정리돼 있었고, 추가 copy 수정은 필요하지 않았다.
- `NewsTrendsClient`는 `NewsTrendsTableClient` wrapper로 단순화돼 있었고, `trends/page.tsx`도 그 wrapper를 그대로 쓰는 상태로 build까지 문제 없었다.
- 조건부 `alerts` read 표면은 열지 않았다. 포함된 `tests/planning-v3-news-api.test.ts` 안의 인접 `refresh/settings` assertion도 이번 라운드에서는 수정 없이 PASS 확인만 했다.

## 검증
- 기준선/범위 확인
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-indicators-specs-import-root-contract.md`
  - `git status --short -- planning/v3/news/digest.test.ts planning/v3/news/llmAdapter.test.ts planning/v3/news/scenario.test.ts planning/v3/news/scenario/qualityGates.test.ts planning/v3/news/select/score.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts src/app/api/planning/v3/news/digest/route.ts src/app/api/planning/v3/news/exposure/route.ts src/app/api/planning/v3/news/items/route.ts src/app/api/planning/v3/news/scenarios/route.ts src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/sources/route.ts src/app/api/planning/v3/news/today/route.ts src/app/api/planning/v3/news/trends/route.ts src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsTrendsClient.tsx src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx src/app/planning/v3/news/trends/page.tsx tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts`
- 정적 audit
  - `git diff --stat -- planning/v3/news/digest.test.ts planning/v3/news/llmAdapter.test.ts planning/v3/news/scenario.test.ts planning/v3/news/scenario/qualityGates.test.ts planning/v3/news/select/score.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts src/app/api/planning/v3/news/digest/route.ts src/app/api/planning/v3/news/exposure/route.ts src/app/api/planning/v3/news/items/route.ts src/app/api/planning/v3/news/scenarios/route.ts src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/sources/route.ts src/app/api/planning/v3/news/today/route.ts src/app/api/planning/v3/news/trends/route.ts src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsTrendsClient.tsx src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx src/app/planning/v3/news/trends/page.tsx tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts`
  - `git diff --unified=40 -- src/app/api/planning/v3/news/digest/route.ts src/app/api/planning/v3/news/exposure/route.ts src/app/api/planning/v3/news/items/route.ts src/app/api/planning/v3/news/scenarios/route.ts src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/sources/route.ts src/app/api/planning/v3/news/today/route.ts src/app/api/planning/v3/news/trends/route.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts`
  - `git diff --unified=40 -- src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsTrendsClient.tsx src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx src/app/planning/v3/news/trends/page.tsx`
  - `git diff --unified=40 -- planning/v3/news/digest.test.ts planning/v3/news/llmAdapter.test.ts planning/v3/news/scenario.test.ts planning/v3/news/scenario/qualityGates.test.ts planning/v3/news/select/score.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts`
  - `rg -n "불러오는 중|데이터 없음|실패|오류|다시|도움|설정|탐색|트렌드|뉴스" src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsTrendsClient.tsx src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx`
  - `sed -n '1,260p' src/app/planning/v3/news/_components/NewsTodayClient.tsx`
  - `sed -n '1,260p' src/app/planning/v3/news/_components/NewsExploreClient.tsx`
  - `sed -n '1,260p' tests/planning-v3-news-api.test.ts`
  - `sed -n '1,220p' tests/planning-v3-news-search-api.test.ts`
- 실행한 검증
  - `pnpm exec vitest run planning/v3/news/digest.test.ts planning/v3/news/llmAdapter.test.ts planning/v3/news/scenario.test.ts planning/v3/news/scenario/qualityGates.test.ts planning/v3/news/store/store.test.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts`
  - `pnpm exec eslint planning/v3/news/select/score.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts src/app/api/planning/v3/news/digest/route.ts src/app/api/planning/v3/news/exposure/route.ts src/app/api/planning/v3/news/items/route.ts src/app/api/planning/v3/news/scenarios/route.ts src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/sources/route.ts src/app/api/planning/v3/news/today/route.ts src/app/api/planning/v3/news/trends/route.ts src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsTrendsClient.tsx src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx src/app/planning/v3/news/trends/page.tsx tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts`
  - `pnpm build`
  - `git diff --check -- planning/v3/news/digest.test.ts planning/v3/news/llmAdapter.test.ts planning/v3/news/scenario.test.ts planning/v3/news/scenario/qualityGates.test.ts planning/v3/news/select/score.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts src/app/api/planning/v3/news/digest/route.ts src/app/api/planning/v3/news/exposure/route.ts src/app/api/planning/v3/news/items/route.ts src/app/api/planning/v3/news/scenarios/route.ts src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/sources/route.ts src/app/api/planning/v3/news/today/route.ts src/app/api/planning/v3/news/trends/route.ts src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsTrendsClient.tsx src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx src/app/planning/v3/news/trends/page.tsx tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts work/3/13/2026-03-13-planning-v3-news-readonly-surface-followup.md`
  - `bash -lc 'out=$(git diff --no-index --check -- /dev/null work/3/13/2026-03-13-planning-v3-news-readonly-surface-followup.md 2>&1); if [ -n "$out" ]; then printf "%s" "$out"; exit 1; fi'`
- 미실행 검증
  - `pnpm e2e:rc`
  - `pnpm release:verify`
  - `pnpm planning:v2:complete`

## 남은 리스크
- 이번 라운드는 `read-only surface`만 닫았고 `news write/settings surface`는 그대로 남아 있다.
- `tests/planning-v3-news-api.test.ts`가 read-only 바깥의 `refresh/settings` assertion도 함께 포함하고 있어, 다음 write surface 라운드에서도 같은 파일을 다시 건드릴 가능성이 높다.
- 추가 코드 수정은 하지 않았기 때문에 현재 dirty의 의미는 “이미 정렬된 read-only route/component/test contract를 검증으로 잠금”에 가깝다.

## 이번 라운드 완료 항목
- `news read-only surface` 배치를 route/component/test/build 범위로 잠갔다.
- read-only payload, same-origin read contract, 한국어 empty/error/help surface가 current dirty 상태에서 일관되게 PASS함을 확인했다.
- `settings / alerts / notes / weekly-plan / recovery / refresh / indicators / runtime`는 다시 열지 않았다.

## 다음 라운드 우선순위
1. `news write/settings surface`
