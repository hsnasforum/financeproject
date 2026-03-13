# 2026-03-13 planning-v3 draft-profile follow-up

## 변경 파일
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
- `tests/planning-v3-profile-drafts-ui.test.tsx`
- `work/3/13/2026-03-13-planning-v3-draft-profile-followup.md`

## 사용 skill
- `planning-gate-selector`: draft/profile 배치에 맞춰 API 테스트, UI 테스트, 실제 변경 파일 eslint, build만 실행하도록 검증 범위를 고르기 위해 사용
- `work-log-closeout`: audit 결과, 실제 수정 범위, 실행한 검증과 다음 라운드를 `/work` 형식으로 남기기 위해 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 작업 축이 더 어긋나고 있으나, 이번 라운드는 같은 dirty 브랜치에서 `draft/profile` 사용자 흐름만 분리해 닫았다.

## 실제 mismatch 여부
- 있었다.
- route 응답 shape와 same-origin/CSRF 계약은 현재 테스트 기대치와 맞았지만, embedded `ProfileDraftDetailClient`는 프리플라이트를 아직 실행하지 않았을 때도 `에러 없음 / 경고 없음 / 변경 항목이 없습니다`처럼 읽히는 empty state를 보여줬다.
- 또 기준 프로필을 바꿔도 이전 프리플라이트 결과가 남아 있어, 현재 선택 기준과 다른 preflight 결과를 본 채 apply 의미를 추측해야 하는 상태였다.

## audit에 포함한 파일
- `src/app/api/planning/v3/profile/draft/route.ts`
- `src/app/api/planning/v3/profile/drafts/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts`
- `src/app/api/planning/v3/profiles/route.ts`
- `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
- `tests/planning-v3-profile-drafts-api.test.ts`
- `tests/planning-v3-profile-draft-preflight-api.test.ts`
- `tests/planning-v3-profile-draft-apply-api.test.ts`
- `tests/planning-v3-accounts-profile-remote-host-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`

## 제외 파일
- `src/app/api/planning/v3/draft/apply/route.ts`
- `src/app/api/planning/v3/draft/profile/route.ts`
- `src/app/api/planning/v3/draft/scenario/route.ts`
- `src/app/api/planning/v3/drafts/route.ts`
- `src/app/api/planning/v3/drafts/[id]/route.ts`
- `src/app/planning/v3/drafts/**`
- `import/csv` 전체
- `batches` 전체
- `transactions` 전체
- `balances` 전체
- `news/settings` 전체
- `categories/journal/scenarios` 전체
- `quickstart/home/reports`
- `store/helper` 전체
- 새 엔진 도입
- 저장모델 변경
- route 추가
- docs 대량 수정
- `pnpm e2e:rc`
- `pnpm release:verify`
- `[조건부 제외 유지] src/app/api/planning/v3/draft/preview/route.ts`
- `[조건부 제외 유지] src/app/api/planning/v3/drafts/[id]/create-profile/route.ts`
- `[조건부 제외 유지] tests/planning-v3-draft-preview-api.test.ts`
- `[조건부 제외 유지] tests/planning-v3-draft-create-profile-api.test.ts`
- `[조건부 제외 유지] tests/e2e/v3-draft-apply.spec.ts`

## preflight / apply / detail 상태 정리
- `ProfileDraftDetailClient`
  - 프리플라이트를 아직 실행하지 않았을 때는 `에러 없음 / 경고 없음 / 변경 없음` 대신 `아직 프리플라이트를 실행하지 않았습니다.` 계열 empty state를 보여주도록 바꿨다.
  - apply CTA 아래에 현재 상태를 설명하는 안내 문구를 추가해, `아직 프리플라이트 필요 / 기준 프로필이 바뀌어 재실행 필요 / 오류로 적용 불가 / 경고 확인 후 적용 가능`을 분리했다.
  - apply 버튼은 현재 선택 기준과 일치하는 preflight 결과가 있고, 오류가 없을 때만 활성화되도록 좁혔다.
  - 기준 프로필 선택이 바뀌면 이전 preflight 결과와 apply result를 즉시 비워, stale preflight가 새 apply 기준처럼 보이지 않게 했다.
- `ProfileDraftPreflightClient`
  - profileId 입력이 바뀌면 이전 result/message를 비워, 현재 입력과 다른 결과가 그대로 남지 않게 했다.
- route 계약
  - `profile/draft`, `profile/drafts`, `profile/drafts/[id]`, `preflight`, `apply`, `profiles` route의 응답 shape와 same-origin/CSRF 계약은 현재 테스트와 맞아 수정하지 않았다.

## 핵심 변경
- embedded detail 화면의 `preflight 미실행` 상태를 `문제 없음`처럼 읽히지 않도록 정리했다.
- apply CTA를 `현재 선택 기준의 최신 preflight 결과`에만 연결되도록 좁혔다.
- standalone preflight 화면도 입력 변경 시 stale 결과를 비워 동일한 의미로 맞췄다.
- 관련 route/API 계약은 audit 결과 현재 구조와 테스트 기준이 맞아 수정하지 않았다.

## 검증
- `pnpm exec vitest run tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-profile-drafts-ui.test.tsx`
  - 1차 FAIL: UI test fixture의 `initialPreflight.targetProfileId`가 현재 선택값과 달라 새 guidance 문구와 맞지 않았음
  - fixture를 현재 선택값 기준으로 정리한 뒤 PASS
- `pnpm exec eslint src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-profile-drafts-ui.test.tsx`
  - PASS
- `pnpm build`
  - PASS
- `git diff --check -- src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-profile-drafts-ui.test.tsx work/3/13/2026-03-13-planning-v3-draft-profile-followup.md`
  - PASS

## 미실행 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
  - 미실행. 현재 spec은 excluded 범위인 legacy `/planning/v3/drafts` 흐름을 다루고 있어 이번 `profile/drafts` 배치의 직접 검증으로 쓰기 어렵다.
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- `profiles` GET remote-host 계약은 현재 route 코드와 기존 테스트 기준으로 문제를 찾지 못했지만, 이번 배치에서는 detail/preflight 상태 의미 정리에 집중해 별도 테스트 확장은 하지 않았다.
- `profile/drafts` detail 화면은 여전히 파일 크기가 커서, 다음 후속이 필요하면 `download/copy`나 `profile picker load 실패 안내`처럼 더 작은 축으로 다시 잘라야 한다.

## 다음 라운드 우선순위
- 다음 라운드는 `store/helper` 또는 다른 isolated planning-v3 bucket으로 이동하고, 이미 닫은 `quickstart/home`, `news/settings`, `txn-overrides follow-through`, `user-facing page`, `API contract`는 새 runtime 이슈가 없으면 다시 열지 않는다.
