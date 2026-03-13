# 2026-03-13 planning-v3 csv-import route same-origin-contract follow-up

## 변경 파일
- `src/app/api/planning/v3/import/csv/route.ts`
- `tests/planning-v3-batches-import-csv-api.test.ts`
- `tests/planning-v3-transactions-import-account-api.test.ts`
- `tests/planning-v3-user-facing-remote-host-api.test.ts`
- `work/3/13/2026-03-13-planning-v3-csv-import-route-same-origin-contract-followup.md`

## 사용 skill
- `planning-gate-selector`: csv import route contract 배치에 맞춰 `vitest + eslint + build + diff check`까지만 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: route audit 결과, 조건부 service/provider 확인 여부, 실행/미실행 검증을 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `csv-import route same-origin-contract` 축이 어긋나므로, import route 3개와 direct API test만 잠그고 parser/UI/save/list 흐름으로 번지지 않게 제한했다.

## 변경 이유
- latest `draft-preview legacy-fallback alignment` note가 다음 라운드는 `csv/drafts 전체`가 아니라 `preview/save/list/import`를 1축씩 다시 나눠 열라고 남겼다.
- 현재 dirty subset은 `src/app/api/planning/v3/import/csv/route.ts`, `src/app/api/planning/v3/batches/import/csv/route.ts`, `src/app/api/planning/v3/transactions/import/csv/route.ts`와 direct API test 3개로 충분히 설명되는 작은 route contract 축이었다.
- audit 결과 route 3개 모두 `assertLocalHost`/`onlyDev` 제거, `assertSameOrigin`, `requireCsrf(..., { allowWhenCookieMissing: true })` 방향으로 정렬돼 있었고, 남은 mismatch는
  - `import/csv` route의 old relative import path
  - `batches/import/csv`, `transactions/import/csv`, `import/csv`의 remote-host same-origin / cross-origin contract를 direct test가 각각 좁게 고정하지 않던 점
  이 두 가지뿐이었다.
- 반면 `csv-parse`, `drafts-upload-flow`, upload UI는 parser/save/list 흐름 전체로 커질 수 있어 이번 라운드에서 제외했다.

## 핵심 변경
- `src/app/api/planning/v3/import/csv/route.ts`
  - `@/lib/...` alias import로 정리했다.
  - guard 로직 자체는 유지했다. 현재 contract는 `assertSameOrigin(request)` + `requireCsrf(request, { csrf }, { allowWhenCookieMissing: true })`다.
- `src/app/api/planning/v3/batches/import/csv/route.ts`
  - source 수정은 하지 않았다.
  - audit 결과 same-origin + CSRF + wrapper import(`@/lib/planning/v3/batches/store`)가 이미 맞아 있었다.
- `src/app/api/planning/v3/transactions/import/csv/route.ts`
  - source 수정은 하지 않았다.
  - audit 결과 same-origin + CSRF + wrapper import(`@/lib/planning/v3/transactions/store`)가 이미 맞아 있었다.
- direct API test 3개를 route별 계약에 맞춰 보강했다.
  - `tests/planning-v3-batches-import-csv-api.test.ts`
    - `POST /api/planning/v3/batches/import/csv`가 same-origin remote host에서는 201, cross-origin에서는 `ORIGIN_MISMATCH`를 반환하는지 고정
  - `tests/planning-v3-transactions-import-account-api.test.ts`
    - `POST /api/planning/v3/transactions/import/csv`가 same-origin remote host에서는 201, cross-origin에서는 `ORIGIN_MISMATCH`를 반환하는지 고정
  - `tests/planning-v3-user-facing-remote-host-api.test.ts`
    - 기존 same-origin `POST /api/planning/v3/import/csv` 성공 케이스에 더해, cross-origin `POST /api/planning/v3/import/csv`가 `ORIGIN_MISMATCH`로 막히는지 추가로 고정
- 새 전용 test 파일은 만들지 않았다.
  - 기존 direct API test 3개만으로 route 3개의 계약을 충분히 설명할 수 있었다.

## 실제로 조정한 계약
- same-origin
  - `import/csv`, `batches/import/csv`, `transactions/import/csv` 모두 remote host라도 same-origin이면 허용된다.
  - cross-origin 요청은 `ORIGIN_MISMATCH`로 차단된다.
