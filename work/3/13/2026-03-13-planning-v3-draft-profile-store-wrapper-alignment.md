# 2026-03-13 planning-v3 draft-profile store-wrapper alignment

## 변경 파일
- `src/lib/planning/v3/draft/store.ts`
- `src/lib/planning/v3/profiles/store.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
- `src/app/api/planning/v3/draft/preview/route.ts`
- `src/app/api/planning/v3/draft/apply/route.ts`
- `tests/planning-v3/draft-store.test.ts`
- `tests/planning-v3-draft-preview-api.test.ts`
- `work/3/13/2026-03-13-planning-v3-draft-profile-store-wrapper-alignment.md`

## 사용 skill
- `planning-gate-selector`: wrapper/import surface 정렬에 맞는 최소 검증을 `vitest + eslint + build`로 고르기 위해 사용
- `work-log-closeout`: audit 결과, 실제 수정 범위, 실행 검증과 조건부 제외를 `/work` 형식으로 남기기 위해 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `draft/profile store wrapper` 축이 어긋나므로, 같은 dirty 브랜치에서 import surface 정렬만 닫고 더 넓은 wrapper 축으로 번지지 않게 잠갔다.

## 변경 이유
- 직전 `work/3/13/2026-03-13-planning-v3-store-helper-next-batch-breakdown.md`는 `ops/migrate`를 다음 구현 축으로 추천했지만, 더 넓은 정적 스캔에서 `src/lib/planning/v3/draft/store.ts`, `src/lib/planning/v3/draft/service.ts`, `src/lib/planning/v3/profiles/store.ts`가 untracked wrapper surface로 남아 있었고 draft/profile route들이 이미 이를 일부 import 중이었다.
- 이 3개 wrapper는 “나중에 쓸 파일”이 아니라 현재 `profile/drafts`, `profiles`, `draft preview/apply` route 계약의 일부라서, 내부 ops 축보다 먼저 import surface를 잠그는 편이 더 자연스러웠다.
- 이번 라운드는 user-facing 상태/문구/동작을 다시 열지 않고, wrapper를 first-class surface로 고정하는 최소 수정만 허용했다.

## wrapper 성격 정리
- `src/lib/planning/v3/draft/store.ts`
  - thin alias다.
  - `../drafts/draftStore`와 `../store/draftStore`의 기존 구현을 재export만 하고, 새 로직은 넣지 않았다.
  - 이번 라운드에서는 `createDraft` export만 추가해 draft/profile 범위의 caller test도 wrapper 경로를 바로 쓰게 했다.
- `src/lib/planning/v3/draft/service.ts`
  - thin alias다.
  - `saveDraftFromImport`, `applyDraftToProfile`, `buildDraftPatchFromCashflow`, `draftFromCashflow`, `draftScenarioSimulation`, `preflightDraftPatch`, `applyDraftPatchToProfile`를 그대로 재export하고 있었다.
  - audit 결과 별도 의미를 갖는 helper 조합으로 커지지 않아 수정하지 않았다.
- `src/lib/planning/v3/profiles/store.ts`
  - thin alias다.
  - `listProfileMetas`와 forbidden key guard helper만 노출하던 상태에서 `getProfile` 재export를 추가했다.
  - route 의미를 바꾸지 않고 profile lookup import surface만 wrapper로 모았다.

## 실제로 정리한 import surface
- `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
  - `getProfileDraft`, `preflightDraftPatch`는 이미 wrapper를 쓰고 있었고, `getProfile`만 `@/lib/planning/server/store/profileStore`를 직접 보고 있었다.
  - 이번 라운드에서 `getProfile`도 `@/lib/planning/v3/profiles/store`로 옮겼다.
- `src/app/api/planning/v3/draft/apply/route.ts`
  - `buildDraftPatchFromCashflow`는 `draft/service` wrapper를 이미 쓰고 있었지만, `getProfile`은 legacy profile store를 직접 import하고 있었다.
  - 이번 라운드에서 profile lookup도 wrapper로 통일했다.
