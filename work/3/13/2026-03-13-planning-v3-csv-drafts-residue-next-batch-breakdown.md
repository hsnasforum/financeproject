# 2026-03-13 planning-v3 csv-drafts residue next-batch breakdown

## 변경 파일
- `work/3/13/2026-03-13-planning-v3-csv-drafts-residue-next-batch-breakdown.md`

## 사용 skill
- `work-log-closeout`: csv/drafts residue를 다시 2~3개 후보 배치로 나누고, 다음 구현 배치 1개와 제외 범위를 `/work` 형식으로 고정하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `csv/drafts residue next-batch breakdown` 축이 어긋나므로, 이번 라운드는 residue 분해 note만 남기고 실제 구현은 다음 1축으로만 넘긴다.

## 변경 이유
- latest `csv-import route same-origin-contract` note가 다음 라운드는 `csv/drafts 전체`를 다시 열지 말고 parser/save/list/import를 1축씩 분해해서 열라고 남겼다.
- 현재 residue dirty는 아래 3개뿐이다.
  - `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
  - `tests/planning-v3/csv-parse.test.ts`
  - `tests/planning-v3/drafts-upload-flow.test.ts`
- 같은 csv/drafts bucket 안에 있어도 실제 의미는 다르다.
  - `CsvBatchUploadClient`: user-facing upload entry UI
  - `csv-parse.test`: parser determinism/fixture contract
  - `drafts-upload-flow.test`: preview -> save -> list compatibility harness
- 이 셋을 한 배치로 구현하면 UI, parser, drafts flow를 한 번에 섞게 되므로, 이번 라운드는 코드 수정 없이 다음 구현 배치 1개만 뽑는 정리 작업으로 제한했다.

## 현재 csv/drafts residue 현황
- `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
  - dirty diff는 `next/link`를 `BodyActionLink`로 바꾸는 user-facing link tone 정리다.
  - 연결 범위는 `src/app/planning/v3/import/csv/page.tsx`와 `tests/planning-v3-import-csv-upload-ui.test.tsx` 수준으로 좁다.
  - 현재 UI test는 test id 존재만 확인하고 있어, 이 축은 parser/save/list semantics와 직접 연결되지 않는다.
- `tests/planning-v3/csv-parse.test.ts`
  - dirty diff는 `repeated.transactions === first.transactions`를 추가하는 parser determinism hardening이다.
  - 구현 파일 `src/lib/planning/v3/providers/csv/csvProvider.ts`는 현재 dirty가 없지만 `parseCsvTransactions`는 preview/batch/draft import와 다른 csv tests에서 공통 사용된다.
  - 즉 user-facing UI보다는 provider contract 쪽 residue다.
- `tests/planning-v3/drafts-upload-flow.test.ts`
  - dirty diff 자체는 `vi.fn<typeof fetch>()`로 fetch mock typing을 정리하는 수준이다.
  - 다만 테스트 범위는 `src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`의 preview -> save -> list refresh, nested `data` shape, legacy top-level preview shape까지 함께 고정한다.
  - 따라서 diff는 작아도 실제 의미 축은 drafts upload flow compatibility다.
- clean context
  - `tests/planning-v3-import-csv-upload-ui.test.tsx`, `src/lib/planning/v3/providers/csv/csvProvider.ts`, `src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`는 현재 dirty가 아니었다.
  - 이번 residue는 구현 파일 대량 drift가 아니라, 서로 다른 성격의 잔여 dirty 3개가 한 bucket에 같이 남아 있는 상태로 보는 편이 맞다.

## 다시 나눈 후보 배치
### 후보 1. csv parser determinism hardening
- 변경 이유
  - `tests/planning-v3/csv-parse.test.ts`의 현재 dirty는 parser 결과의 반복 호출 결정성을 직접 고정하려는 변경이다.
  - `parseCsvTransactions`는 여러 csv consumer가 공통으로 쓰므로, 좁은 범위에서 provider contract를 잠그는 의미가 있다.
- 사용자 영향 여부
  - 직접적인 user-facing 변경은 없다.
  - internal parser contract batch다.
