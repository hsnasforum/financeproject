# 2026-03-19 N2 draft family facade split

## 변경 파일

- `src/lib/planning/v3/draft/store.ts`
- `src/app/api/planning/v3/drafts/route.ts`
- `src/app/api/planning/v3/drafts/[id]/route.ts`
- `src/app/api/planning/v3/profile/drafts/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
- `src/app/api/planning/v3/draft/preview/route.ts`
- `tests/planning-v3-draft-preview-api.test.ts`
- `tests/planning-v3-drafts-remote-host-api.test.ts`
- `tests/planning-v3-accounts-profile-remote-host-api.test.ts`
- `work/3/19/2026-03-19-n2-draft-family-facade-split.md`

## 사용 skill

- `planning-gate-selector`: draft store, user-facing API route, support route, targeted test 변경에 맞춰 필요한 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, facade split 결과와 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `CsvDraftRecord` owner와 `DraftProfileRecord` owner가 `src/lib/planning/v3/draft/store.ts` 하나에서 함께 노출되면서, `/drafts*`, `/profile/drafts*`, preview bridge가 모두 같은 facade를 읽는 것처럼 보였다.
- 이번 라운드는 writer owner를 바꾸지 않고, user-facing route가 자기 owner family에 더 가까운 store를 직접 읽게 하고 shared facade는 bridge/compat 용도라는 점을 더 분명히 읽히게 만드는 것이 목적이었다.
- stable apply/create-profile bridge는 유지하되, csv draft / profile draft / shared bridge의 경계를 코드와 테스트에서 같이 보이게 해야 했다.

## 핵심 변경

- `src/lib/planning/v3/draft/store.ts`를 `CsvDraftRecord owner facade`, `DraftProfileRecord owner facade`, `Shared bridge for preview/apply compatibility paths` 세 구역으로 나눠 alias를 명시했다.
- `/api/planning/v3/drafts`와 `/api/planning/v3/drafts/[id]`는 더 이상 shared facade를 통하지 않고 `src/lib/planning/v3/drafts/draftStore.ts`를 직접 읽도록 바꿨다.
- `/api/planning/v3/profile/drafts`, `/api/planning/v3/profile/drafts/[id]`, `/api/planning/v3/profile/drafts/[id]/preflight`는 `src/lib/planning/v3/store/draftStore.ts`를 직접 읽도록 바꿨다.
- support/internal route인 `/api/planning/v3/draft/preview`는 shared facade를 유지하되 `getProfileDraftBridge` + `getLegacyDraft` 조합을 사용해 bridge 성격이 코드에서 더 읽히도록 정리했다.
- preview/remote-host/profile remote-host 테스트의 store import도 owner family에 맞춰 direct store로 바꿔, csv draft / profile draft direct owner와 shared bridge의 역할 차이를 테스트 코드에서도 맞췄다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3/api-drafts-route.test.ts tests/planning-v3/api-drafts-id-route.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3/draft-store.test.ts tests/planning-v3-profileDraftStore.test.ts`
- `pnpm build`
- `git diff --check -- src/lib/planning/v3/draft/store.ts src/lib/planning/v3/drafts/draftStore.ts src/lib/planning/v3/store/draftStore.ts src/app/api/planning/v3/drafts/route.ts src/app/api/planning/v3/drafts/[id]/route.ts src/app/api/planning/v3/drafts/[id]/create-profile/route.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/draft/preview/route.ts src/app/api/planning/v3/draft/apply/route.ts src/app/api/planning/v3/draft/profile/route.ts src/app/api/planning/v3/draft/scenario/route.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- 이번 라운드는 facade import와 bridge alias를 더 읽히게 만든 수준이라, `src/lib/planning/v3/draft/store.ts` 자체를 완전히 bridge-only module로 축소한 것은 아니다.
- `/api/planning/v3/profile/drafts/[id]/apply`와 `/api/planning/v3/drafts/[id]/create-profile`는 stable profile apply/create-profile bridge 성격을 유지하므로, 후속 라운드에서 stable owner handoff를 더 엄격히 잠그려면 service naming과 operator note까지 같이 정리해야 할 수 있다.
- 워크트리에는 이전 planning/v3 배치 변경과 unrelated dirty 파일이 함께 남아 있으므로, 후속 commit 시 이번 facade split 범위를 더 엄격히 분리해야 한다.
