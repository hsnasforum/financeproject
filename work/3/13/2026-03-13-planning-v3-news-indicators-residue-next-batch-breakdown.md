# 2026-03-13 planning-v3 news-indicators residue next-batch breakdown

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-news-indicators-residue-next-batch-breakdown.md`

## 사용 skill
- `planning-gate-selector`: 후보 배치별 최소 검증 세트를 좁게 분리하는 데 사용.
- `work-log-closeout`: 이번 residue 분해 결과와 다음 라운드 우선순위를 `/work` 형식으로 정리하는 데 사용.

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 남아 있는 `news / indicators / alerts` cluster가 어긋나므로, 이번 라운드는 구현이 아니라 residue 분해와 다음 1축 추천만 수행했다.

## 변경 이유
- runtime 축은 직전 `runtime release-verify test-collection blocker isolation`에서 `pnpm release:verify`까지 PASS로 닫혔다.
- 현재 planning-v3 residue 중 가장 큰 coherent cluster는 `alerts / indicators / news / news routes / news pages / news-indicators tests`다.
- 하지만 실제 dirty는 한 흐름이 아니라
  - news read-only surface
  - news write/settings surface
  - 이미 닫힌 refresh/recovery/internal root-contract tail
  - indicators connector/store/specOverrides
  로 섞여 있다.
- 이번 라운드는 구현보다 “다음 실제 구현 배치 1개만 뽑을 수 있게 다시 분해”하는 편이 안전하다.

## 현재 news/indicators residue 현황
- `git diff --stat` 기준
  - 57 files changed
  - 3027 insertions / 1120 deletions
- `git status --short` 기준 경로별 개수
  - `alerts`: 2
  - `indicators`: 11
  - `news_internal`: 15
  - `news_api`: 16
  - `indicators_api`: 1
  - `news_ui`: 9
  - `tests`: 12
  - `untracked`: 10
- 해석
  - 현재 dirty는 `news user-facing`, `news write/settings`, `news internal root/default`, `indicators connector/store`가 한 bucket에 같이 남아 있다.
  - 특히 `planning/v3/news/recovery.ts`, `planning/v3/news/cli/newsRefresh.ts`, `planning/v3/news/rootDir.ts`, `src/app/api/planning/v3/news/digest|refresh|recovery/route.ts`는 아직 dirty로 보이지만, 최근 closeout 기준으로는 이미 별도 배치에서 계약을 설명하고 PASS까지 확인한 축이다.

## 다시 나눈 후보 배치들

### 후보 1. indicators connector harness hardening
- 변경 이유
  - `planning/v3/indicators/connectors/ecos.ts`, `kosis.ts`, `fixture.ts`의 실제 코드 변경은 `void options` 같은 아주 얕은 내부 정리다.
  - 대응 test 변경도 `ecos.test.ts`, `fred.test.ts`, `kosis.test.ts`에서 `NODE_ENV: "test"`를 명시해 connector test harness를 고정하는 수준이다.
- 사용자 영향 여부
  - internal-only
- 최소 검증 세트
  - `pnpm exec vitest run planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.test.ts`
  - `pnpm exec eslint planning/v3/indicators/connectors/ecos.ts planning/v3/indicators/connectors/fixture.ts planning/v3/indicators/connectors/kosis.ts planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.test.ts`
- 다른 축과 섞이면 위험한 이유
  - `specOverrides/store`나 `news` surface와 섞으면 connector 자체 문제인지 env-aware root/API 문제인지 바로 분리되지 않는다.
  - 외부 fetch/connector 재시도 계약과 user-facing settings/read surface가 서로 다른 실패 모드를 만든다.

### 후보 2. indicators store/specOverrides import contract
- 변경 이유
  - `planning/v3/indicators/rootDir.ts`, `store/index.ts`, `store/store.test.ts`, `specOverrides.ts`, `specOverrides.test.ts`, `src/app/api/planning/v3/indicators/specs/route.ts`, `tests/planning-v3-indicators-specs-import-api.test.ts`는 하나의 “env-aware default root + specs import route” 계약으로 묶인다.
  - 이 축은 connector fetch보다 persistence/API contract 성격이 강하다.
- 사용자 영향 여부
  - low, operator/internal settings surface
- 최소 검증 세트
  - `pnpm exec vitest run planning/v3/indicators/store/store.test.ts planning/v3/indicators/specOverrides.test.ts tests/planning-v3-indicators-specs-import-api.test.ts`
  - `pnpm exec eslint planning/v3/indicators/rootDir.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts src/app/api/planning/v3/indicators/specs/route.ts tests/planning-v3-indicators-specs-import-api.test.ts`
  - route를 실제 수정하면 `pnpm build`
- 다른 축과 섞이면 위험한 이유
  - connector fetch retry/env 문제와 합치면 “series import/persistence root” 문제를 흐린다.
  - news settings/read surface와 합치면 same-origin, rootDir, user copy가 한꺼번에 얽힌다.

### 후보 3. news read-only user-facing surfaces
- 변경 이유
  - `NewsDigestClient`, `NewsExploreClient`, `NewsTodayClient`, `NewsTrendsClient`, `NewsTrendsTableClient`, `today|trends|search|items|scenarios` read routes, `tests/planning-v3-news-api.test.ts`, `tests/planning-v3-news-search-api.test.ts`는 read-only news experience를 이루는 묶음이다.
  - `planning/v3/news/scenario.test.ts`, `scenario/qualityGates.test.ts`, `select/score.ts`, `llmAdapter.test.ts`도 digest/scenario read path의 test-hygiene tail로 붙어 있다.
- 사용자 영향 여부
  - user-facing
- 최소 검증 세트
  - `pnpm exec vitest run tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts planning/v3/news/scenario.test.ts planning/v3/news/scenario/qualityGates.test.ts planning/v3/news/llmAdapter.test.ts`
  - `pnpm exec eslint src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsTrendsClient.tsx src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx src/app/api/planning/v3/news/items/route.ts src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/today/route.ts src/app/api/planning/v3/news/trends/route.ts src/app/api/planning/v3/news/scenarios/route.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts`
  - `pnpm build`
- 다른 축과 섞이면 위험한 이유
  - settings/alerts/notes write surface와 섞이면 read payload, same-origin read guard, CTA/copy 회귀 원인을 분리하기 어렵다.
  - internal refresh/root contract와 섞이면 “cache/root 문제”가 user-facing render 회귀처럼 보일 수 있다.

### 후보 4. news settings/alerts/notes/weekly-plan write surfaces
- 변경 이유
  - `planning/v3/alerts/store.ts`, `planning/v3/news/settings.ts`, `notes.ts`, `weeklyPlan.ts`, 관련 routes, `NewsAlertsClient`, `NewsSettingsClient`, `news-alerts-api`, `news-alert-rules-api`, `news-notes-api`, `news-weekly-plan-api`, `news-settings-ui`는 write/settings surface로 묶인다.
  - 다만 이 묶음 안에서도 `alerts/settings`와 `notes/weekly-plan`이 성격이 다르므로 실제 구현 시 가장 넓은 후보다.
- 사용자 영향 여부
  - user-facing
- 최소 검증 세트
  - `pnpm exec vitest run tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-remote-host-api.test.ts`
  - `pnpm exec eslint planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/alerts/rootDir.ts planning/v3/news/settings.ts planning/v3/news/settings.test.ts planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts src/app/api/planning/v3/news/alerts/route.ts src/app/api/planning/v3/news/alerts/rules/route.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/settings/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-settings-remote-host-api.test.ts`
  - `pnpm build`
- 다른 축과 섞이면 위험한 이유
  - alert rules, settings 저장, notes CRUD, weekly-plan 저장이 한 번에 섞여 write regression 원인이 퍼진다.
  - read-only digest/explore surface나 indicators import와 합치면 same-origin/CSRF 문제와 UI tone 문제가 한 bucket으로 뭉친다.

## 추천 다음 구현 배치 1개
- 추천: `indicators connector harness hardening`
- 추천 이유
  - 현재 residue 중 가장 작은 internal-only 축이다.
  - route/UI/rootDir/store를 건드리지 않고 connector test harness와 tiny implementation tail만 닫을 수 있다.
  - 검증 세트가 connector tests + eslint로 가장 좁다.
  - 실패해도 rollback이 쉽고, 다음 배치에서 `specOverrides/store`나 `news` surface를 더 흔들지 않는다.
- 추천하지 않은 이유
  - `indicators store/specOverrides import contract`: coherent하지만 route/API와 env-aware persistence가 같이 붙어 있어 다음 2순위가 더 맞다.
  - `news read-only user-facing surfaces`: 사용자 영향은 명확하지만 범위가 넓고 build까지 필요하다.
  - `news settings/alerts/notes/weekly-plan write surfaces`: 현재 residue 중 가장 넓고, write regression 원인 분리가 가장 어렵다.

## 권장 검증 세트
- 추천 배치(`indicators connector harness hardening`) 기준
  - `pnpm exec vitest run planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.test.ts`
  - `pnpm exec eslint planning/v3/indicators/connectors/ecos.ts planning/v3/indicators/connectors/fixture.ts planning/v3/indicators/connectors/kosis.ts planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.test.ts`
- 이번 residue breakdown 라운드에서 실제 실행한 검증
  - 정적 스캔만 수행
  - `git diff --check -- work/3/13/2026-03-13-planning-v3-news-indicators-residue-next-batch-breakdown.md`

## 명시적 제외 범위
- 이미 닫힌 축으로 재오픈하지 않음
  - `planning/v3/news/cli/newsRefresh.ts`
  - `planning/v3/news/recovery.ts`
  - `planning/v3/news/rootDir.ts`
  - `planning/v3/news/store/index.ts`
  - `src/app/api/planning/v3/news/digest/route.ts`
  - `src/app/api/planning/v3/news/recovery/route.ts`
  - `src/app/api/planning/v3/news/refresh/route.ts`
  - `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`
  - `tests/planning-v3-news-digest-indicator-root.test.ts`
- 이번 라운드 범위 밖
  - quickstart/home 전체
  - planning-v2/reports-ui 전체
  - runtime scripts/docs 전체
  - draft/profile/import/csv/txn-overrides/balances/accounts 전체
  - code modification
  - `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm release:verify`

## 검증
- 기준선 확인
  - `sed -n '1,240p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-runtime-release-verify-test-collection-blocker-isolation.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-shared-bodytone-surface-cleanup.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-news-route-same-origin-contract-followup.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-news-refresh-root-contract-followup.md`
