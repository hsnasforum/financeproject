# 2026-03-13 planning-v3 profile-drafts user-facing flow follow-up

## 변경 파일
- `tests/e2e/v3-draft-apply.spec.ts`
- `work/3/13/2026-03-13-planning-v3-profile-drafts-user-facing-flow-followup.md`

## 사용 skill
- `planning-gate-selector`: user-facing component/UI flow 배치에 맞춰 `vitest + eslint + build + narrow e2e + diff check`를 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: profile-drafts user-facing flow audit 결과, 실제 수정 범위, 실행/미실행 검증을 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `profile-drafts user-facing flow` 축이 어긋나므로, profile draft -> drafts list -> draft detail -> preflight -> apply 흐름만 잠그고 import/csv, parser, news, txn-overrides, balances/accounts로 번지지 않게 제한했다.

## 변경 이유
- csv/drafts residue 3개는 이전 note들로 모두 정리됐고, 현재 남은 user-facing drafts/profile 표면은 `profile draft -> drafts list -> detail -> preflight -> apply` 흐름으로 묶는 편이 가장 자연스러웠다.
- 포함 컴포넌트 4개와 direct UI test를 audit한 결과, 현재 dirty 상태의 상태 문구/CTA/selector 변화는 이미 route contract와 맞아 있었다.
- 반면 포함된 narrow e2e `tests/e2e/v3-draft-apply.spec.ts`는 아직 legacy `/planning/v3/drafts` flow를 보고 있어 이번 batch 의미와 어긋났다.
- 따라서 이번 라운드의 실제 추가 수정은 e2e를 `profile-drafts` follow-through로 재정렬하는 것만으로 충분했다.

## 상태 문구 / CTA / selector / follow-through 정리
- `src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
  - batch-origin entry card 안 링크 surface를 body tone 기준으로 맞추고, `저장된 profile drafts`, `배치 목록`, `기존 draft 생성 화면` 동선을 명확히 유지하는 상태였다.
  - 이번 라운드에서는 audit만 했고 추가 수정은 하지 않았다.
- `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
  - list 화면은 `batchId -> 초안 생성 -> detail 이동` 흐름을 유지하면서 delete action을 즉시 confirm에서 dialog confirm으로 바꿔 follow-through를 분리한 상태였다.
  - 이번 라운드에서는 audit만 했다.
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
  - preflight 미실행 empty state, apply guidance, stale preflight reset, errors/warnings/changes empty state가 이미 현재 route contract와 맞아 있었다.
  - `preflight 먼저 실행`, `기준 변경으로 재실행 필요`, `오류로 apply 불가`, `경고 확인 후 apply 가능`을 구분하는 문구/버튼 조건이 유지되고 있었다.
- `src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
  - standalone preflight도 input 변경 시 이전 결과를 비우고, errors/warnings/changes empty state를 분리한 상태였다.
  - 이번 라운드에서는 audit만 했다.
- `tests/planning-v3-profile-drafts-ui.test.tsx`
  - batch entry link, standalone preflight empty-state guidance, detail apply guidance, embedded preflight selector가 이미 current UI 의미를 고정하고 있었다.
  - 이번 라운드에서는 추가 수정 없이 그대로 사용했다.
- `tests/e2e/v3-draft-apply.spec.ts`
  - 실제 추가 수정 파일이다.
  - legacy `/planning/v3/drafts` review/export flow를 제거하고, `/planning/v3/profile/drafts`에서 `batchId 입력 -> 초안 생성 -> detail 이동 -> base profile 선택 -> preflight -> apply -> /planning?profileId=... redirect`를 검증하도록 좁게 바꿨다.
  - mocked API도 이번 흐름에 필요한 범위만 유지했다.

## route source 조건부 포함 여부
- 열지 않았다.
- 아래 route source와 API test는 이번 라운드에서 다시 열지 않았다.
  - `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
  - `src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts`
  - `tests/planning-v3-profile-draft-preflight-api.test.ts`
  - `tests/planning-v3-profile-draft-apply-api.test.ts`
- 이유
  - current UI component와 existing route contract 사이에 새 mismatch가 보이지 않았고, user-facing 흐름은 direct UI test + narrow e2e만으로 설명 가능했다.

## 검증
- 기준선 확인
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-csv-upload-entry-ui-polish.md`
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-draft-profile-route-same-origin-contract-followup.md`
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-draft-profile-followup.md`
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-draft-profile-store-wrapper-alignment.md`
- 상태 잠금 / audit
  - `git status --short -- src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts`
  - `git diff -- src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts`
  - `sed -n '1,280p' src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
  - `sed -n '1,360p' src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
  - `sed -n '1,420p' src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
  - `sed -n '420,760p' src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
  - `sed -n '1,340p' src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
  - `sed -n '1,260p' tests/planning-v3-profile-drafts-ui.test.tsx`
  - `sed -n '1,280p' tests/e2e/v3-draft-apply.spec.ts`
  - `rg -n "v3-draft-apply-guidance|v3-draft-base-profile-picker|v3-draft-run-preflight|v3-draft-apply-profile|v3-preflight-summary|v3-drafts-list|초안 삭제 확인|프로필 생성\\(초안 적용\\)|프리플라이트 실행" src/app/planning/v3/profile tests/e2e tests`
- UI 테스트
  - `pnpm exec vitest run tests/planning-v3-profile-drafts-ui.test.tsx`
  - PASS (`1 file`, `5 tests`)
- eslint
  - `pnpm exec eslint src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts`
  - PASS
- build
  - `pnpm build`
  - PASS
- narrow e2e
  - `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
  - PASS (`1 test`)

## 미실행 검증
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- 포함 컴포넌트 4개는 현재 dirty 상태가 route contract와 맞아 추가 수정 없이 통과했지만, 이 상태가 더 커지면 다음에는 `delete dialog`, `download/copy`, `profile picker load failure`처럼 더 작은 UI 축으로 다시 잘라야 한다.
- `tests/e2e/v3-draft-apply.spec.ts`는 이번 라운드에서 `profile-drafts` flow로 맞췄지만 mocked API 기반이다. 실제 backend payload drift는 direct API batch에서 별도로 잡아야 한다.
- `src/components/ui/BodyTone.tsx`는 별도 dirty surface라 이번 라운드에서는 그대로 전제만 사용했다. body tone 공용 surface 자체를 다시 정리하는 라운드는 별도로 분리하는 편이 안전하다.

## 다음 라운드 우선순위
1. 새 runtime 이슈가 없으면 이번 `profile-drafts user-facing flow` 범위는 재오픈하지 않는다.
2. 다음 후속이 필요하면 `legacy drafts list/detail` 또는 `profile picker/load failure 안내`처럼 더 작은 user-facing 축으로 다시 자른다.
