# 2026-03-13 planning-v3 draft-profile route same-origin-contract follow-up

## 변경 파일
- `tests/planning-v3-draft-profile-api.test.ts`
- `tests/planning-v3-draft-scenario-api.test.ts`
- `tests/planning-v3-profile-drafts-api.test.ts`
- `tests/planning-v3-profile-draft-preflight-api.test.ts`
- `tests/planning-v3-profile-draft-apply-api.test.ts`
- `work/3/13/2026-03-13-planning-v3-draft-profile-route-same-origin-contract-followup.md`

## 사용 skill
- `planning-gate-selector`: App Router API route contract 배치라 `vitest + eslint + build + diff check`까지만 잠그는 최소 검증 세트를 유지하는 데 사용
- `work-log-closeout`: route audit 결과, 실제 수정 파일, 실행/미실행 검증을 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `draft/profile route same-origin-contract` 축이 어긋나므로, route source 11개와 direct API test 범위만 잠그고 csv/import, preview fallback, drafts UI로 번지지 않게 제한했다.

## 변경 이유
- 직전 `news-route same-origin-contract` note가 다음 route/API batch도 same-origin/CSRF/import path 계약만 최소 범위로 묶으라고 남겼다.
- 현재 dirty route 11개는 공통적으로 `assertLocalHost` 제거, `onlyDev` 제거, `assertSameOrigin`, `requireCsrf(..., { allowWhenCookieMissing: true })`, `@/lib/planning/v3/...` import path 정리라는 같은 방향의 변화였다.
- 반면 `csv-parse`, `drafts-upload-flow`, `draft/preview`는 preview/save/list/import UI 흐름과 다시 붙을 가능성이 커서 이번 라운드에서 제외했다.
- audit 결과 route source 쪽 mismatch는 없었고, direct API test 일부가 remote-host same-origin / cross-origin contract를 직접 고정하지 않아 test coverage 공백만 최소 범위로 메우는 편이 가장 작았다.

## 핵심 변경
- route source 11개는 수정하지 않았다.
  - `src/app/api/planning/v3/draft/*`, `src/app/api/planning/v3/drafts/*`, `src/app/api/planning/v3/profile/draft*`, `src/app/api/planning/v3/profile/drafts*`는 이미 `assertSameOrigin` 중심으로 정렬돼 있었고, write 계열은 `requireCsrf(..., { allowWhenCookieMissing: true })`, draft list/detail read 계열은 same-origin read guard로 유지되고 있었다.
  - import path도 이번 라운드 기준으로 `@/lib/planning/v3/...` alias 경유 정리가 끝난 상태였다.
- direct API test 5개만 보강했다.
  - `tests/planning-v3-draft-profile-api.test.ts`: `POST /api/planning/v3/draft/profile`가 same-origin remote host에서는 정상 응답하고 cross-origin에서는 `ORIGIN_MISMATCH`로 막히는지 고정
  - `tests/planning-v3-draft-scenario-api.test.ts`: `POST /api/planning/v3/draft/scenario`가 cookie 없이도 same-origin + csrf body로 통과하고 cross-origin은 차단되는지 고정
  - `tests/planning-v3-profile-drafts-api.test.ts`: `GET/POST /api/planning/v3/profile/drafts`, `GET/DELETE /api/planning/v3/profile/drafts/[id]`의 same-origin remote host 허용과 cross-origin 차단을 한 파일에서 같이 고정
  - `tests/planning-v3-profile-draft-preflight-api.test.ts`: `POST /api/planning/v3/profile/drafts/[id]/preflight`의 same-origin/cross-origin 계약 고정
  - `tests/planning-v3-profile-draft-apply-api.test.ts`: `POST /api/planning/v3/profile/drafts/[id]/apply`의 same-origin/cross-origin 계약 고정
- 이번 라운드에서는 service/store wrapper를 조건부로 다시 열지 않았다.
  - `src/lib/planning/v3/draft/store.ts`
  - `src/lib/planning/v3/draft/service.ts`
  - `src/lib/planning/v3/profiles/store.ts`
  - route source diff와 direct API test만으로 same-origin / CSRF / import path 계약을 설명할 수 있었다.

## 실제로 정리한 계약
- same-origin
  - remote host라도 `host`, `origin`, `referer`가 같은 origin이면 허용된다.
  - cross-origin 요청은 `ORIGIN_MISMATCH`로 차단된다.
- CSRF
  - write 계열 route는 `requireCsrf(..., { allowWhenCookieMissing: true })`를 유지한다.
  - `draft/scenario`, `draft/profile`, `profile/drafts*`, `create-profile`, `draft/apply` 테스트는 body/query token만으로도 현재 계약이 유지되는지 확인했다.