- 상태 잠금 / 정적 스캔
  - `git status --short -- planning/v3/alerts planning/v3/indicators planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news tests/planning-v3-news-*.test.ts tests/planning-v3-news-*.test.tsx tests/planning-v3-indicators-*.test.ts tests/planning-v3-indicators-*.test.tsx`
  - `git diff --name-only -- planning/v3/alerts planning/v3/indicators planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news tests/planning-v3-news-*.test.ts tests/planning-v3-news-*.test.tsx tests/planning-v3-indicators-*.test.ts tests/planning-v3-indicators-*.test.tsx`
  - `git diff --stat -- planning/v3/alerts planning/v3/indicators planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news src/app/api/planning/v3/indicators tests/planning-v3-news-*.test.ts tests/planning-v3-news-*.test.tsx tests/planning-v3-indicators-*.test.ts tests/planning-v3-indicators-*.test.tsx`
  - `git diff --unified=40 -- ...`로 alerts/settings/write, refresh/recovery/internal, read-only news surface, indicators store/connectors 묶음을 각각 확인
  - `rg -n "resolveAlertsRootDir|resolveIndicatorsRootDir|resolveNewsRootDir|assertSameOrigin|requireCsrf|BodyActionLink|loadEffectiveSeriesSpecs|runNewsRefresh|previewRecoveryAction|runRecoveryAction" planning/v3/alerts planning/v3/indicators planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news tests/planning-v3-news-* tests/planning-v3-indicators-*`
- diff check
  - `git diff --check -- work/3/13/2026-03-13-planning-v3-news-indicators-residue-next-batch-breakdown.md`

## 남은 리스크
- `news settings/alerts/notes/weekly-plan` 후보는 여전히 넓다. 실제 구현에 들어가면 `alerts/settings`와 `notes/weekly-plan`을 다시 한 번 더 자를 가능성이 있다.
- `news read-only` 후보는 user-facing 영향이 크지만 direct UI coverage가 `settings/alerts`보다 약해서, 구현 시 build와 route/API test가 사실상 최소 방어선이 된다.
- 현재 dirty에는 이미 닫힌 `refresh/recovery/internal` tail도 계속 보인다. 다음 라운드에서도 이전 closeout을 기준으로 재오픈 여부를 엄격히 잠가야 한다.

## 다음 라운드 우선순위
1. `indicators connector harness hardening`
2. `indicators store/specOverrides import contract`
3. `news read-only user-facing surfaces`
4. `news settings/alerts/notes/weekly-plan write surfaces`
