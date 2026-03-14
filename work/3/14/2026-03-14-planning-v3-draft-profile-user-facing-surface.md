# 2026-03-14 planning-v3 draft-profile user-facing surface

## 변경 파일
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
- `tests/planning-v3-profile-drafts-ui.test.tsx`
- `tests/e2e/v3-draft-apply.spec.ts`
- `work/3/14/2026-03-14-planning-v3-draft-profile-user-facing-surface.md`

## 사용 skill
- `planning-gate-selector`: user-facing component/test 배치로 분류하고 `targeted vitest -> touched-file eslint -> build -> narrow e2e -> diff check` 순서만 실행하도록 검증 범위를 잠그는 데 사용
- `work-log-closeout`: audit-only 결론과 실제 수정 1건, 실행/미실행 검증, 남은 리스크를 오늘 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest note `work/3/14/2026-03-14-planning-v3-ops-migrate-golden-pipeline-contract.md`가 다음 우선순위 1번으로 `planning-v3 draft-profile user-facing surface`를 남겼다.
- 이번 라운드는 이미 닫힌 route contract, remote-host contract, news/import/runtime 축을 다시 열지 않고, legacy drafts + profile drafts의 user-facing surface만 `audit-first reopen`으로 다시 확인하는 것이 목적이었다.
- 포함 파일 정적 audit 결과 legacy drafts list/detail/profile entry 쪽에는 새 mismatch가 보이지 않았고, profile drafts detail/preflight 쪽에서만 실제 user-facing mismatch가 확인됐다.
- 실제 mismatch는 프리플라이트 실행 실패 뒤에도 summary/errors/warnings/changes 블록이 다시 `아직 프리플라이트를 실행하지 않았습니다.`로 돌아가, 실패와 미실행 상태가 비전문가 기준에서 섞여 보이는 점이었다.

## 핵심 변경
- legacy drafts (`DraftsListClient`, `DraftDetailClient`, `ProfileDraftClient`)는 재audit만 했고 추가 수정은 하지 않았다.
- `ProfileDraftDetailClient`와 standalone `ProfileDraftPreflightClient`는 프리플라이트 요청 실패 시 `null`로 되돌리지 않고 실패 sentinel state를 남겨, apply guidance와 summary/errors/warnings/changes 블록이 `미실행`이 아니라 `실행 실패` 의미를 유지하도록 바꿨다.
- detail 화면의 apply CTA는 실패 sentinel state에서도 계속 비활성화되며, 안내 문구를 `프리플라이트 실행이 실패했습니다. 같은 기준으로 다시 실행해 주세요.`로 좁혔다.
- `tests/planning-v3-profile-drafts-ui.test.tsx`에 standalone preflight 실패 상태와 embedded detail 실패 상태를 직접 고정하는 정적 UI test 2건을 추가했다.
- `tests/e2e/v3-draft-apply.spec.ts`에 detail 화면에서 preflight API가 500을 반환할 때 실패 banner와 failure help copy가 유지되는지 확인하는 narrow e2e 1건을 추가했다.
- page shell 파일은 `profile/draft/page.tsx`, `profile/drafts/[id]/page.tsx`, `profile/drafts/[id]/preflight/page.tsx`만 읽어 initial prop wiring을 확인했고 수정하지 않았다. selector 보강용 `data-testid` 추가도 열지 않았다.

## 검증
- 기준선 / audit
  - `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-ops-migrate-golden-pipeline-contract.md`
  - `sed -n '1,260p' work/3/14/2026-03-14-planning-v3-residue-rescan-next-batch-split.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-profile-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-profile-drafts-user-facing-flow-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-legacy-drafts-list-detail-user-facing-followup.md`
  - `git status --short -- src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-legacy-drafts-ui.test.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts`
  - `nl -ba src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx | sed -n '1,420p'`
  - `nl -ba src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx | sed -n '420,820p'`
  - `nl -ba src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx | sed -n '1,360p'`
  - `nl -ba tests/planning-v3-profile-drafts-ui.test.tsx | sed -n '1,360p'`
  - `nl -ba tests/e2e/v3-draft-apply.spec.ts | sed -n '1,360p'`
  - `nl -ba src/app/planning/v3/profile/draft/page.tsx | sed -n '1,220p'`
  - `nl -ba src/app/planning/v3/profile/drafts/[id]/page.tsx | sed -n '1,320p'`
  - `nl -ba src/app/planning/v3/profile/drafts/[id]/preflight/page.tsx | sed -n '1,260p'`
- 실행한 검증
  - `pnpm exec vitest run tests/planning-v3-legacy-drafts-ui.test.tsx tests/planning-v3-profile-drafts-ui.test.tsx`
  - PASS (`2 files`, `11 tests`)
  - `pnpm exec eslint src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-legacy-drafts-ui.test.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts`
  - PASS
  - `pnpm build`
  - PASS
  - `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
  - PASS (`2 tests`)
- 미실행 검증
  - `pnpm e2e:rc`
  - 전체 `pnpm test`
  - 전체 `pnpm lint`
  - `pnpm release:verify`

## 남은 리스크
- `ProfileDraftsListClient`는 목록 로드 실패 시 실패 메시지와 empty copy가 같이 보일 수 있다. 이번 라운드는 `preflight 실패 surface`만 닫기 위해 reopen하지 않았다.
- legacy drafts 쪽 direct UI test는 여전히 정적 markup 중심이라, list/detail/profile entry의 runtime follow-through는 별도 narrow e2e가 없다.
- detail/preflight failure state는 sentinel fallback으로 고정했지만, backend가 future에 structured failure payload를 추가하면 그 세부 문구까지 직접 노출하는 별도 후속이 필요할 수 있다.

## 다음 라운드 우선순위
1. `[가정] planning-v3 news search-refresh storage join point`
2. `planning-v3 txn-accounts-batches surface`
3. `[가정] planning-v3 profile-drafts list load-failure empty/help split`