- 예상 검증
  - 최소: `pnpm exec vitest run tests/planning-v3/csv-parse.test.ts`
  - provider 수정이 생기면: `pnpm exec vitest run tests/planning-v3/csv-parse.test.ts tests/planning-v3-csv-parse.test.ts tests/planning-v3-csv-hardening.test.ts`
  - 필요 시: `pnpm exec eslint tests/planning-v3/csv-parse.test.ts src/lib/planning/v3/providers/csv/csvProvider.ts`
- 다른 축과 섞이면 위험한 이유
  - UI polish나 drafts flow와 섞으면 parser determinism regression과 화면/flow regression의 원인이 분리되지 않는다.
  - 같은 `csv` bucket이라도 provider contract와 user-facing upload UX는 실패 양상이 전혀 다르다.

### 후보 2. drafts upload-flow compatibility hardening
- 변경 이유
  - `tests/planning-v3/drafts-upload-flow.test.ts`는 preview -> save -> list refresh와 legacy/nested preview payload compatibility를 함께 고정한다.
  - 현재 dirty는 typing cleanup처럼 보이지만, 테스트가 대표하는 의미는 drafts upload flow compatibility다.
- 사용자 영향 여부
  - 간접 user-facing 축이다.
  - UI보다는 draft preview/save/list 흐름의 compatibility contract에 가깝다.
- 예상 검증
  - 최소: `pnpm exec vitest run tests/planning-v3/drafts-upload-flow.test.ts`
  - flow helper 수정이 생기면: `pnpm exec vitest run tests/planning-v3/drafts-upload-flow.test.ts tests/planning-v3-draft-preview-api.test.ts`
  - 필요 시: `pnpm exec eslint tests/planning-v3/drafts-upload-flow.test.ts src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`
- 다른 축과 섞이면 위험한 이유
  - preview/save/list는 draft API, legacy preview shape, upload UI로 쉽게 번진다.
  - 같은 라운드에 parser나 UI까지 열면 “typing cleanup인지, payload compatibility인지, route contract인지”가 한꺼번에 섞인다.

### 후보 3. csv upload entry UI polish
- 변경 이유
  - `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx` dirty는 upload entry 카드 안 link surface를 `BodyActionLink`로 맞추는 UI tone 정리다.
  - 현재 diff만 보면 parser나 drafts upload flow와 독립적인 entry UI surface다.
- 사용자 영향 여부
  - 직접 user-facing 변경이다.
  - 다만 기능 추가보다 presentation consistency 성격이 강하다.
- 예상 검증
  - 최소: `pnpm exec vitest run tests/planning-v3-import-csv-upload-ui.test.tsx`
  - UI markup 변경이 늘면: `pnpm exec eslint src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-import-csv-upload-ui.test.tsx`
- 다른 축과 섞이면 위험한 이유
  - entry UI 변경은 parser/provider determinism과 별개다.
  - 이 축을 drafts flow와 묶으면 user-facing 링크/문구 변경과 upload persistence semantics가 같은 실패처럼 보이게 된다.

## 추천 다음 구현 배치
- 추천 1축: `csv parser determinism hardening`
- 추천 이유
  - 현재 residue 중 가장 internal-only라서 원인 분리가 쉽다.
  - direct dirty가 `tests/planning-v3/csv-parse.test.ts` 1파일에 모여 있고, 필요해도 `csvProvider.ts`까지만 열면 된다.
  - drafts preview/save/list 흐름이나 upload entry UI를 다시 열지 않고도 닫을 수 있다.
  - rollback도 test/provider 범위로 제한되므로 가장 쉽다.
- 이번 라운드 기준 비추천
  - `drafts upload-flow compatibility hardening`: 현재 diff는 작아도 실제로는 preview/save/list contract를 다시 열 가능성이 커서 다음 1축으로는 너무 넓다.
  - `csv upload entry UI polish`: 가장 작은 user-facing surface이긴 하지만, residue 리스크를 줄이는 효과가 parser contract보다 작고 우선순위가 낮다.

## 권장 검증 세트
- 추천 배치 `csv parser determinism hardening`을 열 때
  - `pnpm exec vitest run tests/planning-v3/csv-parse.test.ts`
  - provider 수정이 생기면 `pnpm exec vitest run tests/planning-v3/csv-parse.test.ts tests/planning-v3-csv-parse.test.ts tests/planning-v3-csv-hardening.test.ts`
  - `pnpm exec eslint tests/planning-v3/csv-parse.test.ts src/lib/planning/v3/providers/csv/csvProvider.ts`
