# 2026-03-13 planning-v3 store-helper next-batch decomposition

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-store-helper-next-batch-breakdown.md`

## 사용 skill
- `planning-gate-selector`: 후보 축별 최소 검증 세트를 추측이 아니라 경로/성격 기준으로 다시 고르기 위해 사용
- `work-log-closeout`: audit-only 라운드 결과를 `/work` 형식으로 남기기 위해 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `store/helper` 분해 축이 어긋나므로, 다음 라운드도 같은 dirty 브랜치에서 범위를 더 넓히지 않게 잠가야 한다.

## 변경 이유
- 직전 `draft/profile` follow-up note가 다음 라운드를 `store/helper` 또는 다른 isolated bucket으로 넘기라고 명시했다.
- `work/3/13/2026-03-13-planning-v3-next-batch-breakdown.md`의 `store/helper` 10파일 묶음은 실제 기능 흐름이 아니라 `ops`, `qa`, `csv import`, `legacy drafts upload`, `categories alias`가 섞인 임시 bucket이었다.
- 이번 라운드는 구현이 아니라 현재 dirty 상태를 다시 잠가 다음 실제 구현 배치 1개만 추천하는 정리 작업이다.

## 현재 store/helper bucket 현황
- 현재 `git status` 기준 실제 dirty 후보는 5개다.
  - `planning/v3/ops/migrate.ts`
  - `planning/v3/qa/goldenPipeline.test.ts`
  - `tests/planning-v3/csv-parse.test.ts`
  - `tests/planning-v3/drafts-upload-flow.test.ts`
  - `src/lib/planning/v3/categories/store.ts`
- 조건부 확인 대상이었던 아래 파일들은 현재 dirty가 아니었다.
  - `src/lib/planning/v3/journal/store.ts`
  - `src/lib/planning/v3/routines/store.ts`
  - `src/lib/planning/v3/scenarios/library.ts`
  - `src/lib/planning/v3/security/whitelist.ts`
  - `src/lib/planning/v3/service/monteCarloCore.ts`
- [추론] 따라서 이전 note의 `categories/journal/scenarios store` 묶음은 현재 dirty 상태 기준으로는 독립 배치가 아니라 `categories` alias 1파일과 이미 닫은 route 소비처의 잔여물에 가깝다.

## 다시 나눈 후보 배치

### 후보 1. categories rules store alias
- 포함 파일: `src/lib/planning/v3/categories/store.ts`
- 변경 이유: `categories/rules` route가 `@/lib/planning/v3/categories/store`를 보도록 정리됐지만, 실제 dirty는 `categoryRulesStore` 본체가 아니라 alias wrapper 1개만 남아 있다.
- 사용자 영향 여부: 간접적 user-facing. 직접 화면이 아니라 `categories/rules` API import 경로 정리에 가깝다.
- 예상 검증: `pnpm exec vitest run tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`, `pnpm build`
- 다른 축과 섞이면 위험한 이유: 이 축을 열면 이미 닫은 `categories/journal/scenarios` user-facing/API contract route까지 다시 검증 범위에 들어와, alias 정리인지 contract 회귀인지 원인 분리가 흐려진다.

### 후보 2. drafts upload / csv parse
- 포함 파일: `tests/planning-v3/csv-parse.test.ts`, `tests/planning-v3/drafts-upload-flow.test.ts`
- 연결 확인 파일: `src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`, `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`, `src/app/api/planning/v3/import/csv/route.ts`, `src/app/api/planning/v3/drafts/route.ts`, `src/app/api/planning/v3/drafts/[id]/route.ts`, `src/app/api/planning/v3/draft/preview/route.ts`, `src/app/api/planning/v3/draft/profile/route.ts`, `src/app/api/planning/v3/draft/scenario/route.ts`, `src/app/api/planning/v3/draft/apply/route.ts`, `src/app/api/planning/v3/drafts/[id]/create-profile/route.ts`
- 변경 이유: 두 test는 공통으로 `parseCsvTransactions`와 legacy `/planning/v3/drafts` 업로드 helper를 따라가며, 실제로는 `import/csv + drafts + draft/*` 사용자 흐름을 다시 여는 축이다.
- 사용자 영향 여부: user-facing. CSV 업로드, preview, draft save/list refresh, draft scenario/apply 쪽에 직접 연결된다.
- 예상 검증: `pnpm exec vitest run tests/planning-v3/csv-parse.test.ts tests/planning-v3/drafts-upload-flow.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-draft-scenario-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-batches-import-csv-api.test.ts`, `pnpm build`
- 권장 추가 검증: `DraftsListClient` selector나 업로드 상호작용이 바뀌면 `pnpm e2e:rc`
- 다른 축과 섞이면 위험한 이유: `import/csv`, `legacy drafts`, `draft scenario`, `transactions/accounts`가 한 번에 묶여 rollback 단위가 급격히 커지고, 직전 `draft/profile` follow-up과도 경계가 다시 섞인다.

### 후보 3. ops migrate
- 포함 파일: `planning/v3/ops/migrate.ts`
- 연결 확인 파일: `planning/v3/ops/migrate.test.ts`
- 변경 이유: 현재 diff는 migration plan의 validation branch에서 unused catch binding을 걷어내는 수준이지만, 파일 자체는 `.data/news`, `.data/indicators`, `.data/exposure` schemaVersion migration을 담당하는 실제 구현 축이다.
- 사용자 영향 여부: internal-only. 사용자 화면보다 운영용 migration/doctor 경로에 가깝다.
- 예상 검증: `pnpm exec vitest run planning/v3/ops/migrate.test.ts`, `pnpm exec eslint planning/v3/ops/migrate.ts`
- 다른 축과 섞이면 위험한 이유: `news/settings`나 `goldenPipeline`과 같이 묶으면 데이터 migration fault인지 QA baseline drift인지 분리되지 않고, 문제 발생 시 backup/doctor 경로까지 같이 의심해야 한다.

### 후보 4. golden pipeline QA
- 포함 파일: `planning/v3/qa/goldenPipeline.test.ts`
- 변경 이유: 이 파일은 `digest`, `scenarios`, `alerts`, `impact` 산출물을 한 번에 고정하는 QA baseline이며, 현재 diff도 `news/contracts`와 `trend/contracts` 타입 차이를 test fixture 쪽에서 맞추는 내용이다.
- 사용자 영향 여부: internal-only. 구현보다는 regression baseline 관리 축이다.
- 예상 검증: `pnpm exec vitest run planning/v3/qa/goldenPipeline.test.ts`
- 다른 축과 섞이면 위험한 이유: 같은 라운드에서 구현 파일까지 같이 바꾸면 실패 시 실제 product regression인지 golden fixture drift인지 분리하기 어렵다.

## 추천 다음 구현 배치 1개
- [추론] 다음 실제 구현 배치는 `ops migrate` 단독이 가장 안전하다.
- 추천 이유 1: 현재 dirty 후보 중 실제 구현 파일이 1개뿐인 가장 좁은 internal axis다.
- 추천 이유 2: `pnpm exec vitest run planning/v3/ops/migrate.test.ts`와 `pnpm exec eslint planning/v3/ops/migrate.ts` 정도로 닫을 수 있어 검증 세트가 가장 작다.
- 추천 이유 3: route/page/user flow를 다시 열지 않아 `quickstart/home`, `news/settings`, `txn-overrides`, `user-facing page`, `API contract`, `draft/profile` 후속과 겹침이 가장 적다.
- 추천 이유 4: rollback 단위가 사실상 `planning/v3/ops/migrate.ts` 1파일이라 dirty worktree를 더 키우지 않고 잠그기 쉽다.
- 추천 검증 세트:
  - `pnpm exec vitest run planning/v3/ops/migrate.test.ts`
  - `pnpm exec eslint planning/v3/ops/migrate.ts`
  - `git diff --check -- planning/v3/ops/migrate.ts`

## 명시적 제외 범위
- 이미 닫힌 후속:
  - `quickstart/home` 전체
  - `news/settings` 전체
  - `txn-overrides follow-through` 전체
  - `user-facing page follow-up` 전체
  - `API contract follow-up` 전체
  - `draft/profile follow-up` 전체
- 이번 라운드에서 다음 구현 배치로 추천하지 않는 축:
  - `categories rules store alias`
  - `drafts upload / csv parse`
  - `golden pipeline QA`
- 기타 제외 유지:
  - `transactions/accounts` 전체
  - `balances` 전체
  - `reports/v2` 전체
  - docs 대량 수정
  - route 추가
  - 새 엔진 도입
  - 저장모델 변경
  - `pnpm build`
  - `pnpm e2e:rc`
  - release gate 전체

## 검증
- `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-profile-followup.md`
- `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-next-batch-breakdown.md`
- `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-api-contract-followup.md`
- `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-user-facing-contract-followup.md`
- `git branch --show-current`
- `git status --short planning/v3/ops/migrate.ts planning/v3/qa/goldenPipeline.test.ts tests/planning-v3/csv-parse.test.ts tests/planning-v3/drafts-upload-flow.test.ts src/lib/planning/v3/categories/store.ts planning/v3/journal/store.ts planning/v3/routines/store.ts planning/v3/scenarios/library.ts planning/v3/security/whitelist.ts src/lib/planning/v3/service/monteCarloCore.ts src/lib/planning/v3/security/whitelist.ts src/lib/planning/v3/journal/store.ts src/lib/planning/v3/routines/store.ts src/lib/planning/v3/scenarios/library.ts`
- `git diff --name-only -- planning/v3/ops/migrate.ts planning/v3/qa/goldenPipeline.test.ts tests/planning-v3/csv-parse.test.ts tests/planning-v3/drafts-upload-flow.test.ts src/lib/planning/v3/categories/store.ts planning/v3/journal/store.ts planning/v3/routines/store.ts planning/v3/scenarios/library.ts planning/v3/security/whitelist.ts src/lib/planning/v3/service/monteCarloCore.ts src/lib/planning/v3/security/whitelist.ts src/lib/planning/v3/journal/store.ts src/lib/planning/v3/routines/store.ts src/lib/planning/v3/scenarios/library.ts`
- `git diff -- planning/v3/ops/migrate.ts`
- `git diff -- planning/v3/qa/goldenPipeline.test.ts`
- `git diff -- tests/planning-v3/csv-parse.test.ts`
- `git diff -- tests/planning-v3/drafts-upload-flow.test.ts`
- `rg -n "runV3Migrate|planning/v3/ops/migrate|goldenPipeline|monteCarloCore|security/whitelist|draftsUploadFlow|parseCsvTransactions" src planning tests`
- `rg -n "draftsUploadFlow|fetchCsvDraftPreview|saveCsvDraftPreview|fetchDraftList" src tests`
- `rg -n "monteCarloCore|draftScenarioSimulation|simulateDraftScenario|createConservativeScenarioParams|runMonteCarloScenarios" src tests planning`
- `rg -n "store/helper|ops/migrate|goldenPipeline|csv-parse|drafts-upload-flow|categories store|categories/journal/scenarios|drafts upload|csv parse|golden pipeline|migrate" work/3/13 work/3/12`
- `nl -ba planning/v3/ops/migrate.ts | sed -n '1,220p'`
- `nl -ba planning/v3/qa/goldenPipeline.test.ts | sed -n '1,240p'`
- `nl -ba tests/planning-v3/csv-parse.test.ts | sed -n '1,240p'`
- `nl -ba tests/planning-v3/drafts-upload-flow.test.ts | sed -n '1,260p'`
- `nl -ba src/lib/planning/v3/categories/store.ts | sed -n '1,260p'`
- `nl -ba src/app/api/planning/v3/categories/rules/route.ts | sed -n '1,180p'`
- `nl -ba src/app/api/planning/v3/categories/rules/[id]/route.ts | sed -n '1,140p'`
- `nl -ba src/app/planning/v3/drafts/_components/draftsUploadFlow.ts | sed -n '180,320p'`
- `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
- `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`

## 남은 리스크
- `ops/migrate`는 가장 좁은 구현 축이지만, 대상 파일이 `news/settings`, `indicators`, `exposure` schema를 함께 참조하므로 다음 라운드에서도 CLI migration 범위를 넘기지 않게 잠가야 한다.
- `goldenPipeline`는 가장 작은 QA-only 축이지만, 구현 배치보다 먼저 열면 digest/scenario/alerts fixture drift가 실제 product fix처럼 보일 수 있다.
- `drafts upload / csv parse`는 현재도 실질적으로 `transactions/accounts + legacy drafts` 축이라, 이 배치를 열 때는 직전 `draft/profile` 후속과 범위를 다시 분리하는 선행 note가 필요하다.
- `categories rules store alias`는 alias 1파일만으로는 작아 보여도 소비처가 이미 닫은 route contract 영역이라, 단독 배치로 열 경우 다시 포함시킬 route/test 경계를 미리 적어 두어야 한다.

## 다음 라운드 우선순위
1. `ops/migrate` 단독 구현 배치
2. `goldenPipeline` QA-only 후속 여부 재판단
3. `drafts upload / csv parse`는 별도 `transactions/accounts` 경계 note가 생길 때만 검토
4. `categories rules store alias`는 `categories` route 축을 다시 열어야 할 근거가 생길 때만 검토
