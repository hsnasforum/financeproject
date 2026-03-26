# 2026-03-26 v3 import-to-planning beta draft-detail-preflight-report handoff copy alignment implementation

## 변경 파일
- `src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
- `tests/planning-v3-profile-drafts-ui.test.tsx`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-draft-detail-preflight-report-handoff-copy-alignment-implementation.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: draft detail/preflight surface의 copy와 CTA tier만 좁게 정리하고 apply/fetch contract는 그대로 두기 위해 사용.
- `planning-gate-selector`: UI text, href, user-flow 영향에 맞춰 UI 테스트, `pnpm planning:current-screens:guard`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`를 실행 세트로 고르기 위해 사용.
- `route-ssot-check`: `/planning/v3/profile/drafts/[id]`, `/planning/v3/profile/drafts/[id]/preflight`, stable `/planning/reports` 링크가 현재 route SSOT와 충돌하지 않는지 확인하기 위해 사용.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 미실행 조건부 검증, 남은 리스크를 오늘 `/work` 형식으로 정리하기 위해 사용.

## 변경 이유
- `batch detail -> balances -> drafts` handoff는 맞췄지만, draft detail / preflight / stable report 도착점의 helper copy와 CTA tier는 아직 같은 톤으로 닫히지 않았다.
- 이번 라운드는 draft detail / preflight / stable report 구간을 representative funnel의 마지막 follow-through surface로 정리하되, 실제 apply 동작이 `/planning?profileId=...`라는 점과 어긋나지 않게 맞추는 것이 목적이었다.

## 핵심 변경
- `ProfileDraftDetailClient` 상단을 `stable planning handoff 직전의 개별 초안 검토 surface`로 다시 쓰고, primary CTA를 `preflight 확인 -> stable report 확인 -> 초안 목록`으로 정리했다.
- 같은 화면에서 `stable report`는 즉시 이동이 아니라 `preflight/apply 뒤 planning 실행 저장 다음 확인하는 도착점`으로 명시해 실제 apply redirect와 문구가 어긋나지 않게 보정했다.
- `ProfileDraftPreflightClient` 상단을 `apply 직전 영향 범위 확인 surface`로 다시 쓰고, stable report 문맥을 `planning 반영 준비 뒤 이어지는 최종 도착점`으로 낮췄다.
- `ProfileDraftFromBatchClient`는 official funnel과 같은 tier가 아니라 `compat/raw draft preview surface`라는 점을 분명히 하고, support/internal 링크만 남겼다.
- `tests/planning-v3-profile-drafts-ui.test.tsx` 기대 문자열을 업데이트해 draft detail, preflight, compat/raw draft preview의 handoff copy와 support tier 분리를 정적 렌더 기준으로 검증했다.

## 검증
- `pnpm test tests/planning-v3-profile-drafts-ui.test.tsx tests/planning-v3-import-followthrough-ui.test.tsx`
- `pnpm planning:current-screens:guard`
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `git diff --check -- src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/planning-v3-import-followthrough-ui.test.tsx work/3/26/2026-03-26-v3-import-to-planning-beta-draft-detail-preflight-report-handoff-copy-alignment-implementation.md`
- `pnpm lint`는 exit code 0으로 통과했고, 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- [미실행] `pnpm test tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-preflightDraftPatch.test.ts` — 계산 로직이나 apply/preflight contract를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard 자체는 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- `stable report 확인` 링크는 최종 도착점을 가리키지만, 실제 apply 직후 이동은 여전히 `/planning?profileId=...`다. 이번 라운드는 이 차이를 문구로만 맞췄고, apply 후 자동 handoff 자체는 바꾸지 않았다.
- `tests/planning-v3-import-followthrough-ui.test.tsx`는 이번 라운드에서 재실행만 했고 수정하지 않았다. 이 파일이 아직 untracked 상태라면 별도 round의 작업 맥락과 함께 정리해야 한다.
- `pnpm lint`의 warning 25건은 이번 변경과 무관한 기존 상태라 그대로 남겼다.