- 이번 breakdown 라운드에서 실제 실행한 검증
  - `git diff --check -- work/3/13/2026-03-13-planning-v3-csv-drafts-residue-next-batch-breakdown.md`

## 명시적 제외 범위
- 이번 라운드에서 재오픈하지 않는 범위
  - `src/app/api/planning/v3/import/csv/route.ts`
  - `src/app/api/planning/v3/batches/import/csv/route.ts`
  - `src/app/api/planning/v3/transactions/import/csv/route.ts`
  - `tests/planning-v3-batches-import-csv-api.test.ts`
  - `tests/planning-v3-transactions-import-account-api.test.ts`
  - `tests/planning-v3-user-facing-remote-host-api.test.ts`
  - `src/app/api/planning/v3/draft/**`
  - `src/app/api/planning/v3/drafts/**`
  - `src/app/planning/v3/drafts/**` 전체 구현 변경
  - `tests/planning-v3-import-csv-upload-ui.test.tsx`의 실제 수정
  - `src/lib/planning/v3/providers/csv/csvParse.ts`
  - `tests/fixtures/planning-v3/drafts-upload-flow/*`
  - `tests/planning-v3/csv-parse.test.ts`, `tests/planning-v3/drafts-upload-flow.test.ts`, `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`를 한 라운드에 동시에 구현 배치로 여는 것
- 넓은 제외 유지
  - quickstart/home 전체
  - news route same-origin contract 전체
  - draft/profile route same-origin contract 전체
  - draft-preview legacy-fallback alignment 전체
  - csv-import route same-origin-contract 전체
  - route 추가
  - docs 대량 수정
  - 새 엔진 도입
  - 저장모델 변경
  - build/e2e/release 실행

## 정적 스캔
- 기준선 확인
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-csv-import-route-same-origin-contract-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-preview-legacy-fallback-alignment.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-profile-route-same-origin-contract-followup.md`
- 상태 잠금 / diff
  - `git status --short -- src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/csv-parse.test.ts src/lib/planning/v3/providers/csv/csvProvider.ts tests/planning-v3/drafts-upload-flow.test.ts src/app/planning/v3/drafts/_components/draftsUploadFlow.ts src/lib/planning/v3/providers/csv/csvParse.ts tests/fixtures/planning-v3/drafts-upload-flow`
  - `git diff -- src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/csv-parse.test.ts src/lib/planning/v3/providers/csv/csvProvider.ts tests/planning-v3/drafts-upload-flow.test.ts src/app/planning/v3/drafts/_components/draftsUploadFlow.ts src/lib/planning/v3/providers/csv/csvParse.ts tests/fixtures/planning-v3/drafts-upload-flow`
- 파일 확인
  - `sed -n '1,240p' src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
  - `sed -n '1,240p' tests/planning-v3-import-csv-upload-ui.test.tsx`
  - `sed -n '1,240p' tests/planning-v3/csv-parse.test.ts`
  - `sed -n '1,280p' src/lib/planning/v3/providers/csv/csvProvider.ts`
  - `sed -n '1,280p' tests/planning-v3/drafts-upload-flow.test.ts`
  - `sed -n '1,280p' src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`
  - `rg -n "CsvBatchUploadClient|fetchCsvDraftPreview|saveCsvDraftPreview|fetchDraftList|parseCsvTransactions" src tests`
  - `rg -n "BodyActionLink|v3-csv-upload-page|v3-csv-upload-submit|v3-csv-file-input|drafts-upload-flow|preview-data-shape|preview-legacy-shape" src tests`

## 미실행 검증
- `pnpm exec vitest run tests/planning-v3/csv-parse.test.ts`
- `pnpm exec vitest run tests/planning-v3/drafts-upload-flow.test.ts`
- `pnpm exec vitest run tests/planning-v3-import-csv-upload-ui.test.tsx`
- `pnpm exec eslint src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/csv-parse.test.ts src/lib/planning/v3/providers/csv/csvProvider.ts tests/planning-v3/drafts-upload-flow.test.ts src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`

## 다음 라운드 우선순위
1. `csv parser determinism hardening`
2. `drafts upload-flow compatibility hardening`
3. `csv upload entry UI polish`