- import path
  - 이번 라운드에서 route source import는 추가 수정하지 않았다.
  - audit 기준으로 old relative path나 `assertLocalHost`/`onlyDev` 잔존은 이번 route 11개 안에서 발견하지 않았다.

## 검증
- 기준선 확인
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-route-same-origin-contract-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-refresh-root-contract-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-profile-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-profile-store-wrapper-alignment.md`
- 상태 잠금 / audit
  - `git branch --show-current`
  - `git status --short -- src/app/api/planning/v3/draft/apply/route.ts src/app/api/planning/v3/draft/profile/route.ts src/app/api/planning/v3/draft/scenario/route.ts src/app/api/planning/v3/drafts/route.ts 'src/app/api/planning/v3/drafts/[id]/route.ts' 'src/app/api/planning/v3/drafts/[id]/create-profile/route.ts' src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts 'src/app/api/planning/v3/profile/drafts/[id]/route.ts' 'src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts' 'src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts' tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-draft-scenario-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts src/lib/planning/v3/draft/store.ts src/lib/planning/v3/draft/service.ts src/lib/planning/v3/profiles/store.ts`
  - `git diff -- src/app/api/planning/v3/draft/apply/route.ts src/app/api/planning/v3/draft/profile/route.ts src/app/api/planning/v3/draft/scenario/route.ts src/app/api/planning/v3/drafts/route.ts 'src/app/api/planning/v3/drafts/[id]/route.ts' 'src/app/api/planning/v3/drafts/[id]/create-profile/route.ts' src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts 'src/app/api/planning/v3/profile/drafts/[id]/route.ts' 'src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts' 'src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts'`
  - `git diff -- tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-draft-scenario-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - `rg -n "assertSameOrigin|requireCsrf|allowWhenCookieMissing|assertLocalHost|onlyDev|@/lib/planning/v3/" src/app/api/planning/v3/draft/apply/route.ts src/app/api/planning/v3/draft/profile/route.ts src/app/api/planning/v3/draft/scenario/route.ts src/app/api/planning/v3/drafts/route.ts 'src/app/api/planning/v3/drafts/[id]/route.ts' 'src/app/api/planning/v3/drafts/[id]/create-profile/route.ts' src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts 'src/app/api/planning/v3/profile/drafts/[id]/route.ts' 'src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts' 'src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts'`
- 테스트
  - `pnpm exec vitest run tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-draft-scenario-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - PASS (`8 files`, `30 tests`)
- eslint
  - `pnpm exec eslint src/app/api/planning/v3/draft/apply/route.ts src/app/api/planning/v3/draft/profile/route.ts src/app/api/planning/v3/draft/scenario/route.ts src/app/api/planning/v3/drafts/route.ts 'src/app/api/planning/v3/drafts/[id]/route.ts' 'src/app/api/planning/v3/drafts/[id]/create-profile/route.ts' src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts 'src/app/api/planning/v3/profile/drafts/[id]/route.ts' 'src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts' 'src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts' tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-draft-scenario-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - PASS
- build
  - `pnpm build`
  - PASS

## 미실행 검증
- `tests/planning-v3-profile-draft-v2-api.test.ts`
  - `src/app/api/planning/v3/profile/draft/route.ts`의 existing direct test지만, 이번 라운드는 사용자가 잠근 verification set과 dirty diff 기준을 우선해 route source audit만 수행했다.
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- `src/app/api/planning/v3/profile/draft/route.ts`는 same-origin + query csrf source audit만 했고, 위 미실행 direct test는 다시 돌리지 않았다. 이번 라운드에서 route source 수정은 없었지만, 이후 이 route를 다시 건드리면 `tests/planning-v3-profile-draft-v2-api.test.ts`까지 같이 잠그는 편이 안전하다.
- `tests/planning-v3-drafts-remote-host-api.test.ts`는 사용자가 포함한 검증 세트라 그대로 실행했지만, 내부에는 excluded 범위인 `draft/preview` guard도 함께 들어 있다. 이번 라운드에서는 해당 route source를 수정하지 않았다.
- csv import, drafts upload, drafts UI는 여전히 더 넓은 흐름이라 이번 same-origin contract note와 분리 유지가 필요하다.

## 다음 라운드 우선순위
1. `csv-parse`와 `drafts-upload-flow`는 그대로 바로 열지 말고, preview/save/list/import를 다시 1축씩 분해한 뒤 연다.
2. 이번 `draft-profile route same-origin-contract` 범위는 재오픈하지 않는다.
3. 후속 route/API batch가 열리더라도 same-origin/CSRF/import path contract만 최소 범위로 묶고, preview fallback이나 csv import 흐름과 섞지 않는다.
