# 2026-03-13 planning-v3 draft-preview legacy-fallback alignment

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-draft-preview-legacy-fallback-alignment.md`

## 사용 skill
- `planning-gate-selector`: preview route + direct test 배치에 맞춰 `vitest + eslint + build + diff check`까지만 잠그는 검증 세트를 유지하는 데 사용
- `work-log-closeout`: preview route audit 결과와 실행/미실행 검증을 `/work` 형식으로 남기는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `draft-preview legacy-fallback` 축이 어긋나므로, `draft/preview` route와 직접 import surface만 점검하고 csv import, drafts list/save/delete, drafts UI로 번지지 않게 제한했다.

## 변경 이유
- 현재 dirty 중 가장 작은 coherent subset은 `src/app/api/planning/v3/draft/preview/route.ts`, `tests/planning-v3-draft-preview-api.test.ts`, wrapper 3개, `tests/planning-v3-drafts-remote-host-api.test.ts`였다.
- `draft/preview`는 same-origin 정리 외에도 legacy general draft fallback과 preview 전용 변환 `toPreviewDraft()`가 함께 들어 있어 `csv/drafts 전체`보다 별도 축으로 잠그는 편이 안전했다.
- 반면 `import/csv`, `drafts list/save/delete`, drafts UI는 preview route보다 훨씬 넓은 흐름이라 이번 라운드에서 열지 않았다.

## 핵심 변경
- 이번 라운드에서 추가 코드 수정은 하지 않았다.
- `src/app/api/planning/v3/draft/preview/route.ts`는 현재 dirty 기준으로 이미 다음 계약을 만족하고 있었다.
  - same-origin write guard: `assertSameOrigin(request)` + `requireCsrf(..., { allowWhenCookieMissing: true })`
  - wrapper import surface: `@/lib/planning/v3/draft/service`, `@/lib/planning/v3/draft/store`, `@/lib/planning/v3/profiles/store`
  - fallback 순서: `getPreviewDraft(draftId)` -> 없으면 `getLegacyDraft(draftId)` -> 있으면 `toPreviewDraft()`로 preview shape 변환
- `toPreviewDraft()`는 이번 라운드 기준으로 route 책임으로 남아도 된다.
  - `src/lib/planning/v3/draft/store.ts`와 `src/lib/planning/v3/draft/service.ts`는 thin alias이고, legacy general draft를 preview route 전용 `V3DraftRecord` shape로 맞추는 adapter는 preview fallback branch에서만 쓰인다.
  - 현재는 다른 caller가 이 변환을 재사용하지 않아 service/wrapper로 더 내릴 이유가 보이지 않았다.
- direct test 2개도 현재 계약과 맞았다.
  - `tests/planning-v3-draft-preview-api.test.ts`
    - inline patch preview contract 유지
    - `draftId + baseProfileId` 케이스에서 wrapper `createDraft`를 통해 legacy general draft를 만들고 preview route가 이를 정상 preview로 합성하는 계약 유지
  - `tests/planning-v3-drafts-remote-host-api.test.ts`
    - legacy general draft를 직접 만든 뒤 preview route가 same-origin remote host에서는 200으로 통과하고, cross-origin에서는 `ORIGIN_MISMATCH`로 막히는 계약 유지
- legacy source 조건부 포함 여부
  - `src/lib/planning/v3/drafts/draftStore.ts`는 열었다.
    - `createDraft()`가 `monthlyCashflow + draftPatch`를 갖는 legacy general draft를 쓰고 있음을 확인했고, preview route fallback이 이 shape를 받아 `toPreviewDraft()`로 정규화하는 이유를 설명할 수 있었다.
  - `src/lib/planning/server/store/profileStore.ts`는 열지 않았다.
    - `profiles/store` wrapper audit만으로 충분했다.

## 실제로 확인한 계약
- legacy fallback
  - preview route는 preview 전용 store record를 우선 읽고, 없으면 legacy general draft record를 읽어 compatibility branch로 처리한다.
  - 현재 direct test PASS 기준으로 이 fallback은 실제 사용 중인 계약이다.
- wrapper import
  - route는 `applyDraftToProfile`, `getPreviewDraft/getLegacyDraft`, `getProfile`을 모두 wrapper alias 경로에서 가져오고 있다.
  - thin alias wrapper 3개만으로 현재 import surface를 설명할 수 있었다.
- remote-host same-origin
  - preview route는 `tests/planning-v3-drafts-remote-host-api.test.ts` 안에서 same-origin remote host 허용, cross-origin `ORIGIN_MISMATCH` 차단을 이미 고정하고 있다.

## 검증
- 기준선 확인
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-draft-profile-route-same-origin-contract-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-route-same-origin-contract-followup.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-draft-profile-store-wrapper-alignment.md`
- 상태 잠금 / audit
  - `git branch --show-current`
  - `git status --short -- src/app/api/planning/v3/draft/preview/route.ts src/lib/planning/v3/draft/store.ts src/lib/planning/v3/draft/service.ts src/lib/planning/v3/profiles/store.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts src/lib/planning/v3/drafts/draftStore.ts src/lib/planning/server/store/profileStore.ts`
  - `git diff -- src/app/api/planning/v3/draft/preview/route.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts src/lib/planning/v3/draft/store.ts src/lib/planning/v3/draft/service.ts src/lib/planning/v3/profiles/store.ts`
  - `sed -n '1,260p' src/app/api/planning/v3/draft/preview/route.ts`
  - `sed -n '1,260p' tests/planning-v3-draft-preview-api.test.ts`
  - `sed -n '1,260p' tests/planning-v3-drafts-remote-host-api.test.ts`
  - `sed -n '1,220p' src/lib/planning/v3/draft/store.ts`
  - `sed -n '1,220p' src/lib/planning/v3/draft/service.ts`
  - `sed -n '1,220p' src/lib/planning/v3/profiles/store.ts`
  - `sed -n '1,260p' src/lib/planning/v3/drafts/draftStore.ts`
  - `rg -n "toPreviewDraft|getPreviewDraft|getDraft|applyDraftToProfile|assertSameOrigin|ORIGIN_MISMATCH|preview" src/app/api/planning/v3/draft/preview/route.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts src/lib/planning/v3/draft/store.ts src/lib/planning/v3/draft/service.ts src/lib/planning/v3/profiles/store.ts`
