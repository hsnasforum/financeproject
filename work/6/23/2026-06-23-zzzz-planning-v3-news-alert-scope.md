# 2026-06-23 Planning v3 뉴스 alert 사용자 event/trend 경계 고정

## 변경 파일
- `docs/news-refresh.md`
- `src/lib/news/alerts.ts`
- `tests/news-alerts.test.ts`
- `tests/planning-v3-news-user-scope.test.ts`
- `work/6/23/2026-06-23-zzzz-planning-v3-news-alert-scope.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 라운드에 붙일 skill 조합을 선정.
- `planning-gate-selector`: API/저장소 경계 변경에 맞는 검증 세트를 선정.
- `work-log-closeout`: 종료 기록의 필수 섹션과 검증 사실을 정리.
- `gpt-5.3-codex-spark` + `xhigh`: AGENTS.md 조건부 지침에 따라 Planning v3 news alerts/trends/today 경계를 병렬 조사.

## 변경 이유
- 직전 라운드에서 `search`의 trend cache 경계는 사용자별로 고정했지만, alert 평가 입력은 legacy `.data/news/topic_trends.latest.json`을 읽고 alert event feed는 `.data/alerts/events.jsonl`을 공유하는 잔여 리스크가 있었습니다.
- `PLANNING_NAMESPACE_ENABLED=1`인 Planning v3 news API는 현재 route user 기준 저장소만 읽고 써야 하므로, alert trend 입력과 event feed를 사용자별 namespace로 고정했습니다.

## 핵심 변경
- `resolveAlertsDataDir()`가 namespace 활성 시 `.data/planning/users/{userId}/news/alerts`를 반환하도록 바꾸고, legacy state/rules 경로는 별도 legacy dir로 분리했습니다.
- alert 평가가 namespace 활성 시 현재 사용자의 `planning-v3/news/cache/trends.30d.latest.json` 또는 `trends.7d.latest.json`을 읽고, namespace 비활성 시에만 legacy topic trends를 읽게 했습니다.
- alert event feed가 사용자별 `events.jsonl`에 저장되고 Alice/Bob API 조회에서 서로 보이지 않도록 회귀 테스트를 갱신했습니다.
- `docs/news-refresh.md`에 alerts event/state/rule override의 사용자별 namespace 계약을 추가했습니다.

## 검증
- `corepack pnpm test tests/news-alerts.test.ts tests/planning-v3-news-user-scope.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-api.test.ts`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm planning:user-scope:check`
- `corepack pnpm planning:auth:check`
- `corepack pnpm sec:check`
- `git diff --check`
- `corepack pnpm test`
- `corepack pnpm build`

## 남은 리스크
- namespace 비활성 상태는 의도적으로 legacy `.data/news/topic_trends.latest.json`과 `.data/alerts/events.jsonl` 경로를 유지합니다.
- UI/셀렉터 변경은 없어 `pnpm e2e:rc`는 실행하지 않았습니다.
- alert event feed를 사용자별로 바꿨으므로, 기존 global alert event를 namespace 사용자별로 이전해야 할 필요가 생기면 별도 migration/compat PR에서 다뤄야 합니다.

## 다음 라운드 우선순위
1. Planning v3 news `today/trends/recovery/refresh` 생산 경로가 사용자별 cache 계약과 계속 일치하는지 추가 확인합니다.
2. PostgreSQL schema contract와 SQLite export/dry-run checksum 게이트를 이어서 확장합니다.
3. 브라우저 storage 44개 파일을 영구 설정, draft, dev/ops unlock, legacy fallback으로 분류합니다.