- `src/app/api/planning/v3/draft/preview/route.ts`
  - `applyDraftToProfile`는 wrapper를 이미 쓰고 있었지만, `getProfile`은 legacy profile store를 직접 보고, legacy draft fallback도 `@/lib/planning/v3/drafts/draftStore`를 직접 import하고 있었다.
  - 이번 라운드에서 `getProfile`과 legacy fallback import 모두 wrapper 경유로 바꿨다.
  - 단, route 안의 fallback 의미 자체는 유지했다. `getPreviewDraft`가 못 찾을 때 legacy general draft를 `toPreviewDraft`로 변환하는 compatibility branch는 그대로 둬 thin alias wrapper를 무겁게 만들지 않았다.
- `tests/planning-v3/draft-store.test.ts`
  - direct store test가 `../../src/lib/planning/v3/drafts/draftStore`를 직접 import하던 것을 `../../src/lib/planning/v3/draft/store`로 바꿨다.
- `tests/planning-v3-draft-preview-api.test.ts`
  - fixture draft 생성 import를 `../src/lib/planning/v3/store/draftStore`에서 `../src/lib/planning/v3/draft/store`로 바꿨다.

## 조건부 제외 판단
- `src/app/api/planning/v3/drafts/[id]/create-profile/route.ts`
  - direct import chain이 wrapper 3개에 연결되지 않아 이번 라운드에서 다시 열지 않았다.
- `tests/planning-v3-draft-create-profile-api.test.ts`
  - 위 route가 제외라 같이 제외했다.
- `tests/planning-v3-profile-drafts-ui.test.tsx`
  - UI contract나 selector를 바꾸지 않아 제외했다.
- `tests/e2e/v3-draft-apply.spec.ts`
  - 브라우저 CTA/selector 변경이 없어 제외했다.
- `accounts/openingBalances/transactions/batches/balances/categories` wrapper
  - 이번 라운드에서 범위를 넓히지 않았다.

## 핵심 변경
- `draft/store`, `profiles/store`는 thin alias로 유지하고 필요한 재export만 추가했다.
- draft/profile 포함 route 안에서 `server/store/profileStore` direct import를 `profiles/store` wrapper로 줄였다.
- `draft/preview`의 legacy draft fallback도 wrapper 경유 import로 맞췄다.
- 포함 테스트 2개를 wrapper import surface 기준으로 정리했다.
- `draft/service`는 thin alias 상태와 현재 caller 계약이 이미 맞아 수정하지 않았다.

