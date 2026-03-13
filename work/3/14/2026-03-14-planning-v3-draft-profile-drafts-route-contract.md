# 2026-03-14 planning-v3 draft-profile-drafts-route-contract

## 변경 파일
- 코드 추가 수정 없음
- close 범위로 다시 잠근 dirty subset
  - `src/app/api/planning/v3/profile/draft/route.ts`
  - `src/app/api/planning/v3/profile/drafts/route.ts`
  - `src/app/api/planning/v3/profile/drafts/[id]/route.ts`
  - `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
  - `src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts`
  - `tests/planning-v3-profile-drafts-api.test.ts`
  - `tests/planning-v3-profile-draft-preflight-api.test.ts`
  - `tests/planning-v3-profile-draft-apply-api.test.ts`
- `work/3/14/2026-03-14-planning-v3-draft-profile-drafts-route-contract.md`

## 사용 skill
- `planning-gate-selector`: 이번 배치를 App Router API route guard batch로 다시 분류하고 `vitest -> eslint -> diff check`까지만 실행하도록 검증 범위를 잠그는 데 사용
- `work-log-closeout`: rerun audit 결과, 실행한 검증, 남은 리스크, 다음 우선순위를 오늘 `/work` note 형식으로 남기는 데 사용

## 변경 이유
- 사용자 지시 기준선이 `work/3/14/2026-03-14-planning-v3-accounts-profile-remote-host-contract.md`였고, 그 note가 다음 실제 구현 1순위로 `draft/profile-drafts route contract`를 남겼다.
- 현재 dirty subset도 `profile/draft`와 `profile/drafts` route 5개, direct API tests 3개로 계속 응집돼 있어 same-origin / CSRF / route payload contract만 따로 재확인하기 적합했다.
- 이미 닫힌 accounts/profile remote-host contract, news 하위 배치, alerts root/store, transactions/import, runtime 축은 이번 라운드에서 다시 열지 않았다.

## 핵심 변경
- audit 결과, 이번 batch 범위의 current dirty diff는 이미 목적과 맞게 정렬돼 있었고 추가 코드 수정은 필요하지 않았다.
- 포함 route들은 모두 `assertSameOrigin(request)`와 `requireCsrf(..., { allowWhenCookieMissing: true })` 조합을 유지하고 있었고, `GET` 계열은 query `csrf`, `POST/DELETE` 계열은 body `csrf`를 사용하도록 일관돼 있었다.
- `tests/planning-v3-profile-drafts-api.test.ts`, `tests/planning-v3-profile-draft-preflight-api.test.ts`, `tests/planning-v3-profile-draft-apply-api.test.ts`는 create/list/detail/delete/preflight/apply의 same-origin remote-host 허용, cross-origin 차단, 그리고 detail delete의 query-only csrf fallback 차단까지 직접 고정하고 있었다.
- route payload semantics도 direct API test 기대와 충돌하지 않았다. drafts list/detail 응답 shape, preflight의 `targetProfileId`/`summary`, apply의 `profileId` 반환은 현재 test와 맞았다.
- 조건부 포함으로 `src/lib/planning/v3/draft/store.ts`, `src/lib/planning/v3/draft/service.ts`, `src/lib/planning/v3/profiles/store.ts`는 열지 않았다.

## 검증
- 기준선 / audit
  - `ls -1t work/3/14 | head -n 6`
  - `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-residue-rescan-next-batch-split.md`
  - `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-accounts-profile-remote-host-contract.md`
  - `git status --short -- src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - `git diff --stat -- src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - `nl -ba src/app/api/planning/v3/profile/draft/route.ts | sed -n '1,240p'`
  - `nl -ba src/app/api/planning/v3/profile/drafts/route.ts | sed -n '1,260p'`
  - `nl -ba src/app/api/planning/v3/profile/drafts/[id]/route.ts | sed -n '1,300p'`
  - `nl -ba src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts | sed -n '1,260p'`
  - `nl -ba src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts | sed -n '1,260p'`
  - `nl -ba tests/planning-v3-profile-drafts-api.test.ts | sed -n '1,420p'`
  - `nl -ba tests/planning-v3-profile-draft-preflight-api.test.ts | sed -n '1,320p'`
  - `nl -ba tests/planning-v3-profile-draft-apply-api.test.ts | sed -n '1,320p'`
- 실행한 검증
  - `pnpm exec vitest run tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - PASS (`3 files`, `17 tests`)
  - `pnpm exec eslint src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
  - PASS
- 미실행 검증
  - `pnpm build` (`route source 수정`이 이번 라운드에 실제로 생기지 않아 실행하지 않음)
  - `pnpm e2e:rc`
  - `pnpm release:verify`
  - 전체 `pnpm test`
  - 전체 `pnpm lint`

## 남은 리스크
- 이번 batch의 direct API tests 3개는 `profile/draft/route.ts`를 직접 unit-like하게 고정하지 않으므로, 이 endpoint 단독 회귀는 residual risk로 남는다.
- preflight/apply tests는 same-origin success와 cross-origin 403은 고정하지만, `dev_csrf` cookie가 실제로 있는 상황의 `CSRF_MISMATCH` 실패 분기는 직접 고정하지 않는다.

## 다음 라운드 우선순위
1. `transactions/batches/import user-facing contract`
