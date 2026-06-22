# Data Freshness Strict Refresh Evidence

## 변경 전 정리
- 수정 대상 파일: `package.json`, `scripts/news_refresh.mjs`, `scripts/indicators_refresh.mjs`, `scripts/finlife_sync.mjs`, `scripts/finlife_sync_if_stale.mjs`, `tests/daily-refresh-ops-contract.test.ts`, `.data/*_snapshot.json`, `docs/data-freshness-report.md`, `docs/dart-*`.
- 변경 이유: `daily:refresh:strict`가 news/indicators `.mjs` TypeScript loader 문제와 FinLife timeout으로 중단됐고, freshness snapshot 8개가 stale 상태였다.
- 실행할 검증 명령: `daily:refresh:strict`, source별 refresh/sync, freshness strict report, `sec:check`, `lint`, `typecheck`, `test`, `build`.

## 사용 skill
- `finance-skill-routing`: Finance Project 라운드에 필요한 skill 범위 확인.
- `planning-gate-selector`: refresh script, ops data, docs 변경에 맞는 검증 게이트 선정.
- `dart-data-source-hardening`: DART/public data freshness, fallback, live evidence 변경 기준 확인.
- `work-log-closeout`: `/work` 종료 기록 형식과 잔여 리스크 기록.

## 사용 에이전트
- `manager`: Auth/User Scope 직접 helper 후보와 다음 라운드 분해 확인.
- `gpt-5.3-codex-spark`: `src/app/api` 내 `withCurrentPlanningUser` 직접 사용 여부 재검증.

## 이번 라운드 완료 항목
1. `news:refresh`, `indicators:refresh`를 `node --import tsx` loader 경로로 전환해 `.mjs` wrapper에서 TypeScript module import가 깨지지 않게 했다.
2. FinLife if-stale refresh가 deposit/saving만 보던 범위를 `SUPPORTED_FINLIFE_KINDS` 전체로 확장했다.
3. benefits, exchange, FinLife 6종 snapshot을 live refresh/sync로 갱신했고 `docs/data-freshness-report.md`를 strict 모드 fresh=8/stale=0으로 갱신했다.
4. DART daily brief, disclosure alerts, disclosure digest를 strict daily refresh evidence에 맞춰 갱신했다.
5. daily refresh ops contract test에 wrapper loader와 FinLife kind coverage 회귀 테스트를 추가했다.

## 검증 결과
- PASS `corepack pnpm daily:refresh:strict`: 수정 후 9단계 ok, failed=0, strict=Y.
- PASS `corepack pnpm news:refresh`: feeds=7, fetchedItems=309, inserted=242.
- PASS `corepack pnpm indicators:refresh`: sources=1, series=3, errors=0.
- PASS `corepack pnpm finlife:sync:if-stale`: 6개 supported kind 모두 fresh skip.
- PASS `corepack pnpm finlife:sync -- --kind=credit-loan`
- PASS `corepack pnpm finlife:sync -- --kind=mortgage-loan`
- PASS `corepack pnpm finlife:sync -- --kind=pension`
- PASS `corepack pnpm finlife:sync -- --kind=rent-house-loan`
- PASS `node scripts/data_freshness_report.mjs --strict`: total=8, fresh=8, stale=0.
- PASS `node scripts/dart_rules_quality_gate.mjs`
- PASS `corepack pnpm sec:check`
- PASS `corepack pnpm multi-agent:guard`
- PASS `corepack pnpm typecheck`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm test`: 720 files, 2317 tests.
- PASS `corepack pnpm build`
- PASS `git diff --check`
- FAIL `[범위 밖] corepack pnpm verify`: `schema_drift_report.mjs`가 기존 breaking schema drift 1건을 감지해 중단했다. 이번 변경 범위가 아니므로 생성된 `docs/schema-drift-report.md`는 되돌렸다.
- FAIL `[외부 일시성] corepack pnpm finlife:sync`: 전체 kind 일괄 sync는 FinLife upstream timeout으로 실패했다. stale kind별 개별 sync는 모두 통과했다.

## 남은 리스크와 엣지케이스
- FinLife upstream timeout은 재발할 수 있다. 이번 라운드는 if-stale 범위를 전체 kind로 넓히고, stale kind별 재시도로 snapshot freshness를 회복했다.
- live snapshot의 freshness는 TTL 경과 후 다시 stale이 될 수 있다. `daily:refresh:strict` 또는 source별 sync로 주기 갱신해야 한다.
- `pnpm verify`의 schema drift 실패는 별도 PostgreSQL migration readiness 라운드에서 다뤄야 한다.

## 다음 라운드 우선순위
1. Auth/User Scope 쪽은 직접 `withCurrentPlanningUser` route 사용이 0건이므로 coverage blind spot 또는 routeAuth 계약 문서화 쪽으로 이동한다.
2. PostgreSQL migration readiness에서 schema drift gate의 expected/known drift 처리 기준을 분리한다.
3. Ops refresh는 timeout/retry/cooldown 관측을 operator log와 UI freshness 상태에 더 명확히 연결한다.
