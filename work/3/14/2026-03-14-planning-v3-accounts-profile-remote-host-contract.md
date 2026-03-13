# 2026-03-14 planning-v3 accounts-profile-remote-host-contract

## 변경 파일
- 실제 수정
  - `src/app/api/planning/v3/profile/drafts/[id]/route.ts`
  - `tests/planning-v3-profile-drafts-api.test.ts`
  - `tests/planning-v3-accounts-profile-remote-host-api.test.ts`
- audit로 확인한 포함 subset
  - `src/app/api/planning/v3/accounts/route.ts`
  - `src/app/api/planning/v3/accounts/[id]/route.ts`
  - `src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts`
  - `src/app/api/planning/v3/opening-balances/route.ts`
  - `src/app/api/planning/v3/balances/monthly/route.ts`
  - `src/app/api/planning/v3/profile/draft/route.ts`
  - `src/app/api/planning/v3/profile/drafts/route.ts`
  - `src/app/api/planning/v3/profile/drafts/[id]/route.ts`
  - `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
  - `src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts`
  - `tests/planning-v3-accounts-profile-remote-host-api.test.ts`
  - `tests/planning-v3-user-facing-remote-host-api.test.ts`
  - `tests/planning-v3-profile-drafts-api.test.ts`
  - `tests/planning-v3-profile-draft-preflight-api.test.ts`
  - `tests/planning-v3-profile-draft-apply-api.test.ts`
- `work/3/14/2026-03-14-planning-v3-accounts-profile-remote-host-contract.md`

## 사용 skill
- `planning-gate-selector`: 이번 배치를 App Router API route guard 변경으로 분류하고 `vitest -> eslint -> build -> diff check` 검증 세트를 잠그는 데 사용
- `work-log-closeout`: 실제 수정 3파일과 실행한 검증, 다음 우선순위를 오늘 `/work` note 형식으로 정리하는 데 사용

## 변경 이유
- latest note `work/3/14/2026-03-14-planning-v3-alerts-store-root-contract.md`가 다음 실제 구현 1순위로 `accounts/profile remote-host contract`를 남겼다.
- current dirty subset도 accounts / opening-balances / balances-monthly / profile-drafts route와 direct API tests로 응집돼 있어, same-origin / CSRF / remote-host contract만 최소 수정으로 닫는 편이 가장 안전했다.
- 이미 닫힌 news 하위 배치, alerts root/store, draft/profile user-facing flow, transactions/import, runtime 축은 이번 라운드에서 다시 열지 않았다.

## 핵심 변경
- `src/app/api/planning/v3/profile/drafts/[id]/route.ts`의 `DELETE`는 write-side CSRF를 body 값만 받도록 정리했다. query string fallback을 제거해 같은 batch의 다른 write routes와 계약을 맞췄다.
- `tests/planning-v3-profile-drafts-api.test.ts`에 `dev_csrf` cookie가 있는 상황에서 query-only CSRF fallback이 더 이상 허용되지 않는다는 direct API test를 추가했다.
- `tests/planning-v3-accounts-profile-remote-host-api.test.ts`에 `GET /api/planning/v3/accounts/[id]/starting-balance`의 same-origin remote-host 허용과 cross-origin 차단을 추가해, accounts read route coverage를 `accounts / opening-balances / profile-draft(s)` 묶음으로 맞췄다.
- audit 결과, 포함 route들은 모두 `assertSameOrigin(request)`와 `requireCsrf(..., { allowWhenCookieMissing: true })` 조합으로 정렬돼 있었고, 추가 service/store 파일 확인은 필요하지 않았다.
- 조건부 포함으로 `src/lib/planning/v3/draft/store.ts`, `src/lib/planning/v3/draft/service.ts`, `src/lib/planning/v3/profiles/store.ts`는 열지 않았다. guard helper 확인을 위해 `src/lib/dev/devGuards.ts`만 읽었다.

## 검증
- 기준선 / audit
  - `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-alerts-store-root-contract.md`
  - `git status --short -- src/app/api/planning/v3/accounts/route.ts src/app/api/planning/v3/accounts/[id]/route.ts src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts src/app/api/planning/v3/opening-balances/route.ts src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - `git diff -- src/app/api/planning/v3/accounts/route.ts src/app/api/planning/v3/accounts/[id]/route.ts src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts src/app/api/planning/v3/opening-balances/route.ts src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - `rg -n "verifyRequestOrigin|assert.*Origin|allowWhenCookieMissing|requireCsrf|same-origin|origin" src/app/api/planning/v3/accounts src/app/api/planning/v3/opening-balances src/app/api/planning/v3/balances src/app/api/planning/v3/profile tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - `sed -n '1,260p' src/lib/dev/devGuards.ts`
- 실행한 검증
  - `pnpm exec vitest run tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - PASS (`5 files`, `21 tests`)
  - `pnpm exec eslint src/app/api/planning/v3/accounts/route.ts src/app/api/planning/v3/accounts/[id]/route.ts src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts src/app/api/planning/v3/opening-balances/route.ts src/app/api/planning/v3/balances/monthly/route.ts src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - PASS
  - `pnpm build`
  - PASS
- 미실행 검증
  - `pnpm e2e:rc`
  - `pnpm release:verify`
  - 전체 `pnpm test`
  - 전체 `pnpm lint`

## 남은 리스크
- 이번 라운드는 route guard contract만 닫았으므로, user-facing page caller에서 query-string CSRF에 의존한 숨은 호출이 있다면 별도 follow-up이 필요하다. 현재 범위 안의 direct API tests와 정적 스캔에서는 그런 caller를 찾지 못했다.
- `accounts` write-side remote-host contract 전체는 이번 포함 test 목록보다 더 넓은 별도 direct API test 묶음과도 연관될 수 있으므로, 다음 라운드에서 `draft/profile-drafts route contract`로 범위를 옮길 때는 다시 섞지 않도록 subset 잠금이 필요하다.

## 다음 라운드 우선순위
1. `draft/profile-drafts route contract`
2. `transactions/batches/import user-facing contract`
