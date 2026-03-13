# 2026-03-13 planning-v3 drafts-upload-flow compatibility hardening

## 변경 파일
- 코드 추가 수정 없음
- `work/3/13/2026-03-13-planning-v3-drafts-upload-flow-compatibility-hardening.md`

## 사용 skill
- `planning-gate-selector`: internal helper/test contract 배치에 맞춰 `vitest + eslint + diff check`까지만 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: upload-flow compatibility audit 결과, 조건부 미포함 범위, 실행/미실행 검증을 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `drafts upload-flow compatibility` 축이 어긋나므로, `tests/planning-v3/drafts-upload-flow.test.ts`와 `src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`만 잠그고 preview route, import route, upload UI로 번지지 않게 제한했다.

## 변경 이유
- latest `csv-parser determinism hardening` note가 다음 우선순위로 `drafts upload-flow compatibility hardening`을 남겼다.
- 현재 direct dirty는 `tests/planning-v3/drafts-upload-flow.test.ts` 1파일에 모여 있었고, helper `src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`는 clean 상태였다.
- audit 결과 이번 dirty는 helper contract drift가 아니라 fetch mock typing hardening으로 정리할 수 있었고, nested `data.*` 우선 + legacy top-level fallback 계약도 helper 구현이 이미 만족하고 있었다.

## 핵심 변경
- 이번 라운드에서 code churn은 추가하지 않았다.
- `tests/planning-v3/drafts-upload-flow.test.ts`의 현재 dirty는 세 곳의 `vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>()`를 `vi.fn<typeof fetch>()`로 바꾸는 typing hardening이다.
- helper `src/app/planning/v3/drafts/_components/draftsUploadFlow.ts` audit 결과 현재 compatibility 계약은 이미 맞아 있었다.
  - `fetchCsvDraftPreview()`
    - `/api/planning/v3/import/csv`로 JSON body를 보낸다.
    - `pickPreviewPayload()`에서 nested `payload.data.monthlyCashflow/draftPatch/meta`를 우선한다.
    - nested core가 완전하지 않으면 legacy top-level `cashflow/draftPatch/meta`로 fallback한다.
  - `saveCsvDraftPreview()`
    - preview에서 받은 `cashflow + draftPatch`를 `/api/planning/v3/drafts` payload로 저장한다.
  - `fetchDraftList()`
    - `/api/planning/v3/drafts` 목록을 다시 읽어 list refresh를 마무리한다.
- 결론적으로 이번 batch는 helper 수정 없이 current dirty test hardening만으로 닫을 수 있었다.

## compatibility 계약에서 실제로 조정한 내용
- 추가 코드 수정은 하지 않았다.
- 현재 dirty test typing 정리가 이번 라운드에서 잠근 계약은 아래다.
  - mocked fetch 기준으로 preview -> save -> list refresh가 계속 같은 순서로 동작한다.
  - `payload.data.monthlyCashflow/meta/draftPatch` shape가 오면 nested 값을 우선한다.
  - nested core가 없으면 legacy top-level preview shape를 계속 지원한다.
- 위 계약은 `tests/planning-v3/drafts-upload-flow.test.ts` 3개 테스트와 current helper 구현만으로 충분히 설명됐다.

## 조건부 포함 여부
- fixture
  - `tests/fixtures/planning-v3/drafts-upload-flow/preview-data-shape.json`
  - `tests/fixtures/planning-v3/drafts-upload-flow/preview-legacy-shape.json`
  - 읽어 확인만 했고 수정하지 않았다.
  - 현재 helper가 nested 우선 / legacy fallback 계약을 이미 만족하고 있어 fixture 수정은 필요 없었다.
- preview API test
  - `tests/planning-v3-draft-preview-api.test.ts`
  - 열지 않았다.
  - helper 수정이 없어서 preview contract까지 넓힐 이유가 없었다.
- remote-host test
  - `tests/planning-v3-drafts-remote-host-api.test.ts`
  - 열지 않았다.
  - 이번 라운드는 same-origin contract가 아니라 helper compatibility 축이라 direct helper/test 범위로 멈췄다.

## 검증
- 기준선 확인
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-csv-parser-determinism-hardening.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-csv-drafts-residue-next-batch-breakdown.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-draft-preview-legacy-fallback-alignment.md`
- 상태 잠금 / audit
  - `git status --short -- tests/planning-v3/drafts-upload-flow.test.ts src/app/planning/v3/drafts/_components/draftsUploadFlow.ts tests/fixtures/planning-v3/drafts-upload-flow/preview-data-shape.json tests/fixtures/planning-v3/drafts-upload-flow/preview-legacy-shape.json tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts`
  - `git diff -- tests/planning-v3/drafts-upload-flow.test.ts src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`
  - `sed -n '1,280p' tests/planning-v3/drafts-upload-flow.test.ts`
  - `sed -n '1,320p' src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`
  - `sed -n '1,200p' tests/fixtures/planning-v3/drafts-upload-flow/preview-data-shape.json`
  - `sed -n '1,200p' tests/fixtures/planning-v3/drafts-upload-flow/preview-legacy-shape.json`
- 테스트
  - `pnpm exec vitest run tests/planning-v3/drafts-upload-flow.test.ts`
  - PASS (`1 file`, `3 tests`)
- eslint
  - `pnpm exec eslint tests/planning-v3/drafts-upload-flow.test.ts src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`
  - PASS

## 미실행 검증
- `pnpm exec vitest run tests/planning-v3/drafts-upload-flow.test.ts tests/planning-v3-draft-preview-api.test.ts`
- `pnpm exec vitest run tests/planning-v3/drafts-upload-flow.test.ts tests/planning-v3-drafts-remote-host-api.test.ts`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 mocked fetch 기반 helper contract만 직접 고정했다. 실제 route payload가 다시 바뀌면 preview API test나 remote-host contract test에서 별도 확인이 필요할 수 있다.
- `tests/planning-v3-drafts-upload-flow.test.ts`의 dirty는 typing hardening에 그쳤지만, 이 테스트가 대표하는 의미는 여전히 preview/save/list compatibility다. 이후 수정에서도 UI tone이나 parser semantics와 섞지 않는 편이 안전하다.
- `tests/planning-v3-draft-preview-api.test.ts`와 `tests/planning-v3-drafts-remote-host-api.test.ts`는 현재 worktree에서 dirty/untracked 상태였지만, 이번 batch에서는 의도적으로 다시 열지 않았다.

## 다음 라운드 우선순위
1. `csv upload entry UI polish`
2. 이번 `drafts upload-flow compatibility hardening` 범위는 재오픈하지 않는다.
