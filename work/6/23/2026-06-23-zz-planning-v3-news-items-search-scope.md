# 2026-06-23 Planning v3 뉴스 items/search 사용자 read-model 고정

## 변경 파일
- `docs/news-refresh.md`
- `src/app/api/planning/v3/news/search/route.ts`
- `src/lib/planning/v3/news/search.ts`
- `src/lib/planning/v3/service/newsItemsRepository.ts`
- `tests/planning-v3-news-user-scope.test.ts`
- `work/6/23/2026-06-23-zz-planning-v3-news-items-search-scope.md`

## 사용 skill
- `finance-skill-routing`: 이번 구현 라운드의 기본 skill 조합 선정.
- `planning-gate-selector`: API route/repository/docs 변경에 맞는 검증 세트 선정.
- `work-log-closeout`: 종료 기록 섹션과 검증 사실 정리.
- `gpt-5.3-codex-spark` + `xhigh`: AGENTS.md 조건부 지침에 따라 route helper 현황과 다음 PR 후보를 병렬 조사.

## 변경 이유
- `withCurrentPlanningUser` 직접 사용 route 5개 표준화 후보는 현재 route 기준으로 0건임을 확인했고, 최신 잔여 리스크는 Planning v3 news `items/search`의 legacy 공유 read-model fallback이었습니다.
- namespace 활성 상태에서 현재 route user가 아닌 legacy `.data/news/news.sqlite` 또는 `.data/news/index.json` 항목이 노출되지 않도록 사용자별 v3 store/index 경계를 고정했습니다.

## 핵심 변경
- `items` repository가 `PLANNING_NAMESPACE_ENABLED=1`일 때 현재 사용자의 v3 JSON item store를 읽고, namespace 비활성일 때만 기존 SQLite path를 유지합니다.
- `search` route가 current-user search index adapter를 사용하고, namespace 활성 시 사용자별 `cache/search-index.latest.json`을 읽거나 재생성합니다.
- Alice/Bob 테스트가 legacy global DB/index와 사용자별 v3 store를 동시에 배치해 전역 read-model 누수를 막는지 검증합니다.
- `docs/news-refresh.md`에 legacy refresh 산출물과 Planning v3 namespace API 산출물 경계를 기록했습니다.

## 검증
- `corepack pnpm test tests/planning-v3-news-user-scope.test.ts tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-api.test.ts`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm planning:user-scope:check`
- `corepack pnpm planning:auth:check`
- `corepack pnpm sec:check`
- `corepack pnpm planning:ssot:check`
- `git diff --check`
- `corepack pnpm test`
- `corepack pnpm build`

## 남은 리스크
- `readNewsTopicTrends()`는 search route의 burst 표시 보조 데이터로 아직 legacy trend artifact를 읽습니다. 사용자별 trend cache adapter로 완전히 통일할 수 있는지는 별도 PR에서 확인해야 합니다.
- UI/셀렉터 변경은 없어 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
1. Planning v3 news trend/read-model 보조 데이터가 사용자별 cache로 완전히 통일되는지 확인합니다.
2. PostgreSQL schema contract와 SQLite export/dry-run checksum 게이트를 이어서 확장합니다.
3. 브라우저 storage 44개 파일을 영구 설정, draft, dev/ops unlock, legacy fallback으로 분류합니다.