- 테스트
  - `pnpm exec vitest run tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts`
  - PASS (`2 files`, `5 tests`)
- eslint
  - `pnpm exec eslint src/app/api/planning/v3/draft/preview/route.ts src/lib/planning/v3/draft/store.ts src/lib/planning/v3/draft/service.ts src/lib/planning/v3/profiles/store.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts`
  - PASS
- build
  - `pnpm build`
  - PASS

## 미실행 검증
- wrapper/store 내부 구현 단위 테스트
  - 이번 라운드에서는 wrapper/legacy source를 수정하지 않아 추가 단위 테스트를 열지 않았다.
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- `toPreviewDraft()`가 아직 route 안에 있어 preview compatibility branch를 다시 건드릴 때는 adapter 책임을 route에 둘지 helper로 내릴지 다시 판단해야 한다. 이번 라운드에서는 preview route 전용 변환이라 그대로 두는 편이 더 작았다.
- `tests/planning-v3-drafts-remote-host-api.test.ts`는 preview뿐 아니라 excluded 범위인 drafts list/detail/create/delete도 함께 돌린다. 이번 라운드에서는 해당 route source를 다시 열지 않았고, preview same-origin contract 확인 용도로만 사용했다.
- csv import, drafts list/save/delete, drafts UI는 여전히 더 넓은 흐름이라 이번 preview route batch와 분리 유지가 필요하다.

## 다음 라운드 우선순위
1. `csv-parse`와 `drafts-upload-flow`는 그대로 바로 열지 말고, preview/save/list/import를 다시 1축씩 분해한 뒤 연다.
2. 이번 `draft-preview legacy-fallback alignment` 범위는 재오픈하지 않는다.
3. 이후 preview route를 다시 열더라도 fallback adapter와 remote-host guard만 최소 범위로 묶고, drafts list/save/import 전체로는 넓히지 않는다.
