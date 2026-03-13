# 2026-03-13 planning-v3 news-refresh root-contract follow-up

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-news-refresh-root-contract-followup.md`

## 사용 skill
- `planning-gate-selector`: internal CLI/test/API contract 축에 맞춰 `vitest + eslint + diff check`만 실행하도록 검증 범위를 잠그는 데 사용
- `work-log-closeout`: audit 결과, route source 포함 여부, 실행/미실행 검증을 `/work` 형식으로 남기는 데 사용

## 변경 이유
- 직전 `rootdir-default alignment` note가 `csv-parse / drafts-upload-flow`는 더 넓은 user-facing/import 흐름이라 그대로 열지 말고 다시 분해하라고 남겼다.
- 현재 남은 dirty 중 `planning/v3/news/cli/newsRefresh.ts`, `planning/v3/news/recovery.ts`, `planning/v3/news/recovery.test.ts`, `planning/v3/news/digest.test.ts`, `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`, `tests/planning-v3-news-digest-indicator-root.test.ts`는 `newsRefresh import-safe guard + recovery/digest env-aware root contract + remote-host same-origin contract`로 묶이는 더 작은 내부 축이다.
- 반면 `csv-parse`와 `drafts-upload-flow`는 `import/csv + drafts + draft preview/save/list` 흐름을 다시 크게 열 가능성이 커서 이번 라운드에서 제외했다.
- 현재 브랜치 `pr37-planning-v3-txn-overrides`는 이번 news internal contract 축과 어긋나므로, 이번 라운드도 current dirty subset의 계약 점검과 검증만 수행하고 csv/drafts나 user-facing 범위로 번지지 않게 제한했다.

## 핵심 변경
- 이번 라운드에서 추가 코드 수정은 하지 않았다. 현재 dirty subset을 audit한 결과, import-safe main guard / env-aware root / remote-host contract은 이미 서로 맞물리는 상태였다.
- `planning/v3/news/cli/newsRefresh.ts`
  - 현재 dirty는 `main()` 자동 실행을 제거하고 `isMain` guard를 둬 import 시 side effect가 없도록 만드는 정리다.
  - `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`가 이 경계를 전제로 `runNewsRefresh`만 mock 하며 route를 import해도 자동 실행되지 않는 상태를 검증한다.
- `planning/v3/news/recovery.ts`
  - `previewRecoveryAction`과 `runRecoveryAction`의 default base root는 `path.join(process.cwd(), ".data", "news")` fallback 대신 `resolveNewsRootDir()`를 사용한다.
  - `planning/v3/news/recovery.test.ts`가 `PLANNING_DATA_DIR` 환경값만 주고 explicit `rootDir` 없이 recovery가 env-aware news root를 쓰는 계약을 고정한다.
- `planning/v3/news/digest.test.ts`
  - 이번 dirty는 product contract 변경이 아니라 fixture alignment다.
  - `TopicDailyStatSchema`가 기대하는 `scoreSum`, `sourceDiversity`를 fixture에 채워 넣는 수준이며, digest 로직 자체를 넓게 바꾸는 변경은 아니다.
- `tests/planning-v3-news-digest-indicator-root.test.ts`
  - env-aware news root와 indicators root 아래에서 disabled indicator override를 읽고 digest watchlist를 `unknownReasonCode: "disabled"`로 정리하는 contract를 고정한다.
- route source 포함 여부
  - 이번 라운드에서는 `src/app/api/planning/v3/news/refresh/route.ts`, `src/app/api/planning/v3/news/recovery/route.ts`, `src/app/api/planning/v3/news/digest/route.ts`를 열지 않았다.
  - 포함된 logic/test 범위의 PASS만으로 same-origin/root contract를 설명할 수 있었고, route source 수정도 필요하지 않았다.

## 실제로 확인한 계약
- import-safe main guard
  - `newsRefresh.ts`는 `process.argv[1]`와 `fileURLToPath(import.meta.url)`를 비교하는 `isMain` guard 아래에서만 `main()`을 실행한다.
  - 따라서 test나 route가 module을 import할 때 refresh pipeline이 자동 실행되지 않는다.
- env-aware news root
  - `recovery.ts`는 explicit `rootDir`가 없으면 `resolveNewsRootDir()` 결과를 base root로 사용한다.
  - preview의 `writeTargets`와 apply의 실제 cache write가 동일한 env-aware news root를 기준으로 계산된다.
- env-aware indicators root
  - digest indicator-root integration test가 `PLANNING_DATA_DIR` 하위 `indicators/specOverrides.json`에 `enabled: false` override를 두고, digest route 결과가 이를 반영하는지 확인한다.
  - 현재 PASS 기준으로 disabled override는 env-aware indicators root에서 정상 반영된다.
- remote-host same-origin contract
  - refresh/recovery remote-host API test는 `example.com` same-origin은 허용하고, `evil.com` cross-origin은 `ORIGIN_MISMATCH`로 막는 계약을 고정한다.
  - 현재 PASS 기준으로 이 contract는 유지된다.

## 검증
- 기준선 확인
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-rootdir-default-alignment.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-golden-pipeline-qa-hardening.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-ops-migrate-hardening.md`
- 상태 잠금
  - `git status --short -- planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/digest.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/digest/route.ts planning/v3/news/rootDir.ts planning/v3/indicators/rootDir.ts planning/v3/news/store/index.ts planning/v3/indicators/specOverrides.ts`
- audit
  - `sed -n '1,320p' planning/v3/news/cli/newsRefresh.ts`
  - `sed -n '300,360p' planning/v3/news/cli/newsRefresh.ts`
  - `sed -n '1,320p' planning/v3/news/recovery.ts`
  - `sed -n '1,260p' planning/v3/news/recovery.test.ts`
  - `sed -n '1,320p' planning/v3/news/digest.test.ts`
  - `sed -n '1,280p' tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`
  - `sed -n '1,260p' tests/planning-v3-news-digest-indicator-root.test.ts`
  - `git diff -- planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/digest.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
- 테스트
  - `pnpm exec vitest run planning/v3/news/recovery.test.ts planning/v3/news/digest.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - PASS (`4 files`, `10 tests`)
- lint
  - `pnpm exec eslint planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/digest.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - PASS

## 미실행 검증
- `pnpm build`
  - route source를 실제 수정하지 않아 조건부 build를 실행하지 않았다.
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- 현재 범위는 PASS지만, `src/app/api/planning/v3/news/refresh/route.ts`, `src/app/api/planning/v3/news/recovery/route.ts`, `src/app/api/planning/v3/news/digest/route.ts` 자체도 dirty 상태다. 이번 라운드에서는 logic/test만으로 설명 가능해 열지 않았고, 다음에 route를 건드릴 때는 same-origin contract만 별도 축으로 다시 잠가야 한다.
- `planning/v3/news/digest.test.ts`의 변경은 fixture alignment로 설명되지만, future schema/type drift가 다시 생기면 digest fixture와 product contract drift를 구분해서 다뤄야 한다.
- `csv-parse`와 `drafts-upload-flow`는 여전히 더 넓은 user-facing/import 흐름이므로 이번 news internal contract 배치와 분리 유지가 필요하다.

## 다음 라운드 우선순위
1. `csv-parse`와 `drafts-upload-flow`는 그대로 바로 열지 말고, user-facing/import 범위를 다시 1축씩 분해한 뒤 연다.
2. 이번 `news-refresh root-contract follow-up` 범위는 재오픈하지 않는다.
3. dirty route 파일을 따로 다뤄야 할 때는 same-origin contract만 최소 범위로 묶고, rootDir default alignment나 csv/drafts 축과 섞지 않는다.