- CSRF
  - route 3개 모두 `requireCsrf(..., { allowWhenCookieMissing: true })`를 유지한다.
  - 이번 direct test 보강은 origin contract 중심이며, CSRF semantics 자체는 바꾸지 않았다.
- import path
  - 실제 수정은 `src/app/api/planning/v3/import/csv/route.ts`의 alias 정리만 했다.
  - `batches/import/csv`, `transactions/import/csv`는 이미 alias/wrapper 경로를 쓰고 있어 audit-only로 닫았다.

## 조건부 service/provider 포함 여부
- 포함했다.
  - `src/lib/planning/v3/batches/store.ts`
  - `src/lib/planning/v3/service/importCsvToDraft.ts`
- 이유
  - route source에서 wrapper/provider 설명이 실제로 current import surface와 맞는지 확인하려고 최소 범위로만 읽었다.
- 수정은 하지 않았다.
  - 이번 라운드는 route contract만 다뤘고, parser/provider/store implementation은 건드리지 않았다.

## 검증
- 기준선 확인
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-preview-legacy-fallback-alignment.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-profile-route-same-origin-contract-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-route-same-origin-contract-followup.md`
- 상태 잠금 / audit
  - `git status --short -- src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/app/api/planning/v3/transactions/import/csv/route.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts src/lib/planning/v3/service/importCsvToDraft.ts src/lib/planning/v3/batches/store.ts`
  - `git diff -- src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/app/api/planning/v3/transactions/import/csv/route.ts`
  - `sed -n '1,260p' src/app/api/planning/v3/import/csv/route.ts`
  - `sed -n '1,260p' src/app/api/planning/v3/batches/import/csv/route.ts`
  - `sed -n '1,320p' src/app/api/planning/v3/transactions/import/csv/route.ts`
  - `sed -n '1,260p' tests/planning-v3-batches-import-csv-api.test.ts`
  - `sed -n '1,320p' tests/planning-v3-transactions-import-account-api.test.ts`
  - `sed -n '1,320p' tests/planning-v3-user-facing-remote-host-api.test.ts`
  - `[조건부] sed -n '1,260p' src/lib/planning/v3/batches/store.ts`
  - `[조건부] sed -n '1,260p' src/lib/planning/v3/service/importCsvToDraft.ts`
  - `rg -n "assertSameOrigin|requireCsrf|allowWhenCookieMissing|assertLocalHost|onlyDev|LOCAL_ONLY|ORIGIN_MISMATCH|import/csv|batches/import/csv|transactions/import/csv" src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/app/api/planning/v3/transactions/import/csv/route.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`
- 테스트
  - `pnpm exec vitest run tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`
  - PASS (`3 files`, `10 tests`)
- eslint
  - `pnpm exec eslint src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/app/api/planning/v3/transactions/import/csv/route.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`
  - PASS
- build
  - `pnpm build`
  - PASS

## 미실행 검증
- `tests/planning-v3/csv-parse.test.ts`
- `tests/planning-v3/drafts-upload-flow.test.ts`
- `tests/planning-v3-import-csv-upload-ui.test.tsx`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- `tests/planning-v3-user-facing-remote-host-api.test.ts`는 import route 외에도 더 넓은 transactions/profile/category route를 함께 다룬다. 이번 라운드는 import route 관련 assertion만 보강했고, 나머지 route source는 다시 열지 않았다.
- `src/lib/planning/v3/batches/store.ts`와 `src/lib/planning/v3/service/importCsvToDraft.ts`는 current import surface 설명용으로만 확인했다. 이후 parser/provider semantics가 바뀌면 route contract와 parsing contract를 분리해서 다뤄야 한다.
- csv parse, drafts upload, upload UI는 여전히 더 큰 흐름이라 이번 route contract batch와 분리 유지가 필요하다.

## 다음 라운드 우선순위
1. `csv-parse`와 `drafts-upload-flow`는 그대로 바로 열지 말고 parser/save/list/import를 다시 1축씩 분해한 뒤 연다.
2. 이번 `csv-import route same-origin-contract` 범위는 재오픈하지 않는다.
3. 후속 csv/drafts batch가 열리더라도 route guard/import contract와 parser/upload UI 의미를 섞지 않는다.