## 검증
- 정적 스캔
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-store-helper-next-batch-breakdown.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-profile-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-api-contract-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-user-facing-contract-followup.md`
  - `git branch --show-current`
  - `git status --short src/lib/planning/v3/draft/store.ts src/lib/planning/v3/draft/service.ts src/lib/planning/v3/profiles/store.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts src/app/api/planning/v3/profiles/route.ts src/app/api/planning/v3/drafts/route.ts src/app/api/planning/v3/drafts/[id]/route.ts src/app/api/planning/v3/draft/preview/route.ts src/app/api/planning/v3/draft/profile/route.ts src/app/api/planning/v3/draft/scenario/route.ts src/app/api/planning/v3/draft/apply/route.ts tests/planning-v3/draft-store.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts src/app/api/planning/v3/drafts/[id]/create-profile/route.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts`
  - `nl -ba src/lib/planning/v3/draft/store.ts | sed -n '1,220p'`
  - `nl -ba src/lib/planning/v3/draft/service.ts | sed -n '1,260p'`
  - `nl -ba src/lib/planning/v3/profiles/store.ts | sed -n '1,220p'`
  - `rg -n "draft/store|draft/service|profiles/store|profileDraftStore|profileDraftService|profileStore|profiles" src/app/api/planning/v3 src/lib/planning/v3 tests/planning-v3`
  - `rg -n "@/lib/planning/v3/store/draftStore|@/lib/planning/v3/drafts/draftStore|@/lib/planning/server/store/profileStore|@/lib/planning/v3/service/(saveDraftFromImport|applyDraftToProfile|buildDraftPatchFromCashflow|draftFromCashflow|draftScenarioSimulation|preflightDraftPatch|applyDraftPatchToProfile)" src/app/api/planning/v3/profile/drafts src/app/api/planning/v3/profiles/route.ts src/app/api/planning/v3/drafts src/app/api/planning/v3/draft`
  - 1차 스캔 결과: 포함 route 안에서 `draft/preview`, `draft/apply`, `profile/drafts/[id]/preflight`가 legacy profile store를 직접 import하고 있었고, `draft/preview`는 legacy draft fallback도 direct import로 들고 있었다.
- 테스트
  - `pnpm exec vitest run tests/planning-v3/draft-store.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts`
  - 1차 FAIL: `src/lib/planning/v3/profiles/store.ts`에 `getProfile` 중복 export가 남아 transform 실패
  - 중복 export 정리 후 재실행 PASS
- eslint
  - `pnpm exec eslint src/lib/planning/v3/draft/store.ts src/lib/planning/v3/draft/service.ts src/lib/planning/v3/profiles/store.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts src/app/api/planning/v3/profiles/route.ts src/app/api/planning/v3/drafts/route.ts src/app/api/planning/v3/drafts/[id]/route.ts src/app/api/planning/v3/draft/preview/route.ts src/app/api/planning/v3/draft/profile/route.ts src/app/api/planning/v3/draft/scenario/route.ts src/app/api/planning/v3/draft/apply/route.ts tests/planning-v3/draft-store.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts`
  - PASS
- build
  - `pnpm build`
  - 1차 FAIL: 수정 전 stale build process가 `profiles/store` 중복 export와 `draft/preview` 중복 import를 보고함
  - 최신 파일 기준으로 재실행 PASS
- diff check
  - `git diff --check -- src/lib/planning/v3/draft/store.ts src/lib/planning/v3/profiles/store.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/draft/preview/route.ts src/app/api/planning/v3/draft/apply/route.ts tests/planning-v3/draft-store.test.ts tests/planning-v3-draft-preview-api.test.ts work/3/13/2026-03-13-planning-v3-draft-profile-store-wrapper-alignment.md`

## 미실행 검증
- `pnpm exec vitest run tests/planning-v3-draft-create-profile-api.test.ts`
  - direct import chain이 wrapper 3개에 직접 연결되지 않아 제외
- `pnpm exec vitest run tests/planning-v3-profile-drafts-ui.test.tsx`
  - UI contract 변경이 없어 제외
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
  - selector/CTA 변경이 없어 제외
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- `draft/preview`는 여전히 route 안에 legacy general draft fallback 변환(`toPreviewDraft`)을 들고 있다. 이번 라운드는 import surface만 wrapper 경유로 잠갔고, 이 compatibility branch 자체는 리팩터링하지 않았다.
- `draft/service`는 thin alias 상태로 충분했지만, excluded 범위인 `create-profile`, `profileDraftStore`, `profileDraftFromCashflow` 쪽 test/helper는 아직 legacy 경로를 직접 쓸 수 있다.
- 이번 라운드는 accounts/openingBalances/transactions/batches/balances/categories wrapper를 의도적으로 열지 않았으므로, 다음 wrapper 정렬 라운드가 열리면 같은 방식으로 축을 다시 잠가야 한다.

## 다음 라운드 우선순위
1. `accounts/openingBalances/transactions/batches/balances/categories` wrapper는 별도 isolated batch로만 검토
2. `draft/preview` compatibility fallback을 더 줄일 필요가 생기면 preview 전용 후속으로 분리
3. 새 runtime 이슈가 없으면 이미 닫은 `quickstart/home`, `news/settings`, `txn-overrides`, `user-facing page`, `API contract`, `draft/profile` UI 후속은 다시 열지 않음
