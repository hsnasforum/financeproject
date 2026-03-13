# 2026-03-13 planning-v3 rootdir-default alignment

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-rootdir-default-alignment.md`

## 사용 skill
- `planning-gate-selector`: internal persistence/rootDir 축에 맞춰 `vitest + eslint + diff check`만 실행하도록 검증 범위를 잠그는 데 사용
- `work-log-closeout`: audit 결과, 조건부 검증 포함 여부, 실행/미실행 검증을 `/work` 형식으로 남기는 데 사용

## 변경 이유
- 직전 `golden-pipeline qa-hardening` note가 `csv-parse / drafts-upload-flow`를 그대로 열지 말고 더 작은 내부 축이 있으면 먼저 닫으라고 남겼다.
- 현재 전체 스캔 기준으로 `planning/v3/alerts/rootDir.ts`, `planning/v3/indicators/rootDir.ts`, `planning/v3/news/rootDir.ts`와 직접 caller 모듈 묶음이 `csv/drafts`보다 더 작은 internal persistence 축이었다.
- 반면 `csv-parse`와 `drafts-upload-flow`는 `import/csv + legacy drafts + draft preview/save/list` 사용자 흐름을 다시 열 가능성이 커서 이번 라운드에서 제외했다.
- 현재 브랜치 `pr37-planning-v3-txn-overrides`는 이번 internal rootDir 축과 어긋나므로, 이번 라운드도 default root 정책 점검과 검증만 수행하고 wrapper/store-helper나 user-facing 범위로 번지지 않게 제한했다.

## 핵심 변경
- 이번 라운드에서 추가 코드 수정은 하지 않았다. 현재 dirty 상태의 helper/caller 조합을 audit한 결과, default root 정책은 이미 helper 기준으로 정렬된 상태였다.
- `planning/v3/alerts/rootDir.ts`, `planning/v3/indicators/rootDir.ts`, `planning/v3/news/rootDir.ts`는 모두 `src/lib/planning/storage/dataDir.ts`의 `resolveDataDir()`를 통해 `PLANNING_DATA_DIR`와 runtime dataDir 정책을 공유하고, 최종적으로 각각 `alerts`, `indicators`, `news` 하위 디렉터리를 붙인다.
- `planning/v3/alerts/store.ts`, `planning/v3/indicators/store/index.ts`, `planning/v3/indicators/specOverrides.ts`, `planning/v3/news/store/index.ts`, `planning/v3/news/settings.ts`, `planning/v3/news/notes.ts`, `planning/v3/news/recovery.ts`, `planning/v3/news/weeklyPlan.ts`는 default root를 helper로 계산하고, explicit `rootDir` 인자가 있으면 항상 그 값을 우선하는 형태로 정리돼 있었다.
- hard-coded `process.cwd() + ".data/..."` default는 포함 범위 안에서 `rootDir` helper로 치환돼 있었고, 저장 파일명/디렉터리 구조는 그대로 유지됐다.
- `notes`, `weeklyPlan`, `recovery`는 caller contract 확인이 필요해 조건부 API 테스트까지 실행했지만, `planning/v3/news/cli/newsRefresh.ts`는 현재 diff가 `isMain` guard 정리여서 rootDir default alignment 설명에 필요하지 않아 제외했다.

## helper / default root 정책 정리
- alerts
  - helper: `resolveAlertsRootDir()` -> `resolveDataDir({ cwd }) + "/alerts"`
  - caller: `store.ts`
  - default 정책: `defaultRootDir()`를 통해 helper 결과를 사용
  - override 정책: `input.rootDir ?? defaultRootDir()` 또는 `rootDir = defaultRootDir()`로 explicit override 우선 유지
- indicators
  - helper: `resolveIndicatorsRootDir()` -> `resolveDataDir({ cwd }) + "/indicators"`
  - caller: `store/index.ts`, `specOverrides.ts`
  - default 정책: `defaultRootDir()`를 통해 helper 결과를 사용
  - override 정책: 모든 path/read/write 함수가 explicit `rootDir` 인자를 받으면 그 값을 그대로 사용
- news
  - helper: `resolveNewsRootDir()` -> `resolveDataDir({ cwd }) + "/news"`
  - caller: `store/index.ts`, `settings.ts`, `notes.ts`, `recovery.ts`, `weeklyPlan.ts`
  - default 정책: `resolveNewsRootDir()` 또는 `rootDir ?? resolveNewsRootDir()`로 통일
  - override 정책: `rootDir`가 주어지면 그대로 쓰고, recovery preview/apply의 write target 계산도 동일한 base root를 사용

## explicit rootDir override 유지 여부
- 유지된다.
- alerts: `appendAlertEvents`, `readAlertEvents`, `readRecentAlertEvents`는 explicit `rootDir`가 있으면 helper 기본값을 덮지 않는다.
- indicators: `store/index.ts`와 `specOverrides.ts`의 path/read/write/import 함수는 explicit `rootDir` 우선 규칙을 유지한다.
- news: `store/index.ts`, `settings.ts`, `notes.ts`, `recovery.ts`, `weeklyPlan.ts` 모두 explicit `rootDir` 인자가 있으면 helper 기본값 대신 그대로 사용한다.
- 저장 레이아웃은 그대로다.
  - alerts: `alerts/events.jsonl`
  - indicators: `indicators/state.json`, `indicators/series/*.jsonl`, `indicators/meta/*.json`, `indicators/specOverrides.json`
  - news: `news/items`, `news/state.json`, `news/daily`, `news/cache`, `news/settings.json`, `news/notes`, `news/weekly_plan.json`

## 검증
- 기준선 확인
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-golden-pipeline-qa-hardening.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-ops-migrate-hardening.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-balances-read-wrapper-alignment.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-store-helper-next-batch-breakdown.md`
- 상태 잠금
  - `git status --short -- planning/v3/alerts/rootDir.ts planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/indicators/rootDir.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/news/rootDir.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts planning/v3/news/settings.ts planning/v3/news/settings.test.ts planning/v3/news/notes.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/weeklyPlan.ts planning/v3/news/weeklyPlan.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts planning/v3/news/cli/newsRefresh.ts`
- audit
  - `rg -n "process\\.cwd\\(|rootDir|resolve.*root|\\.data/(alerts|indicators|news)|join\\(.*\\.data" planning/v3/alerts planning/v3/indicators planning/v3/news`
  - `git diff -- planning/v3/alerts/rootDir.ts planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/indicators/rootDir.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/news/rootDir.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts planning/v3/news/settings.ts planning/v3/news/settings.test.ts planning/v3/news/notes.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/weeklyPlan.ts planning/v3/news/weeklyPlan.test.ts`
  - `sed -n '1,220p' planning/v3/alerts/rootDir.ts`
  - `sed -n '1,240p' planning/v3/alerts/store.ts`
  - `sed -n '1,220p' planning/v3/alerts/store.test.ts`
  - `sed -n '1,220p' planning/v3/indicators/rootDir.ts`
  - `sed -n '1,280p' planning/v3/indicators/store/index.ts`
  - `sed -n '1,240p' planning/v3/indicators/store/store.test.ts`
  - `sed -n '1,260p' planning/v3/indicators/specOverrides.ts`
  - `sed -n '1,240p' planning/v3/indicators/specOverrides.test.ts`
  - `sed -n '1,220p' planning/v3/news/rootDir.ts`
  - `sed -n '1,320p' planning/v3/news/store/index.ts`
  - `sed -n '1,260p' planning/v3/news/store/store.test.ts`
  - `sed -n '1,260p' planning/v3/news/settings.ts`
  - `sed -n '1,240p' planning/v3/news/settings.test.ts`
  - `sed -n '1,260p' planning/v3/news/notes.ts`
  - `sed -n '1,260p' planning/v3/news/recovery.ts`
  - `sed -n '1,240p' planning/v3/news/recovery.test.ts`
  - `sed -n '1,260p' planning/v3/news/weeklyPlan.ts`
  - `sed -n '1,240p' planning/v3/news/weeklyPlan.test.ts`
  - `git diff -- tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts planning/v3/news/cli/newsRefresh.ts`
  - `sed -n '1,200p' src/lib/planning/storage/dataDir.ts`
- 테스트
  - `pnpm exec vitest run planning/v3/alerts/store.test.ts planning/v3/indicators/store/store.test.ts planning/v3/indicators/specOverrides.test.ts planning/v3/news/store/store.test.ts planning/v3/news/settings.test.ts planning/v3/news/recovery.test.ts planning/v3/news/weeklyPlan.test.ts`
  - PASS (`7 files`, `22 tests`)
- 조건부 테스트
  - `pnpm exec vitest run tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`
  - PASS (`3 files`, `7 tests`)
  - 포함 이유: `notes.ts`, `weeklyPlan.ts`, `recovery.ts`는 default root가 API caller 기본 경로에도 직접 영향을 줄 수 있어 좁게 추가 확인했다.
- lint
  - `pnpm exec eslint planning/v3/alerts/rootDir.ts planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/indicators/rootDir.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/news/rootDir.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts planning/v3/news/settings.ts planning/v3/news/settings.test.ts planning/v3/news/notes.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/weeklyPlan.ts planning/v3/news/weeklyPlan.test.ts`
  - PASS

## 미실행 검증
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`
- `planning/v3/news/cli/newsRefresh.ts`
  - rootDir default alignment 설명에 필요하지 않아 검증 범위에 포함하지 않았다.

## 남은 리스크
- 현재 helper 3개와 직접 caller 모듈은 default root 정책이 일관되지만, `notes`는 별도 단위 테스트 파일이 없어 API caller 검증으로만 확인했다.
- `planning/v3/news/cli/newsRefresh.ts`와 조건부 API test 파일들에는 rootDir 외 다른 dirty 변경도 같이 남아 있어, 다음 라운드에서 이들을 열 때는 rootDir alignment 결과와 섞지 않게 다시 경계를 잠가야 한다.
- `csv-parse`와 `drafts-upload-flow`는 여전히 더 넓은 user-facing/import 흐름이므로 이번 internal rootDir 배치와 분리 유지가 필요하다.

## 다음 라운드 우선순위
1. `csv-parse`와 `drafts-upload-flow`는 그대로 바로 구현하지 말고, user-facing/import 범위를 다시 1축씩 분해한 뒤 연다.
2. 이번 `rootdir-default alignment` 범위는 재오픈하지 않는다.
3. `newsRefresh` CLI나 조건부 API test의 다른 dirty 변경은 rootDir default 정책과 섞지 않고 별도 축으로 다룬다.
