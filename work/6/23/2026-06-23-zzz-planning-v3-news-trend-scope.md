# 2026-06-23 Planning v3 뉴스 search trend 사용자 cache 고정

## 변경 파일
- `docs/news-refresh.md`
- `src/app/api/planning/v3/news/search/route.ts`
- `src/lib/planning/v3/news/search.ts`
- `tests/planning-v3-news-api.test.ts`
- `tests/planning-v3-news-user-scope.test.ts`
- `work/6/23/2026-06-23-zzz-planning-v3-news-trend-scope.md`

## 사용 skill
- `finance-skill-routing`: 이번 구현 라운드의 기본 skill 조합 선정.
- `planning-gate-selector`: API route, read-model helper, docs 변경에 맞는 검증 세트 선정.
- `work-log-closeout`: 종료 기록 섹션과 검증 사실 정리.
- `gpt-5.3-codex-spark` + `xhigh`: AGENTS.md 조건부 지침에 따라 Planning v3 news trend cache 경계를 병렬 정적 조사.

## 변경 이유
- 직전 라운드에서 `items/search` read-model은 사용자별 store/index로 고정했지만, search route의 burst 필터 보조 데이터는 legacy `readNewsTopicTrends()` 경로를 직접 읽는 잔여 리스크가 있었습니다.
- `PLANNING_NAMESPACE_ENABLED=1`인 Planning v3 API 경로에서는 현재 route user 기준 trend cache를 우선해야 하므로, search route가 current-user trend boundary helper만 사용하도록 고정했습니다.

## 핵심 변경
- `readCurrentUserNewsTopicBurstMap()`을 추가해 namespace 활성 시 현재 사용자의 `cache/trends.30d.latest.json` 또는 `trends.7d.latest.json`을 읽습니다.
- namespace 비활성 상태에서는 기존 legacy `.data/news/topic_trends.latest.json` 경로를 유지해 호환성을 보존했습니다.
- search route 정적 경계 테스트와 Alice/Bob user-scope 회귀 테스트를 강화해 legacy global trend와 사용자별 trend cache가 충돌할 때 사용자별 cache가 적용되는지 검증합니다.
- `docs/news-refresh.md`에 Planning v3 search가 사용자별 search index와 trend cache를 읽는다는 namespace 계약을 반영했습니다.

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
- `src/lib/news/alerts.ts`는 legacy alert 생성 경로에서 아직 `readNewsTopicTrends(resolveNewsTrendsJsonPath(cwd))`를 사용합니다. 현재 PR 범위의 route-user search 경계 밖이지만, alerts route를 사용자별 trend cache와 연결할 때 별도 확인이 필요합니다.
- namespace 비활성 상태는 의도적으로 legacy global trend artifact를 계속 사용합니다.
- UI/셀렉터 변경은 없어 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
1. Planning v3 news alerts/trends/today 경로의 trend cache 경계가 사용자별 계약과 충돌하지 않는지 확인합니다.
2. PostgreSQL schema contract와 SQLite export/dry-run checksum 게이트를 이어서 확장합니다.
3. 브라우저 storage 44개 파일을 영구 설정, draft, dev/ops unlock, legacy fallback으로 분류합니다.
